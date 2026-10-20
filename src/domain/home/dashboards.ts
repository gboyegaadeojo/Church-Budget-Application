import { and, asc, eq, inArray } from "drizzle-orm";
import { budgetCycles } from "@/db/schema";
import type { Tx } from "@/db/types";
import { heldDecisions, cycleRelease } from "@/domain/annual/release";
import { getReviewDashboard, type Progress } from "@/domain/annual/review-queries";
import { spendingOverview } from "@/domain/analytics/spending";
import { BOARD_WAITING, type ExpenseStatus } from "@/domain/expenses/status";
import { readyQueue, type ReadyRow } from "@/domain/expenses/payment-queries";
import { accountantQueue, boardQueue, type QueueRow } from "@/domain/expenses/review-queries";
import { usersWithRole } from "@/domain/notifications/recipients";
import { readSettings } from "@/domain/settings";
import { getMyAway } from "@/domain/users/away";
import { sumCents } from "@/lib/money";
import { hasRole, type Viewer } from "@/lib/roles";

/**
 * Home's dashboards for the accountant and the board (decided by the church 2026-10-20):
 * what needs them today, the budget season, expenses moving through approval, the year's
 * spending and the departments to watch. Each figure comes from the read model of the
 * screen it links to (review dashboard, approval queues, spending overview), so Home and
 * those screens always agree. Each part is null when the viewer's roles don't include it.
 */

export type Availability = {
  /** "accountant" for the Primary accountant, "backup" for other approvers, or a board role. */
  role: "primary" | "backup" | "board_chair" | "vice_chair";
  away: boolean;
  until: Date | null;
};

export type SeasonBucket =
  "approved" | "review" | "submitted" | "returned" | "drafting" | "not_started" | "declined";

export type Season = {
  cycleId: string;
  cycleName: string;
  deadline: Date;
  expected: number;
  buckets: Record<SeasonBucket, number>;
  requestedCents: number;
  boardTotalCents: number | null;
};

export type AccountantToday = {
  expenses: { count: number; cents: number; overBudget: number; oldestDays: number | null };
  annual: { awaiting: number; updated: number };
  unreadMessages: number;
  release: { held: number; releaseAt: Date | null };
};

export type Pipeline = {
  stages: Record<"approving" | "returned" | "toPay" | "paid", { count: number; cents: number }>;
  accountantDays: number | null;
  boardDays: number | null;
};

export type YearSpending = {
  cycleName: string;
  available: number;
  spent: number;
  committed: number;
  remaining: number;
  usedTenths: number | null;
  /** How much of the spending year has gone, in tenths of a percent. */
  elapsedTenths: number;
  boardTotalCents: number | null;
  watch: { departmentId: string; department: string; overBy: number; usedTenths: number | null }[];
};

export type BoardApprovals = {
  rows: QueueRow[];
  count: number;
  cents: number;
  oldestDays: number | null;
  canDecideAny: boolean;
  /** For a Vice-Chair: the Board Chair, and whether they're away (then the Vice decides). */
  chair: { name: string | null; away: boolean; until: Date | null } | null;
};

export type BudgetYear = {
  id: string;
  name: string;
  status: string;
  deadline: Date;
  spendingEnds: string;
};

const BUCKET: Record<Progress, SeasonBucket> = {
  not_submitted: "not_started",
  draft_exists: "drafting",
  submitted: "submitted",
  updated: "submitted",
  in_review: "review",
  awaiting_second_approval: "review",
  returned: "returned",
  approved: "approved",
  closed: "approved",
  declined: "declined",
};

const APPROVING: readonly ExpenseStatus[] = [
  "submitted",
  "in_review",
  "awaiting_accountant",
  "awaiting_board",
];
const TO_PAY: readonly ExpenseStatus[] = ["approved", "processing"];
const PAID: readonly ExpenseStatus[] = ["paid", "purchased", "closed"];

export async function availability(
  tx: Tx,
  viewer: Viewer,
  now: Date,
): Promise<Availability | null> {
  let role: Availability["role"] | null = null;
  if (hasRole(viewer, "accountant", "backup_approver")) {
    const { primary_accountant_user_id } = await readSettings(tx, ["primary_accountant_user_id"]);
    role = primary_accountant_user_id === viewer.id ? "primary" : "backup";
  } else if (hasRole(viewer, "board_chair")) role = "board_chair";
  else if (hasRole(viewer, "vice_chair")) role = "vice_chair";
  if (!role) return null;
  const away = await getMyAway(tx, viewer.id, now);
  return { role, away: away.active, until: away.active ? away.until : null };
}

/** The four "Needs you today" counts, and the open cycle's season, for the accountant. */
export async function accountantDashboard(
  tx: Tx,
  viewer: Viewer,
  now: Date,
): Promise<{ today: AccountantToday; season: Season | null } | null> {
  if (!hasRole(viewer, "accountant", "backup_approver")) return null;
  const [queue, review] = await Promise.all([
    accountantQueue(tx, viewer, {}, now),
    getReviewDashboard(tx, viewer),
  ]);
  const mine = (queue?.rows ?? []).filter((r) => r.canDecide);
  const awaiting = (review?.queue ?? []).filter((r) =>
    ["submitted", "updated", "in_review", "awaiting_second_approval"].includes(r.status),
  );
  const cycle = review?.cycle && review.cycle.status === "open" ? review.cycle : null;
  const [held, release] = cycle
    ? await Promise.all([heldDecisions(tx, { cycleId: cycle.id }), cycleRelease(tx, cycle.id, now)])
    : [[], null];

  let season: Season | null = null;
  if (cycle && review) {
    const [row] = await tx
      .select({ deadline: budgetCycles.submissionDeadline })
      .from(budgetCycles)
      .where(eq(budgetCycles.id, cycle.id));
    const buckets: Record<SeasonBucket, number> = {
      approved: 0,
      review: 0,
      submitted: 0,
      returned: 0,
      drafting: 0,
      not_started: 0,
      declined: 0,
    };
    for (const d of review.departments) buckets[BUCKET[d.progress]]++;
    season = {
      cycleId: cycle.id,
      cycleName: cycle.name,
      deadline: row!.deadline,
      expected: review.departments.length,
      buckets,
      requestedCents: review.counts.totalRequestedCents,
      boardTotalCents: review.board?.totalCents ?? null,
    };
  }

  return {
    today: {
      expenses: {
        count: mine.length,
        cents: sumCents(mine.map((r) => r.amountCents ?? 0)),
        overBudget: mine.filter((r) => r.overBy > 0).length,
        oldestDays: mine.length > 0 ? Math.max(...mine.map((r) => r.daysWaiting)) : null,
      },
      annual: {
        awaiting: awaiting.length,
        updated: awaiting.filter((r) => r.status === "updated").length,
      },
      unreadMessages: (review?.queue ?? []).reduce((n, r) => n + r.unreadMessages, 0),
      release: {
        held: held.length,
        releaseAt: release?.holding ? release.releaseAt : null,
      },
    },
    season,
  };
}

/** The year's spending, the departments to watch and the expense pipeline (spending.view). */
export async function spendingSummary(
  tx: Tx,
  viewer: Viewer,
  now: Date,
): Promise<{ year: YearSpending; pipeline: Pipeline } | null> {
  const overview = await spendingOverview(tx, viewer, undefined, {}, now);
  if (!overview) return null;
  const { dashboard } = overview;
  const cycle = dashboard.cycle;
  const [row] = await tx
    .select({ boardTotal: budgetCycles.boardTotalCents, startDate: budgetCycles.startDate })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, cycle.id));
  const start = Date.parse(`${row?.startDate ?? `${cycle.budgetYear}-01-01`}T00:00:00Z`);
  const end = Date.parse(`${cycle.spendingPeriodEnd ?? `${cycle.budgetYear}-12-31`}T23:59:59Z`);
  const elapsed =
    end <= start ? 1000 : Math.round(((now.getTime() - start) / (end - start)) * 1000);
  const watch = dashboard.rows
    .filter((r) => r.status === "over_budget" || r.status === "nearing_limit")
    .sort((a, b) => (b.usedTenths ?? 0) - (a.usedTenths ?? 0))
    .slice(0, 4)
    .map((r) => ({
      departmentId: r.departmentId,
      department: r.department,
      overBy: r.status === "over_budget" ? -r.figures.remaining : 0,
      usedTenths: r.usedTenths,
    }));
  const stage = (statuses: readonly ExpenseStatus[]) => {
    const rows = overview.pipeline.filter((p) => statuses.includes(p.status));
    return {
      count: rows.reduce((n, p) => n + p.count, 0),
      cents: sumCents(rows.map((p) => p.cents)),
    };
  };
  return {
    year: {
      cycleName: cycle.name,
      available: dashboard.totals.available,
      spent: dashboard.totals.spent,
      committed: dashboard.totals.committed,
      remaining: dashboard.totals.remaining,
      usedTenths: dashboard.totals.usedTenths,
      elapsedTenths: Math.min(1000, Math.max(0, elapsed)),
      boardTotalCents: row?.boardTotal ?? null,
      watch,
    },
    pipeline: {
      stages: {
        approving: stage(APPROVING),
        returned: stage(["returned"]),
        toPay: stage(TO_PAY),
        paid: stage(PAID),
      },
      accountantDays: overview.turnaround.accountantDays,
      boardDays: overview.turnaround.boardDays,
    },
  };
}

/** What waits for the Board Chair or Vice-Chair, oldest first (6B.4, AC-112). */
export async function boardApprovals(
  tx: Tx,
  viewer: Viewer,
  now: Date,
): Promise<BoardApprovals | null> {
  if (!hasRole(viewer, "board_chair", "vice_chair")) return null;
  const queue = await boardQueue(tx, viewer, {}, now);
  if (!queue) return null;
  const waiting = queue.rows.filter((r) => BOARD_WAITING.includes(r.status));
  let chair: BoardApprovals["chair"] = null;
  if (!hasRole(viewer, "board_chair")) {
    // With more than one Board Chair, the Vice-Chair covers only when all of them are away.
    const chairs = await usersWithRole(tx, ["board_chair"]);
    if (chairs.length > 0) {
      const windows = await Promise.all(chairs.map((c) => getMyAway(tx, c.userId, now)));
      const allAway = windows.every((w) => w.active);
      chair = {
        name: chairs.length === 1 ? chairs[0].name : null,
        away: allAway,
        until: allAway && chairs.length === 1 ? windows[0].until : null,
      };
    }
  }
  return {
    rows: waiting.slice(0, 5),
    count: waiting.length,
    cents: queue.waitingCents,
    oldestDays: queue.oldestDays,
    canDecideAny: waiting.some((r) => r.canDecide),
    chair,
  };
}

/** Draft and open budget years, newest first, for the board's Budget years card. */
export async function budgetYears(tx: Tx): Promise<BudgetYear[]> {
  const rows = await tx
    .select({
      id: budgetCycles.id,
      name: budgetCycles.name,
      status: budgetCycles.status,
      deadline: budgetCycles.submissionDeadline,
      budgetYear: budgetCycles.budgetYear,
      spendingPeriodEnd: budgetCycles.spendingPeriodEnd,
    })
    .from(budgetCycles)
    .where(and(inArray(budgetCycles.status, ["draft", "open"])))
    .orderBy(asc(budgetCycles.budgetYear));
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      deadline: r.deadline,
      spendingEnds: r.spendingPeriodEnd ?? `${r.budgetYear}-12-31`,
    }))
    .reverse();
}

export type PaymentsToday = {
  rows: ReadyRow[];
  count: number;
  cents: number;
  oldestDays: number | null;
  paidRecently: { count: number; cents: number };
};

/** The Church Administrator's Ready to process, oldest first, and what was paid lately (6B.5). */
export async function paymentsToday(
  tx: Tx,
  viewer: Viewer,
  now: Date,
): Promise<PaymentsToday | null> {
  if (!hasRole(viewer, "church_admin")) return null;
  const queue = await readyQueue(tx, viewer, {}, now);
  if (!queue) return null;
  const oldest = [...queue.rows].sort((a, b) => b.daysWaiting - a.daysWaiting);
  return {
    rows: oldest.slice(0, 5),
    count: queue.rows.length,
    cents: queue.waitingCents,
    oldestDays: queue.oldestDays,
    paidRecently: {
      count: queue.recent.length,
      cents: sumCents(queue.recent.map((r) => r.amountCents)),
    },
  };
}
