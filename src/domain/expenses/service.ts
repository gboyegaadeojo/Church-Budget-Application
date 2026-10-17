import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { expensesCopy } from "@/copy/expenses";
import { nextReference } from "@/db/reference";
import {
  budgetCycles,
  budgetLineItems,
  departments,
  expenseItems,
  expenseReceiptFiles,
  expenseReceiptLines,
  expenseRevisions,
  expenseSubmissions,
  idempotencyKeys,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf, parseKey, parseVersion, previousResult } from "@/domain/annual/service";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { daysSetting, getChurchTimeZone, readSettings } from "@/domain/settings";
import { changedFields, writeAudit } from "@/lib/audit";
import { assertCan, type Action, type AuthzContext, type Subject } from "@/lib/authz";
import { lineTotal, normalizeTaxRate, type TaxBreakdown } from "@/lib/money";
import type { Role } from "@/lib/roles";
import { zonedDate } from "@/lib/time-zone";
import { approvedAnnualBudget, budgetFigures, impactOf, linkedCommitment } from "./budget";
import { queueExpenseEmails } from "./emails";
import {
  expenseContentSchema,
  expenseTotals,
  submissionErrors,
  type ExpenseContent,
  type ExpenseContentInput,
} from "./schema";
import {
  COMMITTED_STATUSES,
  ENDED_WITHOUT_CHARGE,
  InvalidExpenseTransitionError,
  transitionExpense,
  type ExpenseEvent,
  type ExpenseStatus,
  type ExpenseType,
} from "./status";

/**
 * Expense submissions, the requester's side (6B.3, FR-40 to FR-44). Every function runs
 * in the caller's transaction: permission → validation → state machine → write → audit
 * → outbox. Totals and tax are always recalculated here (FR-41).
 *
 * Draft events are audited without the submission link being permanent: a never-
 * submitted draft can be deleted. From submission on, nothing is deleted (FR-44).
 */

const e = expensesCopy.errors;

export type ExpenseRow = typeof expenseSubmissions.$inferSelect;
type Options = { now?: Date };

export async function loadExpense(tx: Tx, id: string, lock = false): Promise<ExpenseRow> {
  if (!z.uuid().safeParse(id).success) throw new RuleError(e.notFound);
  const query = tx.select().from(expenseSubmissions).where(eq(expenseSubmissions.id, id)).limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new RuleError(e.notFound);
  return row;
}

/** What permission rules need to know about an expense. */
export function authzContextOf(row: ExpenseRow): AuthzContext {
  return {
    departmentId: row.departmentId,
    payeeUserId: row.payeeUserId ?? undefined,
    requesterUserId: row.requesterUserId,
    // Reached the Board Chair: waiting for them or past them. A decline counts only if the
    // accountant had approved it first (the board declined it).
    sentToBoard:
      [
        "awaiting_board",
        "approved",
        "processing",
        "paid",
        "purchased",
        "closed",
        "cancelled",
      ].includes(row.status) ||
      (row.status === "declined" && row.approvedTotalCents !== null),
  };
}

export function canOn(actor: Subject, action: Action, row: ExpenseRow) {
  return assertCan(actor, action, authzContextOf(row));
}

/** Changes the submission only if nobody else changed it since `version` was read. */
export async function updateExpense(
  tx: Tx,
  row: ExpenseRow,
  version: number,
  set: Partial<typeof expenseSubmissions.$inferInsert>,
): Promise<number> {
  const rows = await tx
    .update(expenseSubmissions)
    .set({ ...set, version: sql`${expenseSubmissions.version} + 1`, updatedAt: new Date() })
    .where(and(eq(expenseSubmissions.id, row.id), eq(expenseSubmissions.version, version)))
    .returning({ version: expenseSubmissions.version });
  if (rows.length === 0) throw new ConflictError({ type: "expense_submission", id: row.id });
  return rows[0].version;
}

export function nextExpenseOrRefuse(row: ExpenseRow, event: ExpenseEvent, message: string) {
  try {
    return transitionExpense(row.status, event, row.type);
  } catch (error) {
    if (error instanceof InvalidExpenseTransitionError) throw new RuleError(message);
    throw error;
  }
}

export const auditBase = (row: Pick<ExpenseRow, "id" | "departmentId" | "budgetCycleId">) => ({
  entity: { type: "expense_submission", id: row.id },
  departmentId: row.departmentId,
  cycleId: row.budgetCycleId,
});

export async function storeIdempotent<T>(
  tx: Tx,
  key: string,
  actor: Subject,
  action: string,
  entityId: string,
  result: T,
): Promise<T> {
  await tx.insert(idempotencyKeys).values({ key, userId: actor.id, action, entityId, result });
  return result;
}

// ---------------------------------------------------------------- content

/** The submission's items or receipt lines and its other fields, as the form holds them. */
export async function contentOf(tx: Tx, row: ExpenseRow): Promise<ExpenseContent> {
  const items =
    row.type === "purchase_request"
      ? await tx
          .select()
          .from(expenseItems)
          .where(eq(expenseItems.expenseSubmissionId, row.id))
          .orderBy(asc(expenseItems.sortOrder))
      : [];
  const lines =
    row.type === "expense_claim"
      ? await tx
          .select()
          .from(expenseReceiptLines)
          .where(eq(expenseReceiptLines.expenseSubmissionId, row.id))
          .orderBy(asc(expenseReceiptLines.sortOrder))
      : [];
  return {
    title: row.title,
    justification: row.justification,
    items: items.map((i) => ({
      name: i.itemName,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      link: i.productUrl,
      annualLineItemId: i.annualLineItemId,
    })),
    howBought: row.howBought,
    lines: lines.map((l) => ({
      date: l.purchaseDate,
      vendor: l.vendor,
      description: l.description,
      amountCents: l.amountCents,
      receiptNumber: l.receiptNumber,
    })),
    linkedPurchaseRequestId: row.linkedPurchaseRequestId,
    payeeKind: row.payeeKind,
    payeeName: row.payeeName,
    payeeEmail: row.payeeEmail,
    paymentPreference: row.paymentPreference === "none" ? null : row.paymentPreference,
    noReceipt: row.noReceiptReason !== null,
    noReceiptReason: row.noReceiptReason,
    overBudgetExplanation: row.overBudgetExplanation,
    lateExplanation: row.lateClaimExplanation,
  };
}

/** Replaces the working items or lines. Submitted versions live on in expense_revisions. */
async function replaceRows(tx: Tx, row: ExpenseRow, content: ExpenseContent) {
  if (row.type === "purchase_request") {
    await tx.delete(expenseItems).where(eq(expenseItems.expenseSubmissionId, row.id));
    if (content.items.length > 0) {
      await tx.insert(expenseItems).values(
        content.items.map((item, sortOrder) => ({
          expenseSubmissionId: row.id,
          itemName: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          lineTotalCents: lineTotal(item.quantity, item.unitPriceCents),
          productUrl: item.link,
          annualLineItemId: item.annualLineItemId,
          sortOrder,
        })),
      );
    }
  } else {
    await tx.delete(expenseReceiptLines).where(eq(expenseReceiptLines.expenseSubmissionId, row.id));
    if (content.lines.length > 0) {
      await tx.insert(expenseReceiptLines).values(
        content.lines.map((line, sortOrder) => ({
          expenseSubmissionId: row.id,
          purchaseDate: line.date,
          vendor: line.vendor,
          description: line.description,
          amountCents: line.amountCents,
          receiptNumber: line.receiptNumber,
          sortOrder,
        })),
      );
    }
  }
}

/** The submission's own columns for this content (only the fields its type uses). */
function columnsOf(type: ExpenseType, content: ExpenseContent) {
  const claim = type === "expense_claim";
  return {
    title: content.title,
    justification: content.justification,
    howBought: claim ? null : content.howBought,
    linkedPurchaseRequestId: claim ? content.linkedPurchaseRequestId : null,
    payeeKind: claim ? content.payeeKind : null,
    payeeName: claim && content.payeeKind === "other" ? content.payeeName : null,
    payeeEmail: claim && content.payeeKind !== "church_card" ? content.payeeEmail : null,
    paymentPreference: claim
      ? content.payeeKind === "church_card"
        ? ("none" as const)
        : content.paymentPreference
      : null,
    noReceiptReason: claim ? content.noReceiptReason : null,
    overBudgetExplanation: content.overBudgetExplanation,
    lateClaimExplanation: claim ? content.lateExplanation : null,
  };
}

function parseContent(type: ExpenseType, input: ExpenseContentInput): ExpenseContent {
  const content = parseInput(expenseContentSchema, input);
  // The other type's rows are ignored rather than stored.
  return type === "purchase_request" ? { ...content, lines: [] } : { ...content, items: [] };
}

// ---------------------------------------------------------------- rules shared with review

export async function receiptCount(tx: Tx, expenseId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(expenseReceiptFiles)
    .where(
      and(
        eq(expenseReceiptFiles.expenseSubmissionId, expenseId),
        isNull(expenseReceiptFiles.removedAt),
      ),
    );
  return row.n;
}

/** The cycle can take new expenses: its spending period isn't locked (FR-29, FR-46). */
async function assertCycleOpenForSpending(tx: Tx, cycleId: string) {
  const [cycle] = await tx
    .select({ name: budgetCycles.name, lockedAt: budgetCycles.spendingLockedAt })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, cycleId));
  if (!cycle) throw new ValidationError({ cycleId: e.chooseCycle });
  if (cycle.lockedAt) throw new RuleError(e.spendingLocked(cycle.name));
  return cycle;
}

/** AC-78: expenses need the department's approved, released annual budget. */
async function assertHasBudget(tx: Tx, cycleId: string, departmentId: string, name: string) {
  const annual = await approvedAnnualBudget(tx, cycleId, departmentId);
  if (!annual) throw new RuleError(e.noBudget(name));
  return annual;
}

/**
 * A claim may close one approved purchase request of the same department and year that
 * isn't already claimed by another live claim (FR-40, FR-42).
 */
export async function assertLinkable(tx: Tx, row: ExpenseRow, purchaseRequestId: string | null) {
  if (!purchaseRequestId) return;
  const [pr] = await tx
    .select()
    .from(expenseSubmissions)
    .where(eq(expenseSubmissions.id, purchaseRequestId))
    .limit(1);
  const fine =
    pr &&
    pr.type === "purchase_request" &&
    pr.departmentId === row.departmentId &&
    pr.budgetCycleId === row.budgetCycleId &&
    (COMMITTED_STATUSES as readonly string[]).includes(pr.status);
  if (!fine) throw new ValidationError({ linkedPurchaseRequestId: e.linkedRequestInvalid });
  const [other] = await tx
    .select({ id: expenseSubmissions.id })
    .from(expenseSubmissions)
    .where(
      and(
        eq(expenseSubmissions.linkedPurchaseRequestId, purchaseRequestId),
        ne(expenseSubmissions.id, row.id),
        notInArray(expenseSubmissions.status, ["draft", ...ENDED_WITHOUT_CHARGE]),
      ),
    )
    .limit(1);
  if (other) throw new ValidationError({ linkedPurchaseRequestId: e.linkedRequestInvalid });
}

/** "From annual budget item" must be one of the department's approved annual lines. */
async function assertAnnualLines(tx: Tx, annualRequestId: string, content: ExpenseContent) {
  const ids = [...new Set(content.items.flatMap((i) => i.annualLineItemId ?? []))];
  if (ids.length === 0) return;
  const found = await tx
    .select({ id: budgetLineItems.id })
    .from(budgetLineItems)
    .where(
      and(inArray(budgetLineItems.id, ids), eq(budgetLineItems.budgetRequestId, annualRequestId)),
    );
  const known = new Set(found.map((f) => f.id));
  content.items.forEach((item, i) => {
    if (item.annualLineItemId && !known.has(item.annualLineItemId)) {
      throw new ValidationError({ [`items.${i}.annualLineItemId`]: e.annualLineInvalid });
    }
  });
}

/** Who is paid, worked out from the form: the requester themselves, someone named, or nobody. */
async function resolvePayee(tx: Tx, row: ExpenseRow, content: ExpenseContent) {
  if (row.type !== "expense_claim" || content.payeeKind === "church_card") {
    return { payeeUserId: null, payeeName: null, payeeEmail: null };
  }
  if (content.payeeKind === "self") {
    const [me] = await tx
      .select({ name: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, row.requesterUserId));
    return {
      payeeUserId: row.requesterUserId,
      payeeName: me.name,
      payeeEmail: content.payeeEmail ?? me.email,
    };
  }
  // FR-47: someone with an account is matched by email, so nobody approves paying themselves.
  const [match] = content.payeeEmail
    ? await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${content.payeeEmail}`)
        .limit(1)
    : [];
  return {
    payeeUserId: match?.id ?? null,
    payeeName: content.payeeName,
    payeeEmail: content.payeeEmail,
  };
}

/** Everything submitting or changing a submitted expense needs, checked on the server. */
async function checkForSubmission(
  tx: Tx,
  row: ExpenseRow,
  content: ExpenseContent,
  rate: string,
  now: Date,
) {
  const annual = await assertHasBudget(
    tx,
    row.budgetCycleId,
    row.departmentId,
    row.departmentNameSnapshot,
  );
  await assertAnnualLines(tx, annual.requestId, content);
  await assertLinkable(tx, row, content.linkedPurchaseRequestId);
  const totals = expenseTotals(row.type, content, rate);
  const figures = await budgetFigures(tx, row.budgetCycleId, row.departmentId);
  const impact = impactOf(
    figures,
    totals.total,
    await linkedCommitment(tx, content.linkedPurchaseRequestId),
  );
  const errors = submissionErrors(row.type, content, {
    today: zonedDate(now, await getChurchTimeZone(tx)),
    claimDeadlineDays: await daysSetting(tx, "claim_deadline_days"),
    receiptCount: await receiptCount(tx, row.id),
    overBy: impact.overBy,
  });
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return { totals, impact };
}

function snapshotOf(row: ExpenseRow, content: ExpenseContent, payee: object) {
  return { type: row.type, ...content, ...payee };
}

// ---------------------------------------------------------------- start (6B.3 steps 1-3)

export type StartExpenseResult = { expenseId: string };

/**
 * Starts a draft for one of the person's departments and a budget year where the
 * department has an approved, released annual budget (AC-78) and spending isn't locked.
 */
export async function startExpense(
  tx: Tx,
  actor: Subject,
  input: { type: unknown; departmentId: unknown; cycleId: unknown },
): Promise<StartExpenseResult> {
  const parsed = parseInput(
    z.object({
      type: z.enum(["purchase_request", "expense_claim"], { error: e.chooseType }),
      departmentId: z.uuid({ error: e.chooseDepartment }),
      cycleId: z.uuid({ error: e.chooseCycle }),
    }),
    input,
  );
  const { actingRole } = assertCan(actor, "expense.submit", { departmentId: parsed.departmentId });
  const [department] = await tx
    .select()
    .from(departments)
    .where(eq(departments.id, parsed.departmentId));
  if (!department || department.status !== "active") {
    throw new ValidationError({ departmentId: e.chooseDepartment });
  }
  const cycle = await assertCycleOpenForSpending(tx, parsed.cycleId);
  await assertHasBudget(tx, parsed.cycleId, department.id, department.name);

  const [created] = await tx
    .insert(expenseSubmissions)
    .values({
      type: parsed.type,
      budgetCycleId: parsed.cycleId,
      departmentId: department.id,
      departmentNameSnapshot: department.name,
      requesterUserId: actor.id,
      payeeKind: parsed.type === "expense_claim" ? "self" : null,
    })
    .returning({ id: expenseSubmissions.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.draft_started",
    entity: { type: "expense_submission", id: created.id },
    departmentId: department.id,
    cycleId: parsed.cycleId,
    details: { after: { type: parsed.type, department: department.name, cycle: cycle.name } },
  });
  return { expenseId: created.id };
}

// ---------------------------------------------------------------- drafts

export type ExpenseDraftSaved = { version: number; totals: TaxBreakdown };

/** Saves a draft (Save draft). Sends no email. */
export async function saveExpenseDraft(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown } & ExpenseContentInput,
): Promise<ExpenseDraftSaved> {
  const row = await loadExpense(tx, input.id);
  const { actingRole } = canOn(actor, "expense.submit", row);
  if (row.status !== "draft") throw new RuleError(e.notDraft);
  const version = parseVersion(input.version);
  const content = parseContent(row.type, input);

  const newVersion = await updateExpense(tx, row, version, columnsOf(row.type, content));
  await replaceRows(tx, row, content);
  const totals = expenseTotals(row.type, content, await currentRate(tx));
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.draft_saved",
    ...auditBase(row),
    details: {
      summary: `${content.items.length + content.lines.length} lines`,
      after: { totalCents: totals.total },
    },
  });
  return { version: newVersion, totals };
}

export async function deleteExpenseDraft(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown },
): Promise<void> {
  const row = await loadExpense(tx, input.id, true);
  const { actingRole } = canOn(actor, "expense.submit", row);
  if (row.status !== "draft") throw new RuleError(e.notDraft);
  if (row.referenceNumber !== null) throw new RuleError(e.hasHistory);
  if (row.version !== parseVersion(input.version)) {
    throw new ConflictError({ type: "expense_submission", id: row.id });
  }
  if ((await receiptCount(tx, row.id)) > 0) throw new RuleError(e.hasHistory);
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.draft_deleted",
    ...auditBase(row),
    details: { before: snapshotOf(row, await contentOf(tx, row), {}) },
  });
  await tx.delete(expenseItems).where(eq(expenseItems.expenseSubmissionId, row.id));
  await tx.delete(expenseReceiptLines).where(eq(expenseReceiptLines.expenseSubmissionId, row.id));
  await tx.delete(expenseSubmissions).where(eq(expenseSubmissions.id, row.id));
}

export async function currentRate(tx: Tx): Promise<string> {
  return normalizeTaxRate((await readSettings(tx, ["sales_tax_rate"])).sales_tax_rate);
}

// ---------------------------------------------------------------- submit (6B.3 steps 9-11)

export type SubmitExpenseResult = {
  expenseId: string;
  referenceNumber: string;
  submittedAt: string;
  totals: TaxBreakdown;
};

/**
 * Submits a draft after the preview is confirmed: rate snapshotted, reference assigned,
 * the version frozen in expense_revisions, in one transaction. A repeated idempotency key
 * returns the first result (FR-10). An over-budget submission is allowed with its
 * explanation (FR-43).
 */
export async function submitExpense(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown },
  options: Options = {},
): Promise<SubmitExpenseResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<SubmitExpenseResult>(tx, key, actor, "expenses.submit");
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const { actingRole } = canOn(actor, "expense.submit", row);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  const next = nextExpenseOrRefuse(row, "submit", e.notDraft);
  const cycle = await assertCycleOpenForSpending(tx, row.budgetCycleId);
  const [{ year }] = await tx
    .select({ year: budgetCycles.budgetYear })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, row.budgetCycleId));

  const content = await contentOf(tx, row);
  const rate = await currentRate(tx);
  const { totals, impact } = await checkForSubmission(tx, row, content, rate, now);
  const payee = await resolvePayee(tx, row, content);
  const referenceNumber = await nextReference(tx, "expense", year);
  await updateExpense(tx, row, version, {
    status: next,
    taxRate: rate,
    subtotalCents: totals.subtotal,
    taxCents: totals.tax,
    totalCents: totals.total,
    referenceNumber,
    submittedAt: now,
    ...payee,
  });
  await tx.insert(expenseRevisions).values({
    expenseSubmissionId: row.id,
    revisionNumber: 1,
    kind: "submission",
    editedByUserId: actor.id,
    taxRate: rate,
    subtotalCents: totals.subtotal,
    taxCents: totals.tax,
    totalCents: totals.total,
    snapshot: snapshotOf(row, content, payee),
  });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.submitted",
    ...auditBase(row),
    details: {
      before: { status: row.status },
      after: { status: next, referenceNumber, taxRate: rate, totalCents: totals.total },
      type: row.type,
      cycle: cycle.name,
      ...(impact.overBy > 0 ? { overBudgetByCents: impact.overBy } : {}),
      ...(content.linkedPurchaseRequestId
        ? { linkedPurchaseRequestId: content.linkedPurchaseRequestId }
        : {}),
    },
  });
  await queueExpenseEmails(tx, row.id, actor.id, { kind: "submitted" }, { now });

  return storeIdempotent(tx, key, actor, "expenses.submit", row.id, {
    expenseId: row.id,
    referenceNumber,
    submittedAt: now.toISOString(),
    totals,
  });
}

// ---------------------------------------------------------------- edit and respond (FR-44)

export type EditExpenseResult = { expenseId: string; responded: boolean; totals: TaxBreakdown };

/**
 * Saves a confirmed change to a submitted expense: freely until review starts, or as the
 * answer to a return for clarification, which sends it back to the accountant (FR-44).
 * Every version is kept in expense_revisions. The rate snapshotted at submission stays.
 */
export async function editExpense(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown } & ExpenseContentInput,
  options: Options = {},
): Promise<EditExpenseResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<EditExpenseResult>(tx, key, actor, "expenses.edit");
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const { actingRole } = canOn(actor, "expense.submit", row);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  const responding = row.status === "returned";
  if (row.status !== "submitted" && !responding) throw new RuleError(e.notEditable);
  const next: ExpenseStatus = responding
    ? transitionExpense(row.status, "respond", row.type)
    : row.status;

  const content = parseContent(row.type, input);
  const before = await contentOf(tx, row);
  const changes = changedFields(
    before as unknown as Record<string, unknown>,
    content as unknown as Record<string, unknown>,
  );
  if (!changes && !responding) throw new RuleError(e.nothingChanged);

  const rate = row.taxRate!;
  // Validate against the new content before writing it.
  await updateExpense(tx, row, version, columnsOf(row.type, content));
  await replaceRows(tx, row, content);
  const updated = await loadExpense(tx, row.id);
  const { totals } = await checkForSubmission(tx, updated, content, rate, now);
  const payee = await resolvePayee(tx, updated, content);
  await tx
    .update(expenseSubmissions)
    .set({
      status: next,
      subtotalCents: totals.subtotal,
      taxCents: totals.tax,
      totalCents: totals.total,
      ...payee,
    })
    .where(eq(expenseSubmissions.id, row.id));

  const [{ n }] = await tx
    .select({ n: sql<number>`coalesce(max(${expenseRevisions.revisionNumber}), 0)::int` })
    .from(expenseRevisions)
    .where(eq(expenseRevisions.expenseSubmissionId, row.id));
  await tx.insert(expenseRevisions).values({
    expenseSubmissionId: row.id,
    revisionNumber: n + 1,
    kind: responding ? "clarification_response" : "edit",
    editedByUserId: actor.id,
    taxRate: rate,
    subtotalCents: totals.subtotal,
    taxCents: totals.tax,
    totalCents: totals.total,
    snapshot: snapshotOf(row, content, payee),
  });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: responding ? "expenses.clarification_answered" : "expenses.edited",
    ...auditBase(row),
    details: {
      before: { status: row.status, totalCents: row.totalCents, ...changes?.before },
      after: { status: next, totalCents: totals.total, ...changes?.after },
      revisionNumber: n + 1,
    },
  });
  await queueExpenseEmails(
    tx,
    row.id,
    actor.id,
    { kind: responding ? "clarification_answered" : "edited" },
    { now },
  );

  return storeIdempotent(tx, key, actor, "expenses.edit", row.id, {
    expenseId: row.id,
    responded: responding,
    totals,
  });
}

// ---------------------------------------------------------------- withdraw and cancel

const reasonSchema = z
  .string({ error: e.reasonRequired })
  .trim()
  .min(1, e.reasonRequired)
  .max(1_000, e.reasonTooLong);

export type SimpleResult = { expenseId: string; status: ExpenseStatus };

/** The requester withdraws an expense before review starts, or while it's returned (FR-44). */
export async function withdrawExpense(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown },
  options: Options = {},
): Promise<SimpleResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<SimpleResult>(tx, key, actor, "expenses.withdraw");
  if (repeat) return repeat;
  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const { actingRole } = canOn(actor, "expense.submit", row);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  const next = nextExpenseOrRefuse(row, "withdraw", e.notWithdrawable);
  await updateExpense(tx, row, version, { status: next, closedAt: now });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.withdrawn",
    ...auditBase(row),
    details: { before: { status: row.status }, after: { status: next } },
  });
  await queueExpenseEmails(tx, row.id, actor.id, { kind: "withdrawn", from: row.status }, { now });
  return storeIdempotent(tx, key, actor, "expenses.withdraw", row.id, {
    expenseId: row.id,
    status: next,
  });
}

/**
 * Cancels an approved purchase request that won't go ahead, releasing its commitment
 * (FR-42, FR-44). Refused while a claim linked to it is still on its way.
 */
export async function cancelPurchaseRequest(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown; reason: unknown },
  options: Options = {},
): Promise<SimpleResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<SimpleResult>(tx, key, actor, "expenses.cancel");
  if (repeat) return repeat;
  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const { actingRole } = canOn(actor, "expense.cancel", row);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  const reason = parseInput(z.object({ reason: reasonSchema }), { reason: input.reason }).reason;
  const next = nextExpenseOrRefuse(row, "cancel", e.notCancellable);
  const [claim] = await tx
    .select({ id: expenseSubmissions.id })
    .from(expenseSubmissions)
    .where(
      and(
        eq(expenseSubmissions.linkedPurchaseRequestId, row.id),
        notInArray(expenseSubmissions.status, ["draft", ...ENDED_WITHOUT_CHARGE]),
      ),
    )
    .limit(1);
  if (claim) throw new RuleError(e.notCancellable);
  await updateExpense(tx, row, version, { status: next, closedAt: now });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.cancelled",
    ...auditBase(row),
    reason,
    details: {
      before: { status: row.status },
      after: { status: next },
      releasedCommitmentCents: row.approvedTotalCents,
    },
  });
  await queueExpenseEmails(tx, row.id, actor.id, { kind: "cancelled", reason }, { now });
  return storeIdempotent(tx, key, actor, "expenses.cancel", row.id, {
    expenseId: row.id,
    status: next,
  });
}

export type { Role };
