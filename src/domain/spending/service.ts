import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { spendingCopy } from "@/copy/spending";
import {
  budgetCycles,
  budgetLineItems,
  departments,
  idempotencyKeys,
  spendingEntries,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf, parseKey, parseVersion, previousResult } from "@/domain/annual/service";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { approvedAnnualBudget, budgetFigures, impactOf } from "@/domain/expenses/budget";
import { writeAudit } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import { formatCAD } from "@/lib/money";
import { hasRole } from "@/lib/roles";
import { formatDate } from "@/lib/time-zone";
import { checkSpendingAlerts } from "./alerts";
import { queueSpendingEntryEmail } from "./entry-emails";
import { entrySchema, reasonSchema, type Entry } from "./schema";

/**
 * Spending entries (FR-24): the Church Administrator and the accountant record what was
 * spent against a department's budget, refunds included, correct an entry with a reason
 * (the previous values are kept in the audit trail) or void it with a reason. Nothing is
 * deleted. Permission → validation → rules → write → audit → alerts, in one transaction.
 *
 * Entries made from approved expenses (FR-42) follow their expense and aren't changed
 * here. Nothing can change once the cycle's spending period is locked (FR-29, AC-90).
 */

const e = spendingCopy.errors;
type Options = { now?: Date };
type Cycle = typeof budgetCycles.$inferSelect;
type EntryRow = typeof spendingEntries.$inferSelect;

/** The cycle's spending period: its budget year, to the spending period end if set. */
export function spendingPeriod(cycle: Pick<Cycle, "budgetYear" | "spendingPeriodEnd">) {
  return {
    from: `${cycle.budgetYear}-01-01`,
    to: cycle.spendingPeriodEnd ?? `${cycle.budgetYear}-12-31`,
  };
}

async function loadCycle(tx: Tx, id: string): Promise<Cycle> {
  const [cycle] = z.uuid().safeParse(id).success
    ? await tx.select().from(budgetCycles).where(eq(budgetCycles.id, id)).limit(1)
    : [];
  if (!cycle) throw new ValidationError({ cycleId: e.cycleNotFound });
  return cycle;
}

function assertOpen(cycle: Cycle) {
  if (cycle.spendingLockedAt) throw new RuleError(e.locked(cycle.name));
}

/**
 * Refuses when the cycle's spending is locked (FR-29, AC-90). Expenses call this before
 * they add or change a spending entry, so a locked year's ledger stays as it was.
 */
export async function assertSpendingOpen(tx: Tx, cycleId: string): Promise<void> {
  const [cycle] = await tx
    .select({ name: budgetCycles.name, lockedAt: budgetCycles.spendingLockedAt })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, cycleId))
    .for("share");
  if (cycle?.lockedAt) throw new RuleError(e.locked(cycle.name));
}

async function loadEntry(tx: Tx, id: string): Promise<EntryRow> {
  const [row] = z.uuid().safeParse(id).success
    ? await tx.select().from(spendingEntries).where(eq(spendingEntries.id, id)).for("update")
    : [];
  if (!row) throw new RuleError(e.notFound);
  return row;
}

/**
 * The checks every new or corrected entry passes (FR-24): the date within the spending
 * period (the accountant may allow another), the line belongs to the approved budget,
 * a duplicate is confirmed, a department without a budget is confirmed as Unbudgeted,
 * and an expense that takes the department over budget carries an overspend note.
 */
async function checkEntry(
  tx: Tx,
  actor: Subject,
  cycle: Cycle,
  departmentId: string,
  entry: Entry,
  options: { replacing?: EntryRow } = {},
): Promise<{ unbudgeted: boolean }> {
  const period = spendingPeriod(cycle);
  const outside = entry.spentOn < period.from || entry.spentOn > period.to;
  if (outside && !(entry.allowOutsideYear && hasRole(actor, "accountant", "backup_approver"))) {
    throw new ValidationError({
      spentOn: e.outsideYear(formatDate(period.from), formatDate(period.to)),
    });
  }

  const annual = await approvedAnnualBudget(tx, cycle.id, departmentId);
  if (!annual && !entry.confirmUnbudgeted) {
    throw new ValidationError({ confirmUnbudgeted: e.unbudgeted });
  }
  if (entry.budgetLineItemId) {
    const [line] = annual
      ? await tx
          .select({ id: budgetLineItems.id })
          .from(budgetLineItems)
          .where(
            and(
              eq(budgetLineItems.id, entry.budgetLineItemId),
              eq(budgetLineItems.budgetRequestId, annual.requestId),
              isNull(budgetLineItems.supersededAt),
            ),
          )
      : [];
    if (!line) throw new ValidationError({ budgetLineItemId: e.lineInvalid });
  }

  if (entry.referenceNumber && !entry.confirmDuplicate) {
    const [same] = await tx
      .select({ id: spendingEntries.id })
      .from(spendingEntries)
      .where(
        and(
          eq(spendingEntries.departmentId, departmentId),
          eq(spendingEntries.amountCents, entry.amount),
          eq(spendingEntries.spentOn, entry.spentOn),
          sql`lower(${spendingEntries.referenceNumber}) = ${entry.referenceNumber.toLowerCase()}`,
          eq(spendingEntries.status, "recorded"),
          options.replacing ? ne(spendingEntries.id, options.replacing.id) : undefined,
        ),
      )
      .limit(1);
    if (same) throw new ValidationError({ confirmDuplicate: e.duplicate });
  }

  if (annual && entry.entryType === "expense") {
    const figures = await budgetFigures(tx, cycle.id, departmentId);
    // A correction replaces the old amount rather than adding to it.
    const already =
      options.replacing?.status === "recorded"
        ? options.replacing.entryType === "refund"
          ? -options.replacing.amountCents
          : options.replacing.amountCents
        : 0;
    const impact = impactOf(figures, entry.amount, already);
    if (impact.overBy > 0 && !entry.overspendNote) {
      const [department] = await tx
        .select({ name: departments.name })
        .from(departments)
        .where(eq(departments.id, departmentId));
      throw new ValidationError({
        overspendNote: e.overspendRequired(department.name, formatCAD(impact.overBy)),
      });
    }
  }
  return { unbudgeted: !annual };
}

export type RecordResult = { entryId: string };

export async function recordEntry(
  tx: Tx,
  actor: Subject,
  input: EntryInputWithScope & { idempotencyKey: unknown },
  { now = new Date() }: Options = {},
): Promise<RecordResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<RecordResult>(tx, key, actor, "spending.record");
  if (repeat) return repeat;
  const { actingRole } = assertCan(actor, "spending.record");
  const cycle = await loadCycle(tx, String(input.cycleId ?? ""));
  assertOpen(cycle);
  const [department] = z.uuid().safeParse(input.departmentId).success
    ? await tx
        .select()
        .from(departments)
        .where(
          and(eq(departments.id, String(input.departmentId)), eq(departments.status, "active")),
        )
    : [];
  if (!department) throw new ValidationError({ departmentId: e.departmentNotFound });
  const entry = parseInput(entrySchema, input);
  const { unbudgeted } = await checkEntry(tx, actor, cycle, department.id, entry);
  const annual = await approvedAnnualBudget(tx, cycle.id, department.id);

  const [row] = await tx
    .insert(spendingEntries)
    .values({
      budgetCycleId: cycle.id,
      departmentId: department.id,
      budgetRequestId: annual?.requestId ?? null,
      budgetLineItemId: entry.budgetLineItemId,
      unbudgeted,
      entryType: entry.entryType,
      spentOn: entry.spentOn,
      payee: entry.payee,
      description: entry.description,
      amountCents: entry.amount,
      paymentMethod: entry.paymentMethod,
      referenceNumber: entry.referenceNumber,
      notes: entry.notes,
      overspendNote: entry.overspendNote,
      createdByUserId: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: spendingEntries.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "spending",
    eventType: "spending.entry_recorded",
    entity: { type: "spending_entry", id: row.id },
    departmentId: department.id,
    cycleId: cycle.id,
    details: { after: snapshot(entry, unbudgeted) },
  });
  await queueSpendingEntryEmail(tx, { kind: "recorded", entryId: row.id, actorId: actor.id, now });
  await checkSpendingAlerts(tx, cycle.id, department.id, { now });

  const result: RecordResult = { entryId: row.id };
  await tx
    .insert(idempotencyKeys)
    .values({ key, userId: actor.id, action: "spending.record", entityId: row.id, result });
  return result;
}

type EntryInputWithScope = Record<string, unknown> & {
  cycleId?: unknown;
  departmentId?: unknown;
};

function snapshot(entry: Entry, unbudgeted: boolean) {
  return {
    entryType: entry.entryType,
    spentOn: entry.spentOn,
    payee: entry.payee,
    description: entry.description,
    amountCents: entry.amount,
    paymentMethod: entry.paymentMethod,
    referenceNumber: entry.referenceNumber,
    budgetLineItemId: entry.budgetLineItemId,
    notes: entry.notes,
    overspendNote: entry.overspendNote,
    unbudgeted,
  };
}

function snapshotOf(row: EntryRow) {
  return {
    entryType: row.entryType,
    spentOn: row.spentOn,
    payee: row.payee,
    description: row.description,
    amountCents: row.amountCents,
    paymentMethod: row.paymentMethod,
    referenceNumber: row.referenceNumber,
    budgetLineItemId: row.budgetLineItemId,
    notes: row.notes,
    overspendNote: row.overspendNote,
    unbudgeted: row.unbudgeted,
  };
}

/** Corrects an entry with a reason; the previous values stay in the audit trail (FR-24). */
export async function correctEntry(
  tx: Tx,
  actor: Subject,
  input: Record<string, unknown> & { id: string; version: unknown; reason: unknown },
  { now = new Date() }: Options = {},
): Promise<void> {
  const { actingRole } = assertCan(actor, "spending.record");
  const row = await loadEntry(tx, input.id);
  if (row.expenseSubmissionId) throw new RuleError(e.fromExpense);
  if (row.status === "voided") throw new RuleError(e.alreadyVoided);
  const cycle = await loadCycle(tx, row.budgetCycleId);
  assertOpen(cycle);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "spending_entry", id: row.id });
  const reason = parseInput(z.object({ reason: reasonSchema }), { reason: input.reason }).reason;
  const entry = parseInput(entrySchema, input);
  const { unbudgeted } = await checkEntry(tx, actor, cycle, row.departmentId, entry, {
    replacing: row,
  });
  const before = snapshotOf(row);
  const after = snapshot(entry, unbudgeted);
  if (JSON.stringify(before) === JSON.stringify(after)) throw new RuleError(e.nothingChanged);

  const updated = await tx
    .update(spendingEntries)
    .set({
      budgetLineItemId: entry.budgetLineItemId,
      unbudgeted,
      entryType: entry.entryType,
      spentOn: entry.spentOn,
      payee: entry.payee,
      description: entry.description,
      amountCents: entry.amount,
      paymentMethod: entry.paymentMethod,
      referenceNumber: entry.referenceNumber,
      notes: entry.notes,
      overspendNote: entry.overspendNote,
      updatedByUserId: actor.id,
      updatedAt: now,
      version: sql`${spendingEntries.version} + 1`,
    })
    .where(and(eq(spendingEntries.id, row.id), eq(spendingEntries.version, version)))
    .returning({ id: spendingEntries.id });
  if (updated.length === 0) throw new ConflictError({ type: "spending_entry", id: row.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "spending",
    eventType: "spending.entry_corrected",
    entity: { type: "spending_entry", id: row.id },
    departmentId: row.departmentId,
    cycleId: row.budgetCycleId,
    reason,
    details: { before, after },
  });
  await queueSpendingEntryEmail(tx, {
    kind: "corrected",
    entryId: row.id,
    actorId: actor.id,
    reason,
    beforeCents: row.amountCents,
    now,
  });
  await checkSpendingAlerts(tx, row.budgetCycleId, row.departmentId, { now });
}

/** Voids an entry with a reason: it stays visible, labelled Voided, out of Spent (AC-87). */
export async function voidEntry(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; reason: unknown },
  { now = new Date() }: Options = {},
): Promise<void> {
  const { actingRole } = assertCan(actor, "spending.record");
  const row = await loadEntry(tx, input.id);
  if (row.expenseSubmissionId) throw new RuleError(e.fromExpense);
  if (row.status === "voided") throw new RuleError(e.alreadyVoided);
  const cycle = await loadCycle(tx, row.budgetCycleId);
  assertOpen(cycle);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "spending_entry", id: row.id });
  const reason = parseInput(z.object({ reason: reasonSchema }), { reason: input.reason }).reason;
  const updated = await tx
    .update(spendingEntries)
    .set({
      status: "voided",
      voidReason: reason,
      updatedByUserId: actor.id,
      updatedAt: now,
      version: sql`${spendingEntries.version} + 1`,
    })
    .where(and(eq(spendingEntries.id, row.id), eq(spendingEntries.version, version)))
    .returning({ id: spendingEntries.id });
  if (updated.length === 0) throw new ConflictError({ type: "spending_entry", id: row.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "spending",
    eventType: "spending.entry_voided",
    entity: { type: "spending_entry", id: row.id },
    departmentId: row.departmentId,
    cycleId: row.budgetCycleId,
    reason,
    details: {
      before: { status: "recorded" },
      after: { status: "voided" },
      amountCents: row.amountCents,
    },
  });
  await queueSpendingEntryEmail(tx, {
    kind: "voided",
    entryId: row.id,
    actorId: actor.id,
    reason,
    now,
  });
}
