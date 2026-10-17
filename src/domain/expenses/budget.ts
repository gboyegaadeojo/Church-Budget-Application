import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  approvalDecisions,
  budgetRequests,
  expenseSubmissions,
  spendingEntries,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { isApproved } from "@/domain/annual/status";
import { readSettings } from "@/domain/settings";
import { sumCents } from "@/lib/money";
import { COMMITTED_STATUSES, PENDING_STATUSES } from "./status";

/**
 * A department's budget for one cycle, as Part B sees it (FR-25, FR-42, FR-48):
 *
 *   Available = approved annual total (incl. tax) [+ amendments, Stage 4]
 *   Committed = approved purchase requests not yet bought, claimed or cancelled
 *   Spent     = expense entries − refund entries, voided ones left out
 *   Remaining = Available − Committed − Spent (may go below zero, FR-43)
 *   Pending   = submitted but not finally approved; shown, never deducted
 *
 * Everything is integer cents summed on the server; nothing the browser sends is used.
 */

export type BudgetFigures = {
  /** The approved, released annual request; null when the department has none (AC-78). */
  annualRequestId: string | null;
  available: number;
  committed: number;
  pending: number;
  spent: number;
  remaining: number;
};

export type BudgetStatus = "on_track" | "nearing_limit" | "over_budget" | "no_budget";

/**
 * The department's approved annual budget for the cycle, if its decision has reached the
 * department: a held decision (FR-19a) doesn't start expenses yet.
 */
export type ExpenseUse = { committed: number; spent: number; pending: number };

/**
 * What expenses already rely on a department's annual budget for a year (FR-18a): open
 * commitments, money spent, and expenses still waiting for approval. Null when none.
 */
export async function expenseUseOf(
  tx: Tx,
  cycleId: string,
  departmentId: string,
): Promise<ExpenseUse | null> {
  const f = await budgetFigures(tx, cycleId, departmentId);
  if (f.committed === 0 && f.spent === 0 && f.pending === 0) return null;
  return { committed: f.committed, spent: f.spent, pending: f.pending };
}

export async function approvedAnnualBudget(
  tx: Tx,
  cycleId: string,
  departmentId: string,
): Promise<{ requestId: string; totalCents: number } | null> {
  const [request] = await tx
    .select({
      id: budgetRequests.id,
      status: budgetRequests.status,
      totalCents: budgetRequests.approvedTotalCents,
    })
    .from(budgetRequests)
    .where(
      and(eq(budgetRequests.budgetCycleId, cycleId), eq(budgetRequests.departmentId, departmentId)),
    )
    .limit(1);
  if (!request || !isApproved(request.status) || request.totalCents === null) return null;
  const [decision] = await tx
    .select({ releasedAt: approvalDecisions.releasedAt })
    .from(approvalDecisions)
    .where(
      and(
        eq(approvalDecisions.budgetRequestId, request.id),
        inArray(approvalDecisions.decision, ["approved", "second_approved"]),
      ),
    )
    .orderBy(desc(approvalDecisions.createdAt))
    .limit(1);
  if (!decision?.releasedAt) return null;
  return { requestId: request.id, totalCents: request.totalCents };
}

export async function budgetFigures(
  tx: Tx,
  cycleId: string,
  departmentId: string,
): Promise<BudgetFigures> {
  const annual = await approvedAnnualBudget(tx, cycleId, departmentId);
  const scope = and(
    eq(expenseSubmissions.budgetCycleId, cycleId),
    eq(expenseSubmissions.departmentId, departmentId),
  );
  const [committed] = await tx
    .select({ cents: sql<string>`coalesce(sum(${expenseSubmissions.approvedTotalCents}), 0)` })
    .from(expenseSubmissions)
    .where(
      and(
        scope,
        eq(expenseSubmissions.type, "purchase_request"),
        inArray(expenseSubmissions.status, [...COMMITTED_STATUSES]),
      ),
    );
  // An item the accountant has approved counts at the amount they approved.
  const [pending] = await tx
    .select({
      cents: sql<string>`coalesce(sum(coalesce(${expenseSubmissions.approvedTotalCents}, ${expenseSubmissions.totalCents})), 0)`,
    })
    .from(expenseSubmissions)
    .where(and(scope, inArray(expenseSubmissions.status, [...PENDING_STATUSES])));
  const [spent] = await tx
    .select({
      cents: sql<string>`coalesce(sum(case when ${spendingEntries.entryType} = 'refund'
        then -${spendingEntries.amountCents} else ${spendingEntries.amountCents} end), 0)`,
    })
    .from(spendingEntries)
    .where(
      and(
        eq(spendingEntries.budgetCycleId, cycleId),
        eq(spendingEntries.departmentId, departmentId),
        eq(spendingEntries.status, "recorded"),
      ),
    );
  return figuresFrom({
    annualRequestId: annual?.requestId ?? null,
    available: annual?.totalCents ?? 0,
    committed: Number(committed.cents),
    pending: Number(pending.cents),
    spent: Number(spent.cents),
  });
}

/** Remaining from the parts, in integer cents (FR-25). */
export function figuresFrom(parts: Omit<BudgetFigures, "remaining">): BudgetFigures {
  return {
    ...parts,
    remaining: sumCents([parts.available, -parts.committed, -parts.spent]),
  };
}

export type BudgetImpact = {
  /** Remaining now, before this submission. */
  before: number;
  /** Remaining once this amount is charged, and any commitment it closes is released. */
  after: number;
  /** How far `after` is below zero; 0 when within budget (FR-43). */
  overBy: number;
};

/**
 * What charging `amountCents` does to Remaining (FR-42, FR-43). A claim that closes a
 * purchase request releases that request's commitment (`releasesCents`) at the same time.
 * Always worked out from the current figures, never from the figure at submission (AC-140).
 */
export function impactOf(
  figures: Pick<BudgetFigures, "remaining">,
  amountCents: number,
  releasesCents = 0,
): BudgetImpact {
  const after = sumCents([figures.remaining, releasesCents, -amountCents]);
  return { before: figures.remaining, after, overBy: after < 0 ? -after : 0 };
}

/**
 * The spending status (FR-25): Over budget when Committed + Spent exceed Available,
 * Nearing limit at or above the threshold, No approved budget without one.
 * `threshold` is the near-limit share as a decimal string ("0.80").
 */
export function budgetStatus(figures: BudgetFigures, threshold: string): BudgetStatus {
  if (figures.annualRequestId === null) return "no_budget";
  const used = BigInt(sumCents([figures.committed, figures.spent]));
  const available = BigInt(figures.available);
  if (used > available) return "over_budget";
  // used / available >= threshold, in whole numbers: used × 10000 >= available × rate.
  const match = /^(\d)(?:\.(\d{1,4}))?$/.exec(threshold.trim());
  const rate = match
    ? BigInt(match[1]) * 10_000n + BigInt((match[2] ?? "").padEnd(4, "0"))
    : 8_000n;
  return used * 10_000n >= available * rate ? "nearing_limit" : "on_track";
}

export async function nearLimitThreshold(tx: Tx): Promise<string> {
  return (await readSettings(tx, ["near_limit_threshold"])).near_limit_threshold;
}

/**
 * The commitment a claim would release: its linked purchase request's approved total,
 * while that request is still committed (approved, not yet bought or closed).
 */
export async function linkedCommitment(tx: Tx, purchaseRequestId: string | null): Promise<number> {
  if (!purchaseRequestId) return 0;
  const [row] = await tx
    .select({ cents: expenseSubmissions.approvedTotalCents })
    .from(expenseSubmissions)
    .where(
      and(
        eq(expenseSubmissions.id, purchaseRequestId),
        inArray(expenseSubmissions.status, [...COMMITTED_STATUSES]),
        isNotNull(expenseSubmissions.approvedTotalCents),
      ),
    )
    .limit(1);
  return row?.cents ?? 0;
}
