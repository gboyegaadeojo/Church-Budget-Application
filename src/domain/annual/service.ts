import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { annualCopy } from "@/copy/annual";
import { nextReference } from "@/db/reference";
import {
  budgetCycles,
  budgetLineItems,
  budgetRequests,
  departments,
  idempotencyKeys,
  requestRevisions,
  userDepartments,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { effectiveDeadline } from "@/domain/cycles/service";
import { tidyName } from "@/domain/departments/matching";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { getChurchTimeZone, readSettings } from "@/domain/settings";
import { changedFields, writeAudit, type AuditActor } from "@/lib/audit";
import { assertCan, type Action, type Subject } from "@/lib/authz";
import { lineTotal, normalizeTaxRate, type TaxBreakdown } from "@/lib/money";
import type { Role } from "@/lib/roles";
import { formatDateTime } from "@/lib/time-zone";
import {
  requestContentSchema,
  submissionErrors,
  totalsOf,
  type LineContent,
  type RequestContent,
  type RequestContentInput,
} from "./schema";
export { totalsOf } from "./schema";
import { canTransition, InvalidTransitionError, transition, type AnnualEvent } from "./status";

/**
 * Annual budget requests, the requester's side (FR-03 to FR-12, FR-32). Every function
 * runs in the caller's transaction: permission → validation → state machine → write →
 * audit. Totals and tax are always recalculated here from the lines (AC-27).
 *
 * Draft events are audited without the `budget_request_id` link, because a draft can be
 * deleted (FR-05); the event still names the request in `entity_id`. From submission on,
 * events are linked and the request can never be deleted.
 */

const e = annualCopy.errors;
export const EDIT_LIMIT = 2;

type RequestRow = typeof budgetRequests.$inferSelect;
type Options = { now?: Date };

const actorOf = (actor: Subject, actingRole: Role): AuditActor => ({
  kind: "user",
  userId: actor.id,
  actingRole,
});

const versionSchema = z.coerce.number().int().positive();
const keySchema = z.uuid();

function parseVersion(value: unknown): number {
  return parseInput(z.object({ version: versionSchema }), { version: value }).version;
}

async function loadRequest(tx: Tx, id: string, lock = false): Promise<RequestRow> {
  if (!z.uuid().safeParse(id).success) throw new RuleError(e.notFound);
  const query = tx.select().from(budgetRequests).where(eq(budgetRequests.id, id)).limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new RuleError(e.notFound);
  return row;
}

function can(actor: Subject, action: Action, row: RequestRow) {
  return assertCan(actor, action, { departmentId: row.departmentId, annualStatus: row.status });
}

/** Changes the request only if nobody else changed it since `version` was read (DRD 11.2). */
async function updateRequest(
  tx: Tx,
  row: RequestRow,
  version: number,
  set: Partial<typeof budgetRequests.$inferInsert>,
): Promise<number> {
  const rows = await tx
    .update(budgetRequests)
    .set({ ...set, version: sql`${budgetRequests.version} + 1`, updatedAt: new Date() })
    .where(and(eq(budgetRequests.id, row.id), eq(budgetRequests.version, version)))
    .returning({ version: budgetRequests.version });
  if (rows.length === 0) throw new ConflictError({ type: "budget_request", id: row.id });
  return rows[0].version;
}

export async function linesOf(tx: Tx, requestId: string): Promise<LineContent[]> {
  const rows = await tx
    .select()
    .from(budgetLineItems)
    .where(eq(budgetLineItems.budgetRequestId, requestId))
    .orderBy(asc(budgetLineItems.sortOrder));
  return rows.map((r) => ({
    name: r.itemName,
    quantity: r.quantity,
    unitPriceCents: r.unitPriceCents,
    link: r.productUrl,
    notes: r.notes,
  }));
}

/** Replaces the request's working lines. Submitted versions live on in request_revisions. */
async function replaceLines(tx: Tx, requestId: string, lines: readonly LineContent[]) {
  await tx.delete(budgetLineItems).where(eq(budgetLineItems.budgetRequestId, requestId));
  if (lines.length === 0) return;
  await tx.insert(budgetLineItems).values(
    lines.map((line, sortOrder) => ({
      budgetRequestId: requestId,
      itemName: line.name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: lineTotal(line.quantity, line.unitPriceCents),
      productUrl: line.link,
      notes: line.notes,
      sortOrder,
    })),
  );
}

/** The sales tax rate for drafts and new submissions (FR-07a). */
export async function currentTaxRate(tx: Tx): Promise<string> {
  const { sales_tax_rate } = await readSettings(tx, ["sales_tax_rate"]);
  return normalizeTaxRate(sales_tax_rate);
}

export function editsRemaining(row: Pick<RequestRow, "editCount" | "extraEditsAllowed">): number {
  return Math.max(0, EDIT_LIMIT + row.extraEditsAllowed - row.editCount);
}

function snapshotOf(row: Pick<RequestRow, "title" | "justification">, lines: LineContent[]) {
  return { title: row.title, justification: row.justification, lines };
}

// ---------------------------------------------------------------- idempotency (FR-10)

async function previousResult<T>(
  tx: Tx,
  key: string,
  actor: Subject,
  action: string,
): Promise<T | null> {
  const [row] = await tx
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .limit(1);
  if (!row) return null;
  // A key belongs to one person and one action; anything else is a forged or reused key.
  if (row.userId !== actor.id || row.action !== action) {
    throw new ValidationError({ form: e.idempotencyKey });
  }
  return row.result as T;
}

function parseKey(value: unknown): string {
  const parsed = keySchema.safeParse(value);
  if (!parsed.success) throw new ValidationError({ form: e.idempotencyKey });
  return parsed.data;
}

// ---------------------------------------------------------------- start (FR-03, FR-38)

/**
 * Joins the person to the department if they don't represent it yet: Primary if it has
 * none, otherwise Representative (FR-38). Only verified Group Leaders may join when the
 * Planning Center check is on (FR-01a). Returns the subject with the department added.
 */
async function joinDepartment(
  tx: Tx,
  actor: Subject,
  actingRole: Role,
  department: typeof departments.$inferSelect,
): Promise<Subject> {
  const leaders = await tx
    .select()
    .from(userDepartments)
    .where(eq(userDepartments.departmentId, department.id));
  const mine = leaders.find((l) => l.userId === actor.id);
  if (mine) {
    return actor.departments.some((d) => d.id === department.id)
      ? actor
      : {
          ...actor,
          departments: [
            ...actor.departments,
            {
              id: department.id,
              name: department.name,
              representativeType: mine.representativeType,
            },
          ],
        };
  }

  const [person] = await tx.select().from(users).where(eq(users.id, actor.id)).limit(1);
  const { pco_require_for_requesters } = await readSettings(tx, ["pco_require_for_requesters"]);
  if (
    !person ||
    (pco_require_for_requesters === "true" &&
      (!person.pcoLeaderVerified || person.accessStatus === "suspended_not_leader"))
  ) {
    throw new RuleError(e.notLeader);
  }

  const type = leaders.some((l) => l.representativeType === "primary")
    ? "representative"
    : "primary";
  await tx.insert(userDepartments).values({
    userId: actor.id,
    departmentId: department.id,
    representativeType: type,
    source: "form_pick",
    assignedByUserId: actor.id,
  });
  if (person.accessStatus === "pending_department") {
    await tx
      .update(users)
      .set({ accessStatus: "active", updatedAt: new Date() })
      .where(eq(users.id, actor.id));
  }
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.department_leader_joined",
    entity: { type: "department", id: department.id },
    departmentId: department.id,
    details: {
      person: { id: actor.id, name: person.displayName },
      after: { slot: type },
      source: "form_pick",
    },
  });
  // TODO(step 7): email the administrator, who can remove them (FR-03).
  return {
    ...actor,
    departments: [
      ...actor.departments,
      { id: department.id, name: department.name, representativeType: type },
    ],
  };
}

/** The department picked on the form, or a Proposed one made from the typed name (FR-03). */
async function pickDepartment(
  tx: Tx,
  actor: Subject,
  actingRole: Role,
  input: { departmentId?: string; otherName?: string },
): Promise<typeof departments.$inferSelect> {
  if (input.departmentId) {
    const [row] = z.uuid().safeParse(input.departmentId).success
      ? await tx.select().from(departments).where(eq(departments.id, input.departmentId)).limit(1)
      : [];
    if (!row) throw new ValidationError({ departmentId: e.chooseDepartment });
    if (row.status !== "active" && row.status !== "proposed") {
      throw new ValidationError({ departmentId: e.departmentInactive });
    }
    return row;
  }

  const name = tidyName(input.otherName ?? "");
  if (name === "") {
    throw new ValidationError(
      input.otherName === undefined
        ? { departmentId: e.chooseDepartment }
        : { otherName: e.otherNameRequired },
    );
  }
  if (name.length > 80) throw new ValidationError({ otherName: e.otherNameTooLong });
  const [existing] = await tx
    .select()
    .from(departments)
    .where(
      and(
        sql`lower(${departments.name}) = ${name.toLowerCase()}`,
        sql`${departments.status} <> 'rejected'`,
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.status === "inactive") {
      throw new ValidationError({ otherName: e.departmentInactive });
    }
    return existing;
  }
  const [created] = await tx
    .insert(departments)
    .values({ name, status: "proposed", proposedByUserId: actor.id })
    .returning();
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.department_proposed",
    entity: { type: "department", id: created.id },
    departmentId: created.id,
    details: { after: { name, status: "proposed" } },
  });
  // TODO(step 7): email the administrator about the proposed department (FR-03, AC-14).
  return created;
}

export type StartResult = { requestId: string; departmentId: string; existing: boolean };

/**
 * Step 1 of the form: pick a department (or type a new one) for the open cycle. If the
 * department already has a request this cycle, the person joins it instead of starting
 * another (one per department per cycle, rule 1).
 */
export async function startRequest(
  tx: Tx,
  actor: Subject,
  input: { cycleId: string; departmentId?: string; otherName?: string },
): Promise<StartResult> {
  const { actingRole } = assertCan(actor, "annual.start");
  const [cycle] = z.uuid().safeParse(input.cycleId).success
    ? await tx.select().from(budgetCycles).where(eq(budgetCycles.id, input.cycleId)).limit(1)
    : [];
  if (!cycle || cycle.status !== "open") throw new RuleError(e.cycleNotOpen);

  const department = await pickDepartment(tx, actor, actingRole, input);
  await joinDepartment(tx, actor, actingRole, department);

  const [existing] = await tx
    .select({ id: budgetRequests.id })
    .from(budgetRequests)
    .where(
      and(
        eq(budgetRequests.budgetCycleId, cycle.id),
        eq(budgetRequests.departmentId, department.id),
      ),
    )
    .limit(1);
  if (existing) return { requestId: existing.id, departmentId: department.id, existing: true };

  const [created] = await tx
    .insert(budgetRequests)
    .values({
      budgetCycleId: cycle.id,
      departmentId: department.id,
      requesterUserId: actor.id,
      departmentNameSnapshot: department.name,
      title: "",
    })
    .returning({ id: budgetRequests.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "annual",
    eventType: "annual.draft_started",
    entity: { type: "budget_request", id: created.id },
    departmentId: department.id,
    cycleId: cycle.id,
    details: { after: { department: department.name, cycle: cycle.name } },
  });
  return { requestId: created.id, departmentId: department.id, existing: false };
}

// ---------------------------------------------------------------- drafts (FR-05)

export type DraftSaved = { version: number; rate: string; totals: TaxBreakdown };

/** Saves a draft (autosave or Save draft). Uses no edit and sends no email (FR-05). */
export async function saveDraft(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown } & RequestContentInput,
): Promise<DraftSaved> {
  const row = await loadRequest(tx, input.id);
  const { actingRole } = can(actor, "annual.edit_draft", row);
  if (row.status !== "draft") throw new RuleError(e.notDraft);
  const version = parseVersion(input.version);
  const content = parseInput(requestContentSchema, input);

  const newVersion = await updateRequest(tx, row, version, {
    title: content.title,
    justification: content.justification,
  });
  await replaceLines(tx, row.id, content.lines);
  const rate = await currentTaxRate(tx);
  const totals = totalsOf(content.lines, rate);
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "annual",
    eventType: "annual.draft_saved",
    entity: { type: "budget_request", id: row.id },
    departmentId: row.departmentId,
    cycleId: row.budgetCycleId,
    details: {
      summary: `${content.lines.length} items`,
      after: { subtotalCents: totals.subtotal },
    },
  });
  return { version: newVersion, rate, totals };
}

/** Deletes a draft that was never submitted (FR-05). Anything with history stays. */
export async function deleteDraft(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown },
): Promise<void> {
  const row = await loadRequest(tx, input.id, true);
  const { actingRole } = can(actor, "annual.delete_draft", row);
  if (row.status !== "draft") throw new RuleError(e.notDraft);
  if (row.referenceNumber !== null || row.versionNumber > 0) throw new RuleError(e.hasHistory);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "budget_request", id: row.id });

  const lines = await linesOf(tx, row.id);
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "annual",
    eventType: "annual.draft_deleted",
    entity: { type: "budget_request", id: row.id },
    departmentId: row.departmentId,
    cycleId: row.budgetCycleId,
    details: { before: snapshotOf(row, lines) },
  });
  await tx.delete(budgetLineItems).where(eq(budgetLineItems.budgetRequestId, row.id));
  await tx.delete(budgetRequests).where(eq(budgetRequests.id, row.id));
}

// ---------------------------------------------------------------- submit (FR-10, FR-11)

export type SubmitResult = {
  requestId: string;
  referenceNumber: string;
  submittedAt: string;
  rate: string;
  totals: TaxBreakdown;
  editsRemaining: number;
};

/**
 * Submits a draft after the preview is confirmed. The rate is snapshotted, the
 * reference assigned, and the version frozen in request_revisions, in one transaction.
 * A repeated idempotency key returns the first result (AC-38).
 */
export async function submitRequest(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown },
  options: Options = {},
): Promise<SubmitResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<SubmitResult>(tx, key, actor, "annual.submit");
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadRequest(tx, input.id, true);
  const { actingRole } = can(actor, "annual.submit", row);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "budget_request", id: row.id });
  const next = nextOrRefuse(row.status, "submit", e.notDraft);

  const [cycle] = await tx
    .select()
    .from(budgetCycles)
    .where(eq(budgetCycles.id, row.budgetCycleId))
    .limit(1);
  if (cycle.status !== "open") throw new RuleError(e.cycleNotOpen);
  await assertBeforeDeadline(tx, cycle.id, row.departmentId, now);
  const [department] = await tx
    .select({ status: departments.status })
    .from(departments)
    .where(eq(departments.id, row.departmentId));
  if (department.status !== "active" && department.status !== "proposed") {
    throw new RuleError(e.departmentInactive);
  }

  const lines = await linesOf(tx, row.id);
  const content: RequestContent = { title: row.title, justification: row.justification, lines };
  const errors = submissionErrors(content);
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  const rate = await currentTaxRate(tx);
  const totals = totalsOf(lines, rate);
  const referenceNumber = await nextReference(tx, "annual", cycle.budgetYear);
  await updateRequest(tx, row, version, {
    status: next,
    taxRate: rate,
    requestedSubtotalCents: totals.subtotal,
    requestedTaxCents: totals.tax,
    requestedTotalCents: totals.total,
    referenceNumber,
    submittedAt: now,
    versionNumber: 1,
  });
  await tx.insert(requestRevisions).values({
    budgetRequestId: row.id,
    revisionNumber: 1,
    kind: "submission",
    editedByUserId: actor.id,
    taxRate: rate,
    subtotalCents: totals.subtotal,
    taxCents: totals.tax,
    totalCents: totals.total,
    requestSnapshot: snapshotOf(row, lines),
  });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "annual",
    eventType: "annual.submitted",
    entity: { type: "budget_request", id: row.id },
    budgetRequestId: row.id,
    departmentId: row.departmentId,
    cycleId: row.budgetCycleId,
    details: {
      before: { status: row.status },
      after: { status: next, referenceNumber, taxRate: rate, totalCents: totals.total },
    },
  });
  // TODO(step 7): outbox the receipt to every representative and the accountant notice (FR-11).

  const result: SubmitResult = {
    requestId: row.id,
    referenceNumber,
    submittedAt: now.toISOString(),
    rate,
    totals,
    editsRemaining: editsRemaining(row),
  };
  await tx.insert(idempotencyKeys).values({
    key,
    userId: actor.id,
    action: "annual.submit",
    entityId: row.id,
    result,
  });
  return result;
}

function nextOrRefuse(from: RequestRow["status"], event: AnnualEvent, message: string) {
  try {
    return transition(from, event);
  } catch (error) {
    if (error instanceof InvalidTransitionError) throw new RuleError(message);
    throw error;
  }
}

/** The department's own deadline if extended, otherwise the cycle's (4.3, AC-136, AC-137). */
async function assertBeforeDeadline(tx: Tx, cycleId: string, departmentId: string, now: Date) {
  const deadline = await effectiveDeadline(tx, cycleId, departmentId);
  if (now.getTime() > deadline.getTime()) {
    throw new RuleError(e.deadlinePassed(formatDateTime(deadline, await getChurchTimeZone(tx))));
  }
}

// ---------------------------------------------------------------- revise (FR-12, FR-17)

export type ReviseResult = {
  requestId: string;
  versionNumber: number;
  rate: string;
  totals: TaxBreakdown;
  editsRemaining: number;
  usedEdit: boolean;
};

/**
 * Saves a confirmed change to a submitted request. A revision uses one of the request's
 * two edits, shared by every representative (FR-12, FR-32); answering a clarification
 * uses none (FR-17, AC-42). The rate snapshotted at submission stays (AC-34).
 */
export async function reviseRequest(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown } & RequestContentInput,
): Promise<ReviseResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<ReviseResult>(tx, key, actor, "annual.revise");
  if (repeat) return repeat;

  const row = await loadRequest(tx, input.id, true);
  const { actingRole } = can(actor, "annual.revise", row);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "budget_request", id: row.id });

  const responding = row.status === "returned";
  const event: AnnualEvent = responding ? "respond" : "revise";
  if (!canTransition(row.status, event)) throw new RuleError(e.notEditable);
  if (!responding && editsRemaining(row) === 0) throw new RuleError(e.noEditsLeft);

  const content = parseInput(requestContentSchema, input);
  const errors = submissionErrors(content);
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  const before = await linesOf(tx, row.id);
  const fieldChanges = changedFields(
    { title: row.title, justification: row.justification, lines: before },
    { title: content.title, justification: content.justification, lines: content.lines },
  );
  if (!fieldChanges && !responding) throw new RuleError(e.nothingChanged);

  const rate = row.taxRate!;
  const totals = totalsOf(content.lines, rate);
  const next = transition(row.status, event);
  const versionNumber = row.versionNumber + 1;
  const usedEdit = !responding;
  await updateRequest(tx, row, version, {
    status: next,
    title: content.title,
    justification: content.justification,
    requestedSubtotalCents: totals.subtotal,
    requestedTaxCents: totals.tax,
    requestedTotalCents: totals.total,
    editCount: row.editCount + (usedEdit ? 1 : 0),
    versionNumber,
  });
  await replaceLines(tx, row.id, content.lines);

  const changed = fieldChanges ? Object.keys(fieldChanges.after) : [];
  const changeSummary =
    changed.length === 0
      ? "No changes"
      : `Changed ${changed.join(", ")}; total ${row.requestedTotalCents} → ${totals.total} cents`;
  await tx.insert(requestRevisions).values({
    budgetRequestId: row.id,
    revisionNumber: versionNumber,
    kind: responding ? "clarification_response" : "revision",
    editedByUserId: actor.id,
    changeSummary,
    taxRate: rate,
    subtotalCents: totals.subtotal,
    taxCents: totals.tax,
    totalCents: totals.total,
    requestSnapshot: snapshotOf(content, content.lines),
  });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "annual",
    eventType: responding ? "annual.clarification_answered" : "annual.revised",
    entity: { type: "budget_request", id: row.id },
    budgetRequestId: row.id,
    departmentId: row.departmentId,
    cycleId: row.budgetCycleId,
    details: {
      before: { status: row.status, totalCents: row.requestedTotalCents, ...fieldChanges?.before },
      after: { status: next, totalCents: totals.total, ...fieldChanges?.after },
      versionNumber,
      usedEdit,
    },
  });
  // TODO(step 7): outbox the revision notice to the accountant and representatives (AC-44).

  const result: ReviseResult = {
    requestId: row.id,
    versionNumber,
    rate,
    totals,
    editsRemaining: editsRemaining({
      editCount: row.editCount + (usedEdit ? 1 : 0),
      extraEditsAllowed: row.extraEditsAllowed,
    }),
    usedEdit,
  };
  await tx.insert(idempotencyKeys).values({
    key,
    userId: actor.id,
    action: "annual.revise",
    entityId: row.id,
    result,
  });
  return result;
}
