import { and, asc, eq, inArray } from "drizzle-orm";
import { budgetCycles, expenseSubmissions } from "@/db/schema";
import { authzContextOf } from "@/domain/expenses/service";
import type { ApprovalLevel } from "@/domain/expenses/approval";
import { levelsWaiting } from "@/domain/expenses/verbal";
import { ACCOUNTANT_WAITING } from "@/domain/expenses/status";
import { authorize } from "@/lib/authz";
import { daysBetween } from "@/domain/expenses/schema";
import { getChurchTimeZone } from "@/domain/settings";
import { zonedDate } from "@/lib/time-zone";
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

/** The accountant's decision inbox on Home (Idea 6, decided by the church 2026-11-07). */
export type AccountantInbox = {
  expenses: {
    id: string;
    referenceNumber: string;
    title: string;
    department: string;
    type: string;
    amountCents: number;
    daysWaiting: number;
    overBy: number;
  }[];
  budgets: {
    id: string;
    referenceNumber: string;
    department: string;
    requester: string;
    title: string;
    status: string;
    requestedTotalCents: number;
  }[];
  messages: { id: string; referenceNumber: string; department: string; unread: number }[];
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
  /** Every department with a budget, most used first (the spending cards on Home). */
  departments: {
    departmentId: string;
    department: string;
    /** Spent plus committed: what the used percentage counts. */
    used: number;
    available: number;
    usedTenths: number | null;
    watch: boolean;
  }[];
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
): Promise<{ today: AccountantToday; season: Season | null; inbox: AccountantInbox } | null> {
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
    inbox: {
      expenses: [...mine]
        .sort((a, b) => b.daysWaiting - a.daysWaiting)
        .map((r) => ({
          id: r.id,
          referenceNumber: r.referenceNumber ?? "",
          title: r.title,
          department: r.department,
          type: r.type,
          amountCents: r.amountCents ?? 0,
          daysWaiting: r.daysWaiting,
          overBy: r.overBy,
        })),
      budgets: awaiting.map((r) => ({
        id: r.requestId,
        referenceNumber: r.referenceNumber,
        department: r.departmentName,
        requester: r.requesterName,
        title: r.title,
        status: r.status,
        requestedTotalCents: r.requestedTotalCents,
      })),
      messages: (review?.queue ?? [])
        .filter((r) => r.unreadMessages > 0)
        .map((r) => ({
          id: r.requestId,
          referenceNumber: r.referenceNumber,
          department: r.departmentName,
          unread: r.unreadMessages,
        })),
    },
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
      departments: dashboard.rows
        .filter((r) => r.figures.available > 0)
        .sort((a, b) => (b.usedTenths ?? 0) - (a.usedTenths ?? 0))
        .map((r) => ({
          departmentId: r.departmentId,
          department: r.department,
          used: sumCents([r.figures.spent, r.figures.committed]),
          available: r.figures.available,
          usedTenths: r.usedTenths,
          watch: r.status === "over_budget" || r.status === "nearing_limit",
        })),
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

/** One card on the Church Administrator's payment board. */
export type BoardCard = {
  id: string;
  referenceNumber: string;
  title: string;
  department: string;
  amountCents: number;
  daysWaiting: number;
  /** Ready and Processing: the ready-queue row (who is paid, how it's bought, may pay). */
  ready?: ReadyRow;
  /** Waiting: the approvals still to come, and whether a verbal one may be recorded. */
  needs?: ApprovalLevel[];
  canRecordVerbal?: boolean;
  /** Paid: how and when. */
  method?: string;
  paidOn?: string;
};

export type PaymentBoard = {
  toPay: { count: number; cents: number };
  owed: { cents: number; cheques: number };
  waitingCount: number;
  paid30: { count: number; cents: number };
  columns: {
    waiting: BoardCard[];
    ready: BoardCard[];
    processing: BoardCard[];
    paidWeek: BoardCard[];
  };
};

const AWAITING_APPROVAL = [...new Set([...ACCOUNTANT_WAITING, ...BOARD_WAITING])];

/**
 * The Church Administrator's payment board (decided by the church 2026-11-07): every
 * expense from waiting on its approvals to paid this week, with four tiles above. It
 * replaces Ready to pay and the payment and waiting tasks on Home, so nothing shows twice.
 */
export async function paymentBoard(
  tx: Tx,
  viewer: Viewer,
  now: Date,
): Promise<PaymentBoard | null> {
  if (!hasRole(viewer, "church_admin")) return null;
  const queue = await readyQueue(tx, viewer, {}, now);
  if (!queue) return null;
  const zone = await getChurchTimeZone(tx);
  const today = zonedDate(now, zone);
  const waitingRows = await tx
    .select()
    .from(expenseSubmissions)
    .where(inArray(expenseSubmissions.status, AWAITING_APPROVAL))
    .orderBy(asc(expenseSubmissions.submittedAt))
    .limit(50);
  const toCard = (r: ReadyRow): BoardCard => ({
    id: r.id,
    referenceNumber: r.referenceNumber,
    title: r.title,
    department: r.department,
    amountCents: r.approvedCents,
    daysWaiting: r.daysWaiting,
    ready: r,
  });
  const byAge = [...queue.rows].sort((a, b) => b.daysWaiting - a.daysWaiting);
  const owedRows = queue.rows.filter(
    (r) => r.type === "expense_claim" && r.payeeKind !== "church_card",
  );
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  return {
    toPay: { count: queue.rows.length, cents: queue.waitingCents },
    owed: { cents: queue.owedCents, cheques: owedRows.length },
    waitingCount: waitingRows.length,
    paid30: {
      count: queue.recent.length,
      cents: sumCents(queue.recent.map((r) => r.amountCents)),
    },
    columns: {
      waiting: waitingRows.map((r) => ({
        id: r.id,
        referenceNumber: r.referenceNumber ?? "",
        title: r.title,
        department: r.departmentNameSnapshot,
        amountCents: r.totalCents ?? 0,
        daysWaiting: r.submittedAt
          ? Math.max(0, daysBetween(zonedDate(r.submittedAt, zone), today))
          : 0,
        needs: levelsWaiting(r),
        canRecordVerbal: authorize(viewer, "expense.record_verbal_approval", authzContextOf(r))
          .allowed,
      })),
      ready: byAge.filter((r) => r.status === "approved").map(toCard),
      processing: byAge.filter((r) => r.status === "processing").map(toCard),
      paidWeek: queue.recent
        .filter((r) => r.paidOn >= weekAgo)
        .map((r) => ({
          id: r.id,
          referenceNumber: r.referenceNumber,
          title: r.title,
          department: r.department,
          amountCents: r.amountCents,
          daysWaiting: 0,
          method: r.method,
          paidOn: r.paidOn,
        })),
    },
  };
}
