import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  budgetCycles,
  expenseDecisions,
  expensePayments,
  expenseSubmissions,
  spendingEntries,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { EXPENSE_STATUSES, type ExpenseStatus } from "@/domain/expenses/status";
import { spendingDashboard, type Dashboard } from "@/domain/spending/dashboard";
import { totalsOf } from "@/domain/spending/export";
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

/** Narrow the spending half to one department and, for activity, a date range (FR-52). */
export type OverviewFilters = { departmentId?: string; from?: string; to?: string };

/** How long expenses take at each step (FR-52 "turnaround times"), in whole days. */
export type Turnaround = {
  /** Submission to the accountant's first decision, on average. */
  accountantDays: number | null;
  /** Submission to the Board Chair's (or Vice-Chair's) first decision, on average. */
  boardDays: number | null;
  decided: number;
  /** Expenses still waiting for a decision, longest first (at most 5). */
  slowest: { id: string; reference: string | null; department: string; days: number }[];
};

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
  turnaround: Turnaround;
  /** The filters that applied, cleaned (unknown values dropped). */
  filters: OverviewFilters;
  /** Every department on the dashboard, for the filter. */
  departments: { id: string; name: string }[];
  /** The expense list is open to this viewer, so pipeline rows can link to it. */
  canListExpenses: boolean;
};

/** Where an expense waits after submission, in the order it moves (drafts left out). */
const PIPELINE: readonly ExpenseStatus[] = EXPENSE_STATUSES.filter((s) => s !== "draft");

const DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanFilters(input: OverviewFilters): OverviewFilters {
  const date = (v?: string) => (v && ISO_DATE.test(v) ? v : undefined);
  return {
    departmentId:
      input.departmentId && z.uuid().safeParse(input.departmentId).success
        ? input.departmentId
        : undefined,
    from: date(input.from),
    to: date(input.to),
  };
}

const days = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY));

async function monthly(
  tx: Tx,
  cycleId: string,
  f: OverviewFilters = {},
): Promise<Map<number, number>> {
  const rows = await tx
    .select({
      month: sql<number>`extract(month from ${spendingEntries.spentOn})::int`,
      cents: sql<string>`coalesce(sum(case when ${spendingEntries.entryType} = 'refund'
        then -${spendingEntries.amountCents} else ${spendingEntries.amountCents} end), 0)`,
    })
    .from(spendingEntries)
    .where(
      and(
        eq(spendingEntries.budgetCycleId, cycleId),
        eq(spendingEntries.status, "recorded"),
        f.departmentId ? eq(spendingEntries.departmentId, f.departmentId) : undefined,
        f.from ? sql`${spendingEntries.spentOn} >= ${f.from}::date` : undefined,
        f.to ? sql`${spendingEntries.spentOn} <= ${f.to}::date` : undefined,
      ),
    )
    .groupBy(sql`1`);
  return new Map(rows.map((r) => [Number(r.month), Number(r.cents)]));
}

export async function spendingOverview(
  tx: Tx,
  viewer: Subject,
  cycleId?: string,
  rawFilters: OverviewFilters = {},
  now: Date = new Date(),
): Promise<SpendingOverview | null> {
  if (!authorize(viewer, "spending.view").allowed) return null;
  const full = await spendingDashboard(tx, viewer, cycleId);
  if (!full?.cycle) return null;
  const cycle = full.cycle;
  const departments = full.rows.map((r) => ({ id: r.departmentId, name: r.department }));
  const filters = cleanFilters(rawFilters);
  if (filters.departmentId && !departments.some((d) => d.id === filters.departmentId)) {
    filters.departmentId = undefined;
  }
  // One department: its own row and totals; the figures still come from the dashboard.
  const rows = filters.departmentId
    ? full.rows.filter((r) => r.departmentId === filters.departmentId)
    : full.rows;
  const dashboard = {
    ...full,
    rows,
    totals: filters.departmentId ? totalsOf(rows) : full.totals,
  };
  const expenseScope = and(
    eq(expenseSubmissions.budgetCycleId, cycle.id),
    filters.departmentId ? eq(expenseSubmissions.departmentId, filters.departmentId) : undefined,
    filters.from ? sql`${expenseSubmissions.submittedAt} >= ${filters.from}::date` : undefined,
    filters.to
      ? sql`${expenseSubmissions.submittedAt} < (${filters.to}::date + interval '1 day')`
      : undefined,
  );

  const [last] = await tx
    .select({ id: budgetCycles.id, name: budgetCycles.name })
    .from(budgetCycles)
    .where(eq(budgetCycles.budgetYear, cycle.budgetYear - 1))
    .limit(1);
  const [current, previous] = await Promise.all([
    monthly(tx, cycle.id, filters),
    // Last year is compared month by month for the same department, over the whole year.
    last ? monthly(tx, last.id, { departmentId: filters.departmentId }) : Promise.resolve(null),
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
    .where(and(expenseScope, ne(expenseSubmissions.status, "draft")))
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
    .where(and(expenseScope, inArray(expenseSubmissions.status, ["paid", "purchased", "closed"])));
  const paidDays = paid
    .filter((p) => p.approvedAt)
    .map((p) => {
      const approvedDay = Date.UTC(
        p.approvedAt!.getUTCFullYear(),
        p.approvedAt!.getUTCMonth(),
        p.approvedAt!.getUTCDate(),
      );
      return Math.max(0, Math.round((Date.parse(`${p.paidOn}T00:00:00Z`) - approvedDay) / DAY));
    });
  const average = (list: number[]) =>
    list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
  const averageDays = average(paidDays);

  // Each approver's first decision on each expense, against when it was submitted.
  const firsts = await tx
    .select({
      id: expenseSubmissions.id,
      level: expenseDecisions.level,
      submittedAt: expenseSubmissions.submittedAt,
      decidedAt: sql<Date>`min(${expenseDecisions.createdAt})`,
    })
    .from(expenseDecisions)
    .innerJoin(expenseSubmissions, eq(expenseSubmissions.id, expenseDecisions.expenseSubmissionId))
    .where(expenseScope)
    .groupBy(expenseSubmissions.id, expenseDecisions.level, expenseSubmissions.submittedAt);
  const levelDays = (level: "accountant" | "board") =>
    firsts
      .filter((f) => f.level === level && f.submittedAt)
      .map((f) => days(f.submittedAt!, new Date(f.decidedAt)));
  const waitingRows = await tx
    .select({
      id: expenseSubmissions.id,
      reference: expenseSubmissions.referenceNumber,
      department: expenseSubmissions.departmentNameSnapshot,
      submittedAt: expenseSubmissions.submittedAt,
    })
    .from(expenseSubmissions)
    .where(
      and(
        expenseScope,
        inArray(expenseSubmissions.status, [
          "submitted",
          "in_review",
          "awaiting_accountant",
          "awaiting_board",
        ]),
      ),
    )
    .orderBy(asc(expenseSubmissions.submittedAt))
    .limit(5);
  const turnaround: Turnaround = {
    accountantDays: average(levelDays("accountant")),
    boardDays: average(levelDays("board")),
    decided: new Set(firsts.map((f) => f.id)).size,
    slowest: waitingRows
      .filter((w) => w.submittedAt)
      .map((w) => ({
        id: w.id,
        reference: w.reference,
        department: w.department,
        days: days(w.submittedAt!, now),
      })),
  };

  return {
    dashboard: { ...dashboard, cycle },
    months,
    lastYear: last ?? null,
    pipeline,
    waiting,
    payments: { paid: paidDays.length, averageDays },
    turnaround,
    filters,
    departments,
    canListExpenses: authorize(viewer, "expense.view_all").allowed,
  };
}
