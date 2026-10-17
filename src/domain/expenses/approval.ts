import { and, desc, eq } from "drizzle-orm";
import { expensesCopy } from "@/copy/expenses";
import {
  expenseDecisions,
  expenseReceiptLines,
  expenseRevisions,
  expenseSubmissions,
  spendingEntries,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf } from "@/domain/annual/service";
import { RuleError } from "@/domain/errors";
import { writeAudit } from "@/lib/audit";
import type { Subject } from "@/lib/authz";
import { formatCAD, type TaxBreakdown } from "@/lib/money";
import type { Role } from "@/lib/roles";
import { budgetFigures, impactOf, linkedCommitment } from "./budget";
import { approvedFiguresFor } from "./decision";
import { checkSpendingAlerts } from "@/domain/spending/alerts";
import { queueExpenseEmails } from "./emails";
import {
  auditBase,
  loadExpense,
  nextExpenseOrRefuse,
  updateExpense,
  type ExpenseRow,
} from "./service";
import {
  canTransitionExpense,
  transitionExpense,
  type ExpenseEvent,
  type ExpenseStatus,
} from "./status";

/**
 * The two approvals (6B.4 as changed by the church on 2026-10-16). The accountant and the
 * Board Chair (or the Vice-Chair covering) are asked at the same time and decide in either
 * order. The first approval waits for the other; the second makes the expense Approved and
 * charges the budget (FR-42, AC-73). If they approved different amounts, the lower one is
 * final (AC-143), so neither approver authorizes more than they agreed to. Either may
 * return it to the department (both approve again afterwards) or decline it.
 *
 * Permission → validation → state machine → write → audit → outbox, in one transaction.
 * The over-budget figure is worked out at the moment of the decision (FR-43, AC-140).
 */

const e = expensesCopy.errors;

export type ApprovalLevel = "accountant" | "board";
export type DecisionKind = "approve" | "approve_smaller" | "return" | "decline";

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

/** The other level's approval in this round, when it has given one. */
export function otherApproval(row: ExpenseRow, level: ApprovalLevel): TaxBreakdown | null {
  const waitingOnMe = level === "accountant" ? "awaiting_accountant" : "awaiting_board";
  if (row.status !== waitingOnMe || row.approvedTotalCents === null) return null;
  return {
    subtotal: row.approvedSubtotalCents!,
    tax: row.approvedTaxCents!,
    total: row.approvedTotalCents,
  };
}

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

export type ApprovalResult = {
  expenseId: string;
  status: ExpenseStatus;
  /** The amount approved so far: the lower of the two once both have approved. */
  approved: TaxBreakdown | null;
  remainingAfterCents: number;
  actingRole: Role;
};

const STORED_DECISION = {
  approve: "approved",
  approve_smaller: "approved_different_amount",
  return: "returned",
  decline: "declined",
} as const;

/**
 * Records one approver's decision. The caller has checked the person may decide at this
 * level, the version and the idempotency key. A Submitted expense is put In Review first.
 */
export async function applyDecision(
  tx: Tx,
  actor: Subject,
  input: {
    row: ExpenseRow;
    version: number;
    level: ApprovalLevel;
    actingRole: Role;
    kind: DecisionKind;
    /** For approve_smaller: the total including tax, in cents. */
    amount?: number;
    note: string | null;
    now: Date;
  },
): Promise<ApprovalResult> {
  const { row, level, kind, note, now, actingRole } = input;
  const from = canTransitionExpense(row.status, "start_review", row.type)
    ? transitionExpense(row.status, "start_review", row.type)
    : row.status;
  const event: ExpenseEvent =
    kind === "return" || kind === "decline"
      ? kind
      : level === "accountant"
        ? "accountant_approve"
        : "board_approve";
  const next = nextExpenseOrRefuse({ ...row, status: from }, event, e.notDecidable);

  const requested: TaxBreakdown = {
    subtotal: row.subtotalCents!,
    tax: row.taxCents!,
    total: row.totalCents!,
  };
  // This approver's own amount: never more than was asked.
  let mine: TaxBreakdown | null = null;
  if (kind === "approve") mine = requested;
  if (kind === "approve_smaller") {
    if (input.amount === undefined || input.amount > requested.total) {
      throw new RuleError(e.amountAboveRequested(formatCAD(requested.total)));
    }
    mine = approvedFiguresFor(row.type, input.amount, row.taxRate!);
  }
  // The lower of the two approvals is the one approved (AC-143).
  const other = otherApproval({ ...row, status: from }, level);
  const approved = mine && other && other.total < mine.total ? other : mine;
  const impact = await liveImpact(tx, row, approved?.total ?? requested.total);

  await tx.insert(expenseDecisions).values({
    expenseSubmissionId: row.id,
    revisionId: await latestRevisionId(tx, row.id),
    level,
    decision: STORED_DECISION[kind],
    approvedSubtotalCents: mine?.subtotal ?? null,
    approvedTaxCents: mine?.tax ?? null,
    approvedTotalCents: mine?.total ?? null,
    reason: note,
    remainingAfterCents: impact.after,
    decidedByUserId: actor.id,
    actingRole,
    createdAt: now,
  });
  const final = next === "approved";
  const clearApproval = {
    approvedSubtotalCents: null,
    approvedTaxCents: null,
    approvedTotalCents: null,
    approvalNote: null,
  };
  await updateExpense(tx, row, input.version, {
    status: next,
    ...(approved
      ? {
          approvedSubtotalCents: approved.subtotal,
          approvedTaxCents: approved.tax,
          approvedTotalCents: approved.total,
          ...(note ? { approvalNote: note } : {}),
          ...(final ? { approvedAt: now } : {}),
        }
      : {}),
    // A return starts a new round: both approve again once the department answers.
    ...(next === "returned" ? clearApproval : {}),
    ...(next === "declined" ? { closedAt: now } : {}),
  });
  if (final && approved && row.type === "expense_claim") {
    await chargeClaim(tx, actor, actingRole, row, approved, now);
  }
  // FR-28: the first time this takes the department near its limit. Going over budget is
  // already emailed by the expense's own over-budget alert (FR-49).
  if (final) {
    await checkSpendingAlerts(tx, row.budgetCycleId, row.departmentId, {
      now,
      overBudget: false,
    });
  }
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType:
      kind === "return"
        ? "expenses.returned"
        : kind === "decline"
          ? "expenses.declined"
          : final
            ? "expenses.final_approved"
            : level === "accountant"
              ? "expenses.accountant_approved"
              : "expenses.board_approved",
    ...auditBase(row),
    reason: note ?? undefined,
    details: {
      before: { status: row.status },
      after: { status: next },
      level,
      requestedTotalCents: requested.total,
      ...(mine ? { approvedByThisLevel: mine } : {}),
      ...(other ? { approvedByOtherLevelCents: other.total } : {}),
      ...(approved ? { approved } : {}),
      remainingAfterCents: impact.after,
      ...(impact.overBy > 0 ? { overBudgetByCents: impact.overBy } : {}),
    },
  });
  await queueExpenseEmails(
    tx,
    row.id,
    actor.id,
    kind === "return"
      ? { kind: "returned", question: note ?? "", level }
      : kind === "decline"
        ? { kind: "declined", reason: note ?? "", level }
        : final
          ? { kind: "final_approved", overBy: impact.overBy }
          : { kind: "approved_one", level },
    { now },
  );

  return {
    expenseId: row.id,
    status: next,
    approved,
    remainingAfterCents: impact.after,
    actingRole,
  };
}
