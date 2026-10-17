import { and, eq } from "drizzle-orm";
import { expenseSubmissions } from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf, parseKey, parseVersion, previousResult } from "@/domain/annual/service";
import { ConflictError, parseInput } from "@/domain/errors";
import { writeAudit } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { applyDecision, type ApprovalResult } from "./approval";
import { boardPermission } from "./board";
import { accountantDecisionSchema } from "./decision";
import { queueExpenseEmails } from "./emails";
import { auditBase, authzContextOf, loadExpense, storeIdempotent } from "./service";
import { canTransitionExpense, transitionExpense } from "./status";

export { latestRevisionId, liveImpact } from "./approval";

/**
 * The accountant's side of the two approvals (6B.4): the accountant or a backup approver,
 * never for their own department, their own claim or a claim that pays them (FR-33,
 * FR-47). The Board Chair decides alongside, in either order (`approval.ts`).
 */

type Options = { now?: Date };

/** Who may open this expense for review, and in which role: either approver. */
async function reviewerRole(
  tx: Tx,
  actor: Subject,
  row: Awaited<ReturnType<typeof loadExpense>>,
  now: Date,
): Promise<Role | null> {
  const accountant = authorize(actor, "expense.first_approve", authzContextOf(row));
  if (accountant.allowed) return accountant.actingRole;
  const board = await boardPermission(tx, actor, row, now);
  return board.allowed ? board.actingRole : null;
}

/**
 * Marks a Submitted expense In Review when an approver who may decide it (the accountant
 * or the Board Chair) opens it; the department can't edit it any more (FR-44, AC-71).
 * Returns whether it moved.
 */
export async function startExpenseReview(
  tx: Tx,
  actor: Subject,
  input: { id: string },
  options: Options = {},
): Promise<boolean> {
  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  if (!canTransitionExpense(row.status, "start_review", row.type)) return false;
  const actingRole = await reviewerRole(tx, actor, row, now);
  if (!actingRole) return false;
  const next = transitionExpense(row.status, "start_review", row.type);
  await tx
    .update(expenseSubmissions)
    .set({ status: next, updatedAt: new Date() })
    .where(and(eq(expenseSubmissions.id, row.id), eq(expenseSubmissions.status, row.status)));
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.review_started",
    ...auditBase(row),
    details: { before: { status: row.status }, after: { status: next } },
  });
  await queueExpenseEmails(tx, row.id, actor.id, { kind: "review_started" }, options);
  return true;
}

export type AccountantDecideResult = Omit<ApprovalResult, "actingRole">;

/**
 * The accountant's decision: approve, approve a different (smaller) amount (one total
 * including tax, with a reason), return with a question, or decline with a reason. The
 * expense is Approved, and charged, only once the Board Chair has approved too (AC-73).
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
  const applied = await applyDecision(tx, actor, {
    row,
    version,
    level: "accountant",
    actingRole,
    kind: decision.kind === "approve_different_amount" ? "approve_smaller" : decision.kind,
    amount: decision.kind === "approve_different_amount" ? decision.amount : undefined,
    note: decision.note,
    now,
  });
  return storeIdempotent(tx, key, actor, "expenses.accountant_decide", row.id, {
    expenseId: applied.expenseId,
    status: applied.status,
    approved: applied.approved,
    remainingAfterCents: applied.remainingAfterCents,
  });
}
