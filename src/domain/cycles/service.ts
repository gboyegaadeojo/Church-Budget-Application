import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { adminCopy } from "@/copy/admin";
import { budgetCycles, deadlineExtensions, departments } from "@/db/schema";
import type { Tx } from "@/db/types";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { getChurchTimeZone, readSettings } from "@/domain/settings";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import { normalizeTaxRate, parseCAD, percentToTaxRate } from "@/lib/money";
import type { Role } from "@/lib/roles";
import { zonedLocalToUtc } from "@/lib/time-zone";
import { emailCycleStatus, emailDeadlineChanged, emailExtension } from "./emails";
import { deadlineEditable, transitionCycle, type CycleEvent } from "./status";

/**
 * Budget cycles (Requirements 4): create, open, close and reopen; change the deadline
 * with a reason; give one department an extension (4.3). Deadlines are entered in the
 * church time zone and stored in UTC.
 */

const c = adminCopy.cycles;
type CycleRow = typeof budgetCycles.$inferSelect;
type Options = { now?: Date };

const actorOf = (actor: Subject, actingRole: Role): AuditActor => ({
  kind: "user",
  userId: actor.id,
  actingRole,
});

async function loadCycle(tx: Tx, id: string): Promise<CycleRow> {
  const [row] = z.uuid().safeParse(id).success
    ? await tx.select().from(budgetCycles).where(eq(budgetCycles.id, id)).limit(1)
    : [];
  if (!row) throw new RuleError(adminCopy.common.notFound);
  return row;
}

async function bumpCycle(
  tx: Tx,
  id: string,
  version: number,
  actorId: string,
  set: Partial<typeof budgetCycles.$inferInsert>,
) {
  const rows = await tx
    .update(budgetCycles)
    .set({
      ...set,
      updatedByUserId: actorId,
      version: sql`${budgetCycles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(budgetCycles.id, id), eq(budgetCycles.version, version)))
    .returning({ id: budgetCycles.id });
  if (rows.length === 0) throw new ConflictError({ type: "budget_cycle", id });
}

/** A church-local deadline from a form, as UTC; must be in the future. */
async function futureDeadline(tx: Tx, local: string, field: string, now: Date): Promise<Date> {
  const zone = await getChurchTimeZone(tx);
  const at = zonedLocalToUtc(local ?? "", zone);
  if (!at) throw new ValidationError({ [field]: c.errors.deadlineInvalid });
  if (at.getTime() <= now.getTime())
    throw new ValidationError({ [field]: c.errors.deadlineFuture });
  return at;
}

function requireReason(reason: string | undefined): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) throw new ValidationError({ reason: adminCopy.common.reasonRequired });
  return trimmed;
}

const versionSchema = z.coerce.number().int().positive();
const iso = (d: Date | null) => d?.toISOString() ?? null;

// ---------------------------------------------------------------- create

const createSchema = z.object({
  name: z.string().trim().min(1, c.errors.nameRequired).max(50),
  budgetYear: z.coerce
    .number({ error: c.errors.yearInvalid })
    .int(c.errors.yearInvalid)
    .min(2000, c.errors.yearInvalid)
    .max(2100, c.errors.yearInvalid),
  startDate: z.iso.date({ error: c.errors.dateInvalid }),
  submissionDeadline: z.string(),
  taxRatePercent: z.string().optional(),
  boardTotal: z.string().optional(),
  boardReference: z.string().trim().max(200).optional(),
});

export async function createCycle(
  tx: Tx,
  actor: Subject,
  input: z.input<typeof createSchema>,
  { now = new Date() }: Options = {},
): Promise<{ id: string; name: string }> {
  const { actingRole } = assertCan(actor, "admin.cycles");
  const data = parseInput(createSchema, input);
  const deadline = await futureDeadline(tx, data.submissionDeadline, "submissionDeadline", now);

  let taxRate: string;
  if (data.taxRatePercent?.trim()) {
    const rate = percentToTaxRate(data.taxRatePercent);
    if (!rate) throw new ValidationError({ taxRatePercent: adminCopy.settings.errors.taxRate });
    taxRate = rate;
  } else {
    taxRate = normalizeTaxRate((await readSettings(tx, ["sales_tax_rate"])).sales_tax_rate);
  }

  let boardTotalCents: number | null = null;
  if (data.boardTotal?.trim()) {
    boardTotalCents = parseCAD(data.boardTotal);
    if (boardTotalCents === null)
      throw new ValidationError({ boardTotal: c.errors.boardTotalInvalid });
  }

  const taken = await tx
    .select({ id: budgetCycles.id })
    .from(budgetCycles)
    .where(eq(budgetCycles.budgetYear, data.budgetYear))
    .limit(1);
  if (taken.length > 0)
    throw new ValidationError({ budgetYear: c.errors.yearExists(data.budgetYear) });

  const [row] = await tx
    .insert(budgetCycles)
    .values({
      name: data.name,
      budgetYear: data.budgetYear,
      startDate: data.startDate,
      submissionDeadline: deadline,
      defaultTaxRate: taxRate,
      boardTotalCents,
      boardReference: data.boardReference || null,
      createdByUserId: actor.id,
    })
    .returning({ id: budgetCycles.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.cycle_created",
    entity: { type: "budget_cycle", id: row.id },
    cycleId: row.id,
    details: {
      after: {
        name: data.name,
        budgetYear: data.budgetYear,
        startDate: data.startDate,
        submissionDeadline: deadline.toISOString(),
        defaultTaxRate: taxRate,
        boardTotalCents,
        boardReference: data.boardReference || null,
      },
    },
  });
  return { id: row.id, name: data.name };
}

// ---------------------------------------------------------------- status

async function changeStatus(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; newDeadline?: string; reason?: string },
  event: CycleEvent,
  now: Date,
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.cycles");
  const { version } = parseInput(z.object({ version: versionSchema }), input);
  const cycle = await loadCycle(tx, input.id);
  let next;
  try {
    next = transitionCycle(cycle.status, event);
  } catch {
    throw new RuleError(c.errors.notAllowed(c.statusLabels[cycle.status]));
  }

  const set: Partial<typeof budgetCycles.$inferInsert> = { status: next };
  let reason: string | undefined;
  if (event === "reopen") {
    // A closed cycle reopens with a new deadline (4.3).
    reason = requireReason(input.reason);
    set.submissionDeadline = await futureDeadline(tx, input.newDeadline ?? "", "newDeadline", now);
  } else if (event === "open" && cycle.submissionDeadline.getTime() <= now.getTime()) {
    throw new RuleError(c.errors.deadlineFuture);
  }

  await bumpCycle(tx, cycle.id, version, actor.id, set);
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: `admin.cycle_${event === "open" ? "opened" : event === "close" ? "closed" : "reopened"}`,
    entity: { type: "budget_cycle", id: cycle.id },
    cycleId: cycle.id,
    reason,
    details: {
      before: { status: cycle.status, submissionDeadline: iso(cycle.submissionDeadline) },
      after: {
        status: next,
        submissionDeadline: iso(set.submissionDeadline ?? cycle.submissionDeadline),
      },
    },
  });
  await emailCycleStatus(
    tx,
    { ...cycle, submissionDeadline: set.submissionDeadline ?? cycle.submissionDeadline },
    event,
    reason,
  );
}

export const openCycle = (
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown },
  o: Options = {},
) => changeStatus(tx, actor, input, "open", o.now ?? new Date());

export const closeCycle = (
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown },
  o: Options = {},
) => changeStatus(tx, actor, input, "close", o.now ?? new Date());

export const reopenCycle = (
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; newDeadline: string; reason: string },
  o: Options = {},
) => changeStatus(tx, actor, input, "reopen", o.now ?? new Date());

// ---------------------------------------------------------------- deadlines (4.3)

/** Moves everyone's deadline, later or earlier, as long as it stays in the future. */
export async function changeDeadline(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; newDeadline: string; reason: string },
  { now = new Date() }: Options = {},
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.cycles");
  const { version } = parseInput(z.object({ version: versionSchema }), input);
  const cycle = await loadCycle(tx, input.id);
  if (!deadlineEditable(cycle.status)) throw new RuleError(c.errors.deadlineNotEditable);
  const reason = requireReason(input.reason);
  const deadline = await futureDeadline(tx, input.newDeadline, "newDeadline", now);

  await bumpCycle(tx, cycle.id, version, actor.id, { submissionDeadline: deadline });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.cycle_deadline_changed",
    entity: { type: "budget_cycle", id: cycle.id },
    cycleId: cycle.id,
    reason,
    details: {
      before: { submissionDeadline: iso(cycle.submissionDeadline) },
      after: { submissionDeadline: deadline.toISOString() },
    },
  });
  // Reminders follow the stored deadline, so the daily job picks up the new date by itself.
  await emailDeadlineChanged(
    tx,
    { ...cycle, submissionDeadline: deadline },
    cycle.submissionDeadline,
    reason,
  );
}

/** Gives one department its own later deadline; a new extension replaces the old one. */
export async function extendDepartment(
  tx: Tx,
  actor: Subject,
  input: { cycleId: string; departmentId: string; newDeadline: string; reason: string },
  { now = new Date() }: Options = {},
): Promise<void> {
  const { actingRole } = assertCan(actor, "cycle.extend_deadline", {
    departmentId: input.departmentId,
  });
  const cycle = await loadCycle(tx, input.cycleId);
  if (cycle.status !== "open") throw new RuleError(c.errors.cycleNotOpen);
  const [department] = z.uuid().safeParse(input.departmentId).success
    ? await tx.select().from(departments).where(eq(departments.id, input.departmentId)).limit(1)
    : [];
  if (!department || department.status !== "active") {
    throw new ValidationError({ departmentId: c.errors.departmentInactive });
  }
  const reason = requireReason(input.reason);
  const deadline = await futureDeadline(tx, input.newDeadline, "newDeadline", now);
  if (deadline.getTime() <= cycle.submissionDeadline.getTime()) {
    throw new ValidationError({ newDeadline: c.errors.extensionAfterDeadline });
  }

  const [previous] = await tx
    .update(deadlineExtensions)
    .set({ supersededAt: now })
    .where(
      and(
        eq(deadlineExtensions.cycleId, cycle.id),
        eq(deadlineExtensions.departmentId, department.id),
        isNull(deadlineExtensions.supersededAt),
      ),
    )
    .returning({ newDeadline: deadlineExtensions.newDeadline });
  const [row] = await tx
    .insert(deadlineExtensions)
    .values({
      cycleId: cycle.id,
      departmentId: department.id,
      newDeadline: deadline,
      reason,
      grantedByUserId: actor.id,
    })
    .returning({ id: deadlineExtensions.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.deadline_extended",
    entity: { type: "deadline_extension", id: row.id },
    cycleId: cycle.id,
    departmentId: department.id,
    reason,
    details: {
      before: { deadline: iso(previous?.newDeadline ?? cycle.submissionDeadline) },
      after: { deadline: deadline.toISOString() },
    },
  });
  await emailExtension(tx, cycle, department, deadline, reason);
}

/** The deadline that applies to a department: its extension if any, otherwise the cycle's (4.3). */
export async function effectiveDeadline(
  tx: Tx,
  cycleId: string,
  departmentId: string,
): Promise<Date> {
  const [extension] = await tx
    .select({ at: deadlineExtensions.newDeadline })
    .from(deadlineExtensions)
    .where(
      and(
        eq(deadlineExtensions.cycleId, cycleId),
        eq(deadlineExtensions.departmentId, departmentId),
        isNull(deadlineExtensions.supersededAt),
      ),
    )
    .orderBy(desc(deadlineExtensions.createdAt))
    .limit(1);
  if (extension) return extension.at;
  const cycle = await loadCycle(tx, cycleId);
  return cycle.submissionDeadline;
}
