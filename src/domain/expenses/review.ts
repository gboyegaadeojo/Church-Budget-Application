import { and, desc, eq } from "drizzle-orm";
import { expensesCopy } from "@/copy/expenses";
import { expenseDecisions, expenseRevisions, expenseSubmissions } from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf, parseKey, parseVersion, previousResult } from "@/domain/annual/service";
import { ConflictError, parseInput, RuleError } from "@/domain/errors";
import { writeAudit } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import type { TaxBreakdown } from "@/lib/money";
import { formatCAD } from "@/lib/money";
import { budgetFigures, impactOf, linkedCommitment } from "./budget";
import { accountantDecisionSchema, approvedFiguresFor } from "./decision";
import { queueExpenseEmails } from "./emails";
import {
  auditBase,
  authzContextOf,
  loadExpense,
  nextExpenseOrRefuse,
  storeIdempotent,
  updateExpense,
  type ExpenseRow,
} from "./service";
import { canTransitionExpense, transitionExpense, type ExpenseStatus } from "./status";

/**
 * Level 1 of the two approvals (6B.4): the accountant or a backup approver, never for
 * their own department, their own claim or a claim that pays them (FR-33, FR-47).
 * Permission → validation → state machine → write → audit → outbox, in one transaction.
 * The over-budget figure is worked out at the moment of the decision (FR-43, AC-140).
 */

const e = expensesCopy.errors;
type Options = { now?: Date };

/** The latest submitted version: what a decision is about. */
export async function latestRevisionId(tx: Tx, expenseId: string): Promise<string> {
  const [revision] = await tx
    .select({ id: expenseRevisions.id })
    .from(expenseRevisions)
    .where(eq(expenseRevisions.expenseSubmissionId, expenseId))
    .orderBy(desc(expenseRevisions.revisionNumber))
    .limit(1);
  if (!revision) throw new RuleError(e.notDecidable);
  return revision.id;
}

/** Remaining after charging `amount` now, releasing any commitment the claim closes. */
export async function liveImpact(tx: Tx, row: ExpenseRow, amountCents: number) {
  const figures = await budgetFigures(tx, row.budgetCycleId, row.departmentId);
  return impactOf(figures, amountCents, await linkedCommitment(tx, row.linkedPurchaseRequestId));
}

/**
 * Marks a Submitted expense In Review when an accountant who may decide it opens it;
 * the department can't edit it any more (FR-44, AC-71). Returns whether it moved.
 */
export async function startExpenseReview(
  tx: Tx,
  actor: Subject,
  input: { id: string },
  options: Options = {},
): Promise<boolean> {
  const row = await loadExpense(tx, input.id, true);
  const decision = authorize(actor, "expense.first_approve", authzContextOf(row));
  if (!decision.allowed || !canTransitionExpense(row.status, "start_review", row.type)) {
    return false;
  }
  const next = transitionExpense(row.status, "start_review", row.type);
  await tx
    .update(expenseSubmissions)
    .set({ status: next, updatedAt: new Date() })
    .where(and(eq(expenseSubmissions.id, row.id), eq(expenseSubmissions.status, row.status)));
  await writeAudit(tx, {
    actor: actorOf(actor, decision.actingRole),
    area: "expenses",
    eventType: "expenses.review_started",
    ...auditBase(row),
    details: { before: { status: row.status }, after: { status: next } },
  });
  await queueExpenseEmails(tx, row.id, actor.id, { kind: "review_started" }, options);
  return true;
}

export type AccountantDecideResult = {
  expenseId: string;
  status: ExpenseStatus;
  approved: TaxBreakdown | null;
  remainingAfterCents: number;
};

const LEVEL1 = {
  approve: { event: "approve", decision: "approved", audit: "expenses.accountant_approved" },
  approve_different_amount: {
    event: "approve",
    decision: "approved_different_amount",
    audit: "expenses.accountant_approved",
  },
  return: { event: "return", decision: "returned", audit: "expenses.returned" },
  decline: { event: "decline", decision: "declined", audit: "expenses.declined" },
} as const;

/**
 * The accountant's decision: approve and send to the Board Chair, approve a different
 * amount (one total including tax, with a reason; never more than asked), return with a
 * question, or decline with a reason. A Submitted expense is put In Review first.
 * Approval doesn't charge the budget; only the Board Chair's final approval does (AC-73).
 */
export async function accountantDecide(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown; decision: unknown },
  options: Options = {},
): Promise<AccountantDecideResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<AccountantDecideResult>(
    tx,
    key,
    actor,
    "expenses.accountant_decide",
  );
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const { actingRole } = assertCan(actor, "expense.first_approve", authzContextOf(row));
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  const decision = parseInput(accountantDecisionSchema, input.decision);
  const plan = LEVEL1[decision.kind];

  const from = canTransitionExpense(row.status, "start_review", row.type)
    ? transitionExpense(row.status, "start_review", row.type)
    : row.status;
  const next = nextExpenseOrRefuse({ ...row, status: from }, plan.event, e.notDecidable);

  const requested: TaxBreakdown = {
    subtotal: row.subtotalCents!,
    tax: row.taxCents!,
    total: row.totalCents!,
  };
  let approved: TaxBreakdown | null = null;
  if (decision.kind === "approve") approved = requested;
  if (decision.kind === "approve_different_amount") {
    if (decision.amount > requested.total) {
      throw new RuleError(e.amountAboveRequested(formatCAD(requested.total)));
    }
    approved = approvedFiguresFor(row.type, decision.amount, row.taxRate!);
  }
  const impact = await liveImpact(tx, row, approved?.total ?? requested.total);

  await tx.insert(expenseDecisions).values({
    expenseSubmissionId: row.id,
    revisionId: await latestRevisionId(tx, row.id),
    level: "accountant",
    decision: plan.decision,
    approvedSubtotalCents: approved?.subtotal ?? null,
    approvedTaxCents: approved?.tax ?? null,
    approvedTotalCents: approved?.total ?? null,
    reason: decision.note,
    remainingAfterCents: impact.after,
    decidedByUserId: actor.id,
    actingRole,
    createdAt: now,
  });
  await updateExpense(tx, row, version, {
    status: next,
    ...(approved
      ? {
          approvedSubtotalCents: approved.subtotal,
          approvedTaxCents: approved.tax,
          approvedTotalCents: approved.total,
          approvalNote: decision.note,
        }
      : {}),
    ...(next === "declined" ? { closedAt: now } : {}),
  });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: plan.audit,
    ...auditBase(row),
    reason: decision.note ?? undefined,
    details: {
      before: { status: row.status },
      after: { status: next },
      level: "accountant",
      requestedTotalCents: requested.total,
      ...(approved ? { approved } : {}),
      remainingAfterCents: impact.after,
      ...(impact.overBy > 0 ? { overBudgetByCents: impact.overBy } : {}),
    },
  });
  await queueExpenseEmails(
    tx,
    row.id,
    actor.id,
    decision.kind === "return"
      ? { kind: "returned", question: decision.note }
      : decision.kind === "decline"
        ? { kind: "declined", reason: decision.note, level: "accountant" }
        : { kind: "accountant_approved" },
    { now },
  );

  return storeIdempotent(tx, key, actor, "expenses.accountant_decide", row.id, {
    expenseId: row.id,
    status: next,
    approved,
    remainingAfterCents: impact.after,
  });
}
