import { and, desc, eq } from "drizzle-orm";
import { expensesCopy } from "@/copy/expenses";
import {
  expenseDecisions,
  expenseReceiptLines,
  expenseSubmissions,
  spendingEntries,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf, parseKey, parseVersion, previousResult } from "@/domain/annual/service";
import { ConflictError, parseInput, RuleError } from "@/domain/errors";
import { boardCover } from "@/domain/notifications/recipients";
import { writeAudit } from "@/lib/audit";
import { authorize, ForbiddenError, type Subject } from "@/lib/authz";
import { formatCAD, type TaxBreakdown } from "@/lib/money";
import type { Role } from "@/lib/roles";
import { approvedFiguresFor, boardDecisionSchema } from "./decision";
import { queueExpenseEmails } from "./emails";
import { latestRevisionId, liveImpact } from "./review";
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
 * Level 2 of the two approvals (6B.4): the Board Chair, or the Vice-Chair when the Chair
 * is Away or conflicted (3.3, AC-112). The final approval charges the budget (FR-42,
 * AC-73): a purchase request becomes Committed; a claim becomes Spent through its own
 * spending entry (AC-80) and closes the purchase request it's linked to (AC-67).
 */

const e = expensesCopy.errors;
type Options = { now?: Date };

export type BoardPermission =
  | { allowed: true; actingRole: Role }
  | {
      allowed: false;
      reason: "conflict_of_interest" | "missing_role" | "vice_not_needed" | string;
    };

/**
 * Whether this person may give the final approval now. The Chair may unless conflicted
 * (even while Away: they can still sign in). The Vice-Chair only while no Chair can.
 */
export async function boardPermission(
  tx: Tx,
  actor: Subject,
  row: ExpenseRow,
  now: Date = new Date(),
): Promise<BoardPermission> {
  const decision = authorize(actor, "expense.final_approve", authzContextOf(row));
  if (!decision.allowed) return { allowed: false, reason: decision.reason };
  if (decision.actingRole === "vice_chair") {
    const cover = await boardCover(tx, row, now);
    if (!cover.viceCovering) return { allowed: false, reason: "vice_not_needed" };
  }
  return { allowed: true, actingRole: decision.actingRole };
}

export type BoardDecideResult = {
  expenseId: string;
  status: ExpenseStatus;
  approved: TaxBreakdown | null;
  remainingAfterCents: number;
  actingRole: Role;
};

const PLAN = {
  approve: { event: "final_approve", decision: "approved", audit: "expenses.final_approved" },
  approve_smaller: {
    event: "final_approve",
    decision: "approved_different_amount",
    audit: "expenses.final_approved",
  },
  return: { event: "board_return", decision: "returned", audit: "expenses.board_returned" },
  decline: { event: "decline", decision: "declined", audit: "expenses.declined" },
} as const;

/** The latest day on the claim's receipts, as the spending entry's date (FR-24). */
async function spentOn(tx: Tx, row: ExpenseRow, now: Date): Promise<string> {
  const [latest] = await tx
    .select({ day: expenseReceiptLines.purchaseDate })
    .from(expenseReceiptLines)
    .where(eq(expenseReceiptLines.expenseSubmissionId, row.id))
    .orderBy(desc(expenseReceiptLines.purchaseDate))
    .limit(1);
  return latest?.day ?? now.toISOString().slice(0, 10);
}

/**
 * Charges an approved claim (FR-42): its own spending entry, so the ledger includes it
 * without re-typing (AC-80), and its linked purchase request is closed, releasing that
 * commitment (AC-67).
 */
async function chargeClaim(
  tx: Tx,
  actor: Subject,
  actingRole: Role,
  row: ExpenseRow,
  approved: TaxBreakdown,
  now: Date,
) {
  const [entry] = await tx
    .insert(spendingEntries)
    .values({
      budgetCycleId: row.budgetCycleId,
      departmentId: row.departmentId,
      expenseSubmissionId: row.id,
      entryType: "expense",
      spentOn: await spentOn(tx, row, now),
      payee:
        row.payeeKind === "church_card" ? expensesCopy.payee.church_card : (row.payeeName ?? ""),
      description: `${row.referenceNumber} · ${row.title}`,
      amountCents: approved.total,
      referenceNumber: row.referenceNumber,
      createdByUserId: actor.id,
    })
    .returning({ id: spendingEntries.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "spending",
    eventType: "spending.entry_from_expense",
    entity: { type: "spending_entry", id: entry.id },
    departmentId: row.departmentId,
    cycleId: row.budgetCycleId,
    details: { expenseSubmissionId: row.id, amountCents: approved.total },
  });

  if (!row.linkedPurchaseRequestId) return;
  const pr = await loadExpense(tx, row.linkedPurchaseRequestId, true);
  if (!canTransitionExpense(pr.status, "close", pr.type)) return;
  const closed = transitionExpense(pr.status, "close", pr.type);
  await tx
    .update(expenseSubmissions)
    .set({ status: closed, closedAt: now, updatedAt: now })
    .where(and(eq(expenseSubmissions.id, pr.id), eq(expenseSubmissions.status, pr.status)));
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.closed_by_claim",
    ...auditBase(pr),
    details: {
      before: { status: pr.status },
      after: { status: closed },
      claimId: row.id,
      releasedCommitmentCents: pr.approvedTotalCents,
      claimTotalCents: approved.total,
    },
  });
}

/**
 * The Board Chair's (or Vice-Chair's) decision: give final approval, approve a smaller
 * amount (never more than the accountant approved, AC-75), return to the accountant with
 * a question, or decline. Each decision records who made it and in which role (AC-112).
 */
export async function boardDecide(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown; decision: unknown },
  options: Options = {},
): Promise<BoardDecideResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<BoardDecideResult>(tx, key, actor, "expenses.board_decide");
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const permission = await boardPermission(tx, actor, row, now);
  if (!permission.allowed) {
    if (permission.reason === "vice_not_needed") throw new RuleError(e.viceChairNotNeeded);
    throw new ForbiddenError("expense.final_approve", permission.reason as never);
  }
  const { actingRole } = permission;
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  const decision = parseInput(boardDecisionSchema, input.decision);
  const plan = PLAN[decision.kind];
  const next = nextExpenseOrRefuse(row, plan.event, e.notDecidable);

  const accountantApproved: TaxBreakdown = {
    subtotal: row.approvedSubtotalCents!,
    tax: row.approvedTaxCents!,
    total: row.approvedTotalCents!,
  };
  let approved: TaxBreakdown | null = null;
  if (decision.kind === "approve") approved = accountantApproved;
  if (decision.kind === "approve_smaller") {
    if (decision.amount > accountantApproved.total) {
      throw new RuleError(e.amountAboveAccountant(formatCAD(accountantApproved.total)));
    }
    approved = approvedFiguresFor(row.type, decision.amount, row.taxRate!);
  }
  const impact = await liveImpact(tx, row, approved?.total ?? accountantApproved.total);

  await tx.insert(expenseDecisions).values({
    expenseSubmissionId: row.id,
    revisionId: await latestRevisionId(tx, row.id),
    level: "board",
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
          approvedAt: now,
          ...(decision.note ? { approvalNote: decision.note } : {}),
        }
      : {}),
    ...(next === "declined" ? { closedAt: now } : {}),
  });
  if (approved && row.type === "expense_claim") {
    await chargeClaim(tx, actor, actingRole, row, approved, now);
  }
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: plan.audit,
    ...auditBase(row),
    reason: decision.note ?? undefined,
    details: {
      before: { status: row.status },
      after: { status: next },
      level: "board",
      accountantApprovedCents: accountantApproved.total,
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
      ? { kind: "board_returned", question: decision.note }
      : decision.kind === "decline"
        ? { kind: "declined", reason: decision.note, level: "board" }
        : { kind: "final_approved", overBy: impact.overBy },
    { now },
  );

  return storeIdempotent(tx, key, actor, "expenses.board_decide", row.id, {
    expenseId: row.id,
    status: next,
    approved,
    remainingAfterCents: impact.after,
    actingRole,
  });
}
