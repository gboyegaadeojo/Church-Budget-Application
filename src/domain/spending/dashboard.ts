import { and, asc, desc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  budgetAmendments,
  budgetCycles,
  budgetLineItems,
  budgetRequests,
  departments,
  spendingEntries,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import {
  approvedAnnualBudget,
  budgetFigures,
  budgetStatus,
  nearLimitThreshold,
  usedTenthsOfPercent,
  type BudgetFigures,
  type BudgetStatus,
} from "@/domain/expenses/budget";
import { authorize, type Subject } from "@/lib/authz";
import { sumCents } from "@/lib/money";

/**
 * The spending dashboard and Budget vs Actual (FR-25, FR-26, DRD 6.8): for one cycle, the
 * totals across departments and a row per department with its approved budget,
 * amendments, available, committed, spent, remaining, percentage used, status and last
 * entry date. The accountant and Church Administrator act on it; the board and the
 * System Administrator read it. Every figure comes from `budgetFigures`, so the dashboard,
 * the export and the Overview tab agree to the cent (AC-91, AC-127).
 */

export type DashboardRow = {
  departmentId: string;
  department: string;
  figures: BudgetFigures;
  status: BudgetStatus;
  usedTenths: number | null;
  lastEntryOn: string | null;
  /** Spending recorded with no approved budget (FR-24 "Unbudgeted"). */
  unbudgetedCents: number;
};

export type Dashboard = {
  cycles: { id: string; name: string; locked: boolean }[];
  cycle: {
    id: string;
    name: string;
    locked: boolean;
    lockedAt: Date | null;
    version: number;
    spendingPeriodEnd: string | null;
    budgetYear: number;
  } | null;
  rows: DashboardRow[];
  totals: {
    approved: number;
    amendments: number;
    available: number;
    committed: number;
    pending: number;
    spent: number;
    remaining: number;
    usedTenths: number | null;
  };
  threshold: string;
  readOnly: boolean;
  canRecord: boolean;
  canAmend: boolean;
  canLock: boolean;
  canExport: boolean;
};

const EMPTY_TOTALS = {
  approved: 0,
  amendments: 0,
  available: 0,
  committed: 0,
  pending: 0,
  spent: 0,
  remaining: 0,
  usedTenths: null,
};

export async function spendingDashboard(
  tx: Tx,
  viewer: Subject,
  cycleId?: string,
): Promise<Dashboard | null> {
  const access = authorize(viewer, "spending.view");
  if (!access.allowed) return null;
  const all = await tx.select().from(budgetCycles).orderBy(desc(budgetCycles.budgetYear));
  const cycles = all.map((c) => ({ id: c.id, name: c.name, locked: c.spendingLockedAt !== null }));
  const thisYear = new Date().getUTCFullYear();
  const chosen =
    all.find((c) => c.id === cycleId) ??
    all.find((c) => c.budgetYear === thisYear) ??
    all.find((c) => c.status === "open") ??
    all[0];
  const flags = {
    readOnly: access.readOnly,
    canRecord: authorize(viewer, "spending.record").allowed,
    canAmend: authorize(viewer, "spending.amend").allowed,
    canLock: authorize(viewer, "cycles.close").allowed,
    canExport: authorize(viewer, "spending.export").allowed,
  };
  const threshold = await nearLimitThreshold(tx);
  if (!chosen) return { cycles, cycle: null, rows: [], totals: EMPTY_TOTALS, threshold, ...flags };

  // Departments with a budget request, spending or an active status this cycle.
  const withRequest = await tx
    .select({ id: budgetRequests.departmentId })
    .from(budgetRequests)
    .where(eq(budgetRequests.budgetCycleId, chosen.id));
  const withSpending = await tx
    .selectDistinct({ id: spendingEntries.departmentId })
    .from(spendingEntries)
    .where(eq(spendingEntries.budgetCycleId, chosen.id));
  const ids = new Set([...withRequest, ...withSpending].map((r) => r.id));
  const depts = await tx
    .select({ id: departments.id, name: departments.name, status: departments.status })
    .from(departments)
    .where(
      ids.size > 0
        ? or(eq(departments.status, "active"), inArray(departments.id, [...ids]))
        : eq(departments.status, "active"),
    )
    .orderBy(asc(departments.name));

  const last = await tx
    .select({ id: spendingEntries.departmentId, on: max(spendingEntries.spentOn) })
    .from(spendingEntries)
    .where(
      and(eq(spendingEntries.budgetCycleId, chosen.id), eq(spendingEntries.status, "recorded")),
    )
    .groupBy(spendingEntries.departmentId);
  const lastOn = new Map(last.map((l) => [l.id, l.on]));
  const unbudgeted = await tx
    .select({
      id: spendingEntries.departmentId,
      cents: sql<string>`coalesce(sum(case when ${spendingEntries.entryType} = 'refund'
        then -${spendingEntries.amountCents} else ${spendingEntries.amountCents} end), 0)`,
    })
    .from(spendingEntries)
    .where(
      and(
        eq(spendingEntries.budgetCycleId, chosen.id),
        eq(spendingEntries.status, "recorded"),
        eq(spendingEntries.unbudgeted, true),
      ),
    )
    .groupBy(spendingEntries.departmentId);
  const unbudgetedOf = new Map(unbudgeted.map((u) => [u.id, Number(u.cents)]));

  const rows: DashboardRow[] = [];
  for (const d of depts) {
    const figures = await budgetFigures(tx, chosen.id, d.id);
    const hasActivity =
      figures.annualRequestId !== null || figures.spent !== 0 || figures.committed !== 0;
    // A department with nothing this year and no longer active isn't listed.
    if (!hasActivity && d.status !== "active") continue;
    rows.push({
      departmentId: d.id,
      department: d.name,
      figures,
      status: budgetStatus(figures, threshold),
      usedTenths: usedTenthsOfPercent(figures),
      lastEntryOn: lastOn.get(d.id) ?? null,
      unbudgetedCents: unbudgetedOf.get(d.id) ?? 0,
    });
  }
  const sum = (pick: (f: BudgetFigures) => number) => sumCents(rows.map((r) => pick(r.figures)));
  const totals = {
    approved: sum((f) => f.approved),
    amendments: sum((f) => f.amendments),
    available: sum((f) => f.available),
    committed: sum((f) => f.committed),
    pending: sum((f) => f.pending),
    spent: sum((f) => f.spent),
    remaining: sum((f) => f.remaining),
    usedTenths: null as number | null,
  };
  totals.usedTenths = usedTenthsOfPercent(totals);
  return {
    cycles,
    cycle: {
      id: chosen.id,
      name: chosen.name,
      locked: chosen.spendingLockedAt !== null,
      lockedAt: chosen.spendingLockedAt,
      version: chosen.version,
      spendingPeriodEnd: chosen.spendingPeriodEnd,
      budgetYear: chosen.budgetYear,
    },
    rows,
    totals,
    threshold,
    ...flags,
  };
}

// ---------------------------------------------------------------- one department

export type AmendmentView = {
  id: string;
  amountBeforeTaxCents: number;
  taxCents: number;
  amountCents: number;
  reason: string;
  boardReference: string | null;
  by: string;
  at: Date;
};

export type LineSpending = { lineId: string | null; name: string; spentCents: number };

export type DepartmentSpending = {
  department: { id: string; name: string };
  cycle: { id: string; name: string; locked: boolean };
  figures: BudgetFigures;
  status: BudgetStatus;
  usedTenths: number | null;
  amendments: AmendmentView[];
  /** Spending by approved line; unlinked entries are "General" (FR-25). */
  lines: LineSpending[];
  canAmend: boolean;
  canRecord: boolean;
  rate: string | null;
};

/** The drill-down from the dashboard: one department's budget, amendments and lines. */
export async function departmentSpending(
  tx: Tx,
  viewer: Subject,
  cycleId: string,
  departmentId: string,
): Promise<DepartmentSpending | null> {
  if (!authorize(viewer, "spending.view").allowed) return null;
  if (!z.uuid().safeParse(cycleId).success || !z.uuid().safeParse(departmentId).success) {
    return null;
  }
  const [cycle] = await tx.select().from(budgetCycles).where(eq(budgetCycles.id, cycleId));
  const [department] = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.id, departmentId));
  if (!cycle || !department) return null;
  const figures = await budgetFigures(tx, cycleId, departmentId);
  const annual = await approvedAnnualBudget(tx, cycleId, departmentId);

  const amendments = await tx
    .select({ a: budgetAmendments, by: users.displayName })
    .from(budgetAmendments)
    .innerJoin(users, eq(users.id, budgetAmendments.createdByUserId))
    .where(
      and(
        eq(budgetAmendments.budgetCycleId, cycleId),
        eq(budgetAmendments.departmentId, departmentId),
      ),
    )
    .orderBy(asc(budgetAmendments.createdAt));

  const approvedLines = annual
    ? await tx
        .select({
          id: budgetLineItems.id,
          name: budgetLineItems.itemName,
        })
        .from(budgetLineItems)
        .where(
          and(
            eq(budgetLineItems.budgetRequestId, annual.requestId),
            isNull(budgetLineItems.supersededAt),
          ),
        )
        .orderBy(asc(budgetLineItems.sortOrder))
    : [];
  const byLine = await tx
    .select({
      lineId: spendingEntries.budgetLineItemId,
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
    )
    .groupBy(spendingEntries.budgetLineItemId);
  const spentBy = new Map(byLine.map((b) => [b.lineId, Number(b.cents)]));
  const lines: LineSpending[] = [
    ...approvedLines.map((l) => ({
      lineId: l.id,
      name: l.name,
      spentCents: spentBy.get(l.id) ?? 0,
    })),
    { lineId: null, name: "", spentCents: spentBy.get(null) ?? 0 },
  ];
  const [request] = annual
    ? await tx
        .select({ rate: budgetRequests.taxRate })
        .from(budgetRequests)
        .where(eq(budgetRequests.id, annual.requestId))
    : [];

  return {
    department,
    cycle: { id: cycle.id, name: cycle.name, locked: cycle.spendingLockedAt !== null },
    figures,
    status: budgetStatus(figures, await nearLimitThreshold(tx)),
    usedTenths: usedTenthsOfPercent(figures),
    amendments: amendments.map(({ a, by }) => ({
      id: a.id,
      amountBeforeTaxCents: a.amountBeforeTaxCents,
      taxCents: a.taxCents,
      amountCents: a.amountCents,
      reason: a.reason,
      boardReference: a.boardReference,
      by,
      at: a.createdAt,
    })),
    lines,
    canAmend: authorize(viewer, "spending.amend").allowed && annual !== null,
    canRecord: authorize(viewer, "spending.record").allowed && cycle.spendingLockedAt === null,
    rate: request?.rate ?? null,
  };
}
