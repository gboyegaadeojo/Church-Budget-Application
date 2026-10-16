import { and, inArray } from "drizzle-orm";
import { approvalDecisions } from "@/db/schema";
import type { Tx } from "@/db/types";
import {
  AWAITING,
  getReviewDashboard,
  type BoardAllocation,
  type CycleOption,
  type DashboardCounts,
  type Progress,
} from "@/domain/annual/review-queries";
import { isApproved } from "@/domain/annual/status";
import type { Subject } from "@/lib/authz";

/**
 * The Overview tab of Analytics & Audit (FR-52) for the annual budget: the board total
 * against what's approved, requested against approved (with tax), where each department
 * is, and how long decisions take. Built on the review dashboard's figures, so every
 * number matches the dashboard and the exports to the cent. Only for people who may
 * review annual budgets (`annual.review`): spending and expense figures, which the Church
 * Administrator and the board see, arrive with Stages 3 and 4.
 */

export const OVERVIEW_STAGES = [
  "not_started",
  "draft",
  "submitted",
  "in_review",
  "returned",
  "approved",
  "declined",
] as const;
export type OverviewStage = (typeof OVERVIEW_STAGES)[number];

export function stageOf(progress: Progress): OverviewStage {
  switch (progress) {
    case "not_submitted":
      return "not_started";
    case "draft_exists":
      return "draft";
    case "submitted":
    case "updated":
      return "submitted";
    case "in_review":
    case "awaiting_second_approval":
      return "in_review";
    case "returned":
      return "returned";
    case "declined":
      return "declined";
    default:
      return isApproved(progress) ? "approved" : "submitted";
  }
}

/** The review dashboard filter that lists a stage's budgets, where there is one. */
export const STAGE_FILTER: Partial<Record<OverviewStage, string>> = {
  submitted: "awaiting",
  in_review: "awaiting",
  returned: "returned",
  approved: "approved",
  declined: "declined",
};

export type OverviewDepartment = {
  id: string;
  name: string;
  stage: OverviewStage;
  requestId: string | null;
  reference: string | null;
  requestedCents: number | null;
  approvedCents: number | null;
};

export type Overview = {
  cycles: CycleOption[];
  cycle: CycleOption | null;
  board: BoardAllocation | null;
  counts: DashboardCounts;
  stages: { stage: OverviewStage; count: number }[];
  departments: OverviewDepartment[];
  turnaround: {
    decided: number;
    /** Whole days from submission to the decision, on average; null before any. */
    averageDays: number | null;
    /** Budgets waiting on the accountant, longest first (at most 5). */
    waiting: { requestId: string; reference: string; department: string; days: number }[];
  };
};

const DAY = 86_400_000;
const FINAL = ["approved", "second_approved", "declined"] as const;

export async function getOverview(
  tx: Tx,
  actor: Subject,
  { cycleId, now = new Date() }: { cycleId?: string; now?: Date } = {},
): Promise<Overview | null> {
  const dashboard = await getReviewDashboard(tx, actor, { cycleId });
  if (!dashboard) return null;

  const departments: OverviewDepartment[] = dashboard.departments.map((d) => ({
    id: d.departmentId,
    name: d.departmentName,
    stage: stageOf(d.progress),
    requestId: d.requestId,
    reference: d.referenceNumber,
    requestedCents: d.requestedTotalCents,
    approvedCents: d.approvedTotalCents,
  }));
  const stages = OVERVIEW_STAGES.map((stage) => ({
    stage,
    count: departments.filter((d) => d.stage === stage).length,
  }));

  // Decisions: the latest final decision on each approved or declined budget.
  const decidedRows = dashboard.departments.filter((d) => {
    const stage = stageOf(d.progress);
    return d.requestId && d.submittedAt && (stage === "approved" || stage === "declined");
  });
  const decisions = decidedRows.length
    ? await tx
        .select({
          requestId: approvalDecisions.budgetRequestId,
          at: approvalDecisions.createdAt,
        })
        .from(approvalDecisions)
        .where(
          and(
            inArray(
              approvalDecisions.budgetRequestId,
              decidedRows.map((d) => d.requestId!),
            ),
            inArray(approvalDecisions.decision, [...FINAL]),
          ),
        )
    : [];
  const decidedAt = new Map<string, Date>();
  for (const d of decisions) {
    const before = decidedAt.get(d.requestId);
    if (!before || d.at > before) decidedAt.set(d.requestId, d.at);
  }
  const spans = decidedRows.flatMap((d) => {
    const at = decidedAt.get(d.requestId!);
    return at ? [Math.max(0, at.getTime() - d.submittedAt!.getTime())] : [];
  });

  const waiting = dashboard.departments
    .filter(
      (d) =>
        d.requestId &&
        d.submittedAt &&
        d.progress !== "not_submitted" &&
        d.progress !== "draft_exists" &&
        AWAITING.includes(d.progress),
    )
    .map((d) => ({
      requestId: d.requestId!,
      reference: d.referenceNumber ?? "",
      department: d.departmentName,
      days: Math.floor((now.getTime() - d.submittedAt!.getTime()) / DAY),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  return {
    cycles: dashboard.cycles,
    cycle: dashboard.cycle,
    board: dashboard.board,
    counts: dashboard.counts,
    stages,
    departments,
    turnaround: {
      decided: spans.length,
      averageDays: spans.length
        ? Math.round(spans.reduce((s, x) => s + x, 0) / spans.length / DAY)
        : null,
      waiting,
    },
  };
}
