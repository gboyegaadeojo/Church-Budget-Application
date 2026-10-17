import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { budgetCycles, expensePayments, expenseSubmissions, spendingEntries } from "@/db/schema";
import type { Tx } from "@/db/types";
import { EXPENSE_STATUSES, type ExpenseStatus } from "@/domain/expenses/status";
import { spendingDashboard, type Dashboard } from "@/domain/spending/dashboard";
import { authorize, type Subject } from "@/lib/authz";

/**
 * The Overview tab's spending and expense figures (FR-52): budget against actual for
 * each department, spending by month against last year, the expense pipeline, what's
 * waiting at each approval level, and how long payments take. The budget figures are the
 * Spending dashboard's own (`spendingDashboard`), so they match it and the Budget vs
 * Actual export to the cent (AC-127). For staff who see spending (`spending.view`); a
 * requester never reaches it.
 */

export type MonthSpend = { month: number; cents: number; lastYearCents: number | null };

export type PipelineStage = { status: ExpenseStatus; count: number; cents: number };

export type SpendingOverview = {
  dashboard: Dashboard & { cycle: NonNullable<Dashboard["cycle"]> };
  months: MonthSpend[];
  lastYear: { id: string; name: string } | null;
  pipeline: PipelineStage[];
  waiting: {
    decision: number;
    accountant: number;
    board: number;
    requester: number;
    payment: number;
  };
  payments: { paid: number; averageDays: number | null };
  /** The expense list is open to this viewer, so pipeline rows can link to it. */
  canListExpenses: boolean;
};

/** Where an expense waits after submission, in the order it moves (drafts left out). */
const PIPELINE: readonly ExpenseStatus[] = EXPENSE_STATUSES.filter((s) => s !== "draft");

const DAY = 86_400_000;

async function monthly(tx: Tx, cycleId: string): Promise<Map<number, number>> {
  const rows = await tx
    .select({
      month: sql<number>`extract(month from ${spendingEntries.spentOn})::int`,
      cents: sql<string>`coalesce(sum(case when ${spendingEntries.entryType} = 'refund'
        then -${spendingEntries.amountCents} else ${spendingEntries.amountCents} end), 0)`,
    })
    .from(spendingEntries)
    .where(and(eq(spendingEntries.budgetCycleId, cycleId), eq(spendingEntries.status, "recorded")))
    .groupBy(sql`1`);
  return new Map(rows.map((r) => [Number(r.month), Number(r.cents)]));
}

export async function spendingOverview(
  tx: Tx,
  viewer: Subject,
  cycleId?: string,
): Promise<SpendingOverview | null> {
  if (!authorize(viewer, "spending.view").allowed) return null;
  const dashboard = await spendingDashboard(tx, viewer, cycleId);
  if (!dashboard?.cycle) return null;
  const cycle = dashboard.cycle;

  const [last] = await tx
    .select({ id: budgetCycles.id, name: budgetCycles.name })
    .from(budgetCycles)
    .where(eq(budgetCycles.budgetYear, cycle.budgetYear - 1))
    .limit(1);
  const [current, previous] = await Promise.all([
    monthly(tx, cycle.id),
    last ? monthly(tx, last.id) : Promise.resolve(null),
  ]);
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    cents: current.get(i + 1) ?? 0,
    lastYearCents: previous ? (previous.get(i + 1) ?? 0) : null,
  }));

  const byStatus = await tx
    .select({
      status: expenseSubmissions.status,
      count: sql<number>`count(*)::int`,
      cents: sql<string>`coalesce(sum(coalesce(${expenseSubmissions.approvedTotalCents}, ${expenseSubmissions.totalCents})), 0)`,
    })
    .from(expenseSubmissions)
    .where(
      and(eq(expenseSubmissions.budgetCycleId, cycle.id), ne(expenseSubmissions.status, "draft")),
    )
    .groupBy(expenseSubmissions.status);
  const pipeline = PIPELINE.map((status) => {
    const row = byStatus.find((r) => r.status === status);
    return { status, count: Number(row?.count ?? 0), cents: Number(row?.cents ?? 0) };
  });
  const count = (statuses: ExpenseStatus[]) =>
    pipeline.filter((p) => statuses.includes(p.status)).reduce((n, p) => n + p.count, 0);
  // Both approvers are asked at submission and either may decide first (6B.4).
  const waiting = {
    decision: count(["submitted", "in_review", "awaiting_accountant", "awaiting_board"]),
    accountant: count(["submitted", "in_review", "awaiting_accountant"]),
    board: count(["submitted", "in_review", "awaiting_board"]),
    requester: count(["returned"]),
    payment: count(["approved", "processing"]),
  };

  // Days from final approval to the payment date, for expenses paid this year.
  const paid = await tx
    .select({ approvedAt: expenseSubmissions.approvedAt, paidOn: expensePayments.paidOn })
    .from(expensePayments)
    .innerJoin(expenseSubmissions, eq(expenseSubmissions.id, expensePayments.expenseSubmissionId))
    .where(
      and(
        eq(expenseSubmissions.budgetCycleId, cycle.id),
        inArray(expenseSubmissions.status, ["paid", "purchased", "closed"]),
      ),
    );
  const days = paid
    .filter((p) => p.approvedAt)
    .map((p) => {
      const approvedDay = Date.UTC(
        p.approvedAt!.getUTCFullYear(),
        p.approvedAt!.getUTCMonth(),
        p.approvedAt!.getUTCDate(),
      );
      return Math.max(0, Math.round((Date.parse(`${p.paidOn}T00:00:00Z`) - approvedDay) / DAY));
    });
  const averageDays = days.length
    ? Math.round(days.reduce((a, b) => a + b, 0) / days.length)
    : null;

  return {
    dashboard: { ...dashboard, cycle },
    months,
    lastYear: last ?? null,
    pipeline,
    waiting,
    payments: { paid: days.length, averageDays },
    canListExpenses: authorize(viewer, "expense.view_all").allowed,
  };
}
