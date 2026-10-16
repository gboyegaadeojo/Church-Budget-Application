import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { secondApprovalThreshold } from "@/domain/settings";
import { unreadCounts } from "./messages";
import { cycleRelease, type CycleRelease } from "./release";
import {
  approvalAdjustments,
  approvalDecisions,
  approvedLineItems,
  budgetCycles,
  budgetRequests,
  departments,
  requestRevisions,
  userDepartments,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { authorize, type DenyReason, type Subject } from "@/lib/authz";
import { sumCents } from "@/lib/money";
import { getRequestView, type RequestView } from "./queries";
import { lineRowsOf } from "./service";
import { canTransition, isApproved, type AnnualStatus } from "./status";

/**
 * What the accountant sees: the dashboard (FR-13, FR-14, DRD 6.6) and one request under
 * review (FR-15 to FR-18a, DRD 6.7). Read-only queries; the System Administrator gets
 * the same views with `readOnly` set.
 */

// ---------------------------------------------------------------- dashboard

/** A department's place in the cycle: no request, a draft only, or the request's status. */
export type Progress = "not_submitted" | "draft_exists" | Exclude<AnnualStatus, "draft">;

/** Statuses that need the accountant's attention (DRD 6.6 "awaiting review"). */
export const AWAITING: readonly AnnualStatus[] = [
  "submitted",
  "updated",
  "in_review",
  "awaiting_second_approval",
];

export type DashboardDepartment = {
  departmentId: string;
  departmentName: string;
  /** The Primary requester, or the first representative if no Primary is set. */
  representative: string | null;
  progress: Progress;
  /** Only once submitted: a draft's contents stay with the department (FR-14). */
  requestId: string | null;
  referenceNumber: string | null;
  submittedAt: Date | null;
  requestedTotalCents: number | null;
  approvedTotalCents: number | null;
};

export type QueueRow = {
  requestId: string;
  referenceNumber: string;
  departmentId: string;
  departmentName: string;
  requesterName: string;
  title: string;
  submittedAt: Date;
  status: Exclude<AnnualStatus, "draft">;
  requestedTotalCents: number;
  approvedTotalCents: number | null;
  /** Messages from the department not read yet by this accountant (DRD 6.11a). */
  unreadMessages: number;
};

export type DashboardCounts = {
  expected: number;
  submitted: number;
  outstanding: number;
  awaitingReview: number;
  returned: number;
  approved: number;
  declined: number;
  totalRequestedCents: number;
  totalApprovedCents: number;
};

export type CycleOption = { id: string; name: string; budgetYear: number; status: string };

export type QueueFilter = "all" | "awaiting" | "returned" | "approved" | "declined";
export const QUEUE_FILTERS: readonly QueueFilter[] = [
  "all",
  "awaiting",
  "returned",
  "approved",
  "declined",
];

/** The board-approved church total for a cycle and what's approved so far (4.2, DRD 6.7a). */
export type BoardAllocation = {
  totalCents: number;
  allocatedCents: number;
  reference: string | null;
};

/**
 * The cycle's board total and the sum of approved department totals, leaving out
 * `exceptRequestId` (the budget being decided, so re-approving it isn't counted twice).
 * Null when the cycle has no board total.
 */
export async function boardAllocation(
  tx: Tx,
  cycleId: string,
  exceptRequestId?: string,
): Promise<BoardAllocation | null> {
  const [cycle] = await tx
    .select({ total: budgetCycles.boardTotalCents, reference: budgetCycles.boardReference })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, cycleId));
  if (!cycle || cycle.total === null) return null;
  const approved = await tx
    .select({
      id: budgetRequests.id,
      status: budgetRequests.status,
      total: budgetRequests.approvedTotalCents,
    })
    .from(budgetRequests)
    .where(eq(budgetRequests.budgetCycleId, cycleId));
  const allocatedCents = sumCents(
    approved
      .filter((r) => r.id !== exceptRequestId && isApproved(r.status))
      .map((r) => r.total ?? 0),
  );
  return { totalCents: cycle.total, allocatedCents, reference: cycle.reference };
}

export type ReviewDashboard = {
  cycles: CycleOption[];
  cycle: CycleOption | null;
  board: BoardAllocation | null;
  /** Hold mode for the cycle (FR-19a, DRD 6.7b). */
  release: CycleRelease | null;
  counts: DashboardCounts;
  departments: DashboardDepartment[];
  queue: QueueRow[];
  readOnly: boolean;
};

export type DashboardFilters = {
  cycleId?: string;
  status?: string;
  departmentId?: string;
  q?: string;
};

const EMPTY_COUNTS: DashboardCounts = {
  expected: 0,
  submitted: 0,
  outstanding: 0,
  awaitingReview: 0,
  returned: 0,
  approved: 0,
  declined: 0,
  totalRequestedCents: 0,
  totalApprovedCents: 0,
};

/** Whether a request with this status belongs under a dashboard status filter. */
export function matchesFilter(status: AnnualStatus, filter: QueueFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "awaiting":
      return AWAITING.includes(status);
    case "returned":
      return status === "returned";
    case "approved":
      return isApproved(status);
    case "declined":
      return status === "declined";
  }
}

/** Waiting on the accountant first, then the department, then decided; oldest first. */
function queueRank(status: AnnualStatus): number {
  if (status === "updated") return 0;
  if (AWAITING.includes(status)) return 1;
  if (status === "returned") return 2;
  return 3;
}

/**
 * The dashboard for one cycle: the open cycle unless another is chosen. Expected
 * departments are the active ones plus any other department with a submitted request
 * this cycle (a Proposed one, say). A draft never counts as submitted (AC-48).
 * Returns null when the person may not see it.
 */
export async function getReviewDashboard(
  tx: Tx,
  actor: Subject,
  filters: DashboardFilters = {},
): Promise<ReviewDashboard | null> {
  const access = authorize(actor, "annual.review");
  if (!access.allowed) return null;

  const cycles = await tx
    .select({
      id: budgetCycles.id,
      name: budgetCycles.name,
      budgetYear: budgetCycles.budgetYear,
      status: budgetCycles.status,
    })
    .from(budgetCycles)
    .orderBy(desc(budgetCycles.budgetYear), desc(budgetCycles.createdAt));
  const cycle =
    cycles.find((c) => c.id === filters.cycleId) ??
    cycles.find((c) => c.status === "open") ??
    cycles[0] ??
    null;
  const empty = {
    cycles,
    cycle,
    counts: EMPTY_COUNTS,
    departments: [],
    queue: [],
    board: null,
    release: null,
  };
  if (!cycle) return { ...empty, readOnly: access.readOnly };

  const requests = await tx
    .select({
      id: budgetRequests.id,
      departmentId: budgetRequests.departmentId,
      departmentName: departments.name,
      status: budgetRequests.status,
      referenceNumber: budgetRequests.referenceNumber,
      title: budgetRequests.title,
      submittedAt: budgetRequests.submittedAt,
      requestedTotalCents: budgetRequests.requestedTotalCents,
      approvedTotalCents: budgetRequests.approvedTotalCents,
      requesterName: users.displayName,
    })
    .from(budgetRequests)
    .innerJoin(departments, eq(departments.id, budgetRequests.departmentId))
    .innerJoin(users, eq(users.id, budgetRequests.requesterUserId))
    .where(eq(budgetRequests.budgetCycleId, cycle.id));
  const byDepartment = new Map(requests.map((r) => [r.departmentId, r]));
  const submittedIds = requests.filter((r) => r.status !== "draft").map((r) => r.departmentId);

  const expected = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(
      submittedIds.length > 0
        ? or(eq(departments.status, "active"), inArray(departments.id, submittedIds))
        : eq(departments.status, "active"),
    )
    .orderBy(asc(departments.name));

  const leaders = expected.length
    ? await tx
        .select({
          departmentId: userDepartments.departmentId,
          type: userDepartments.representativeType,
          name: users.displayName,
        })
        .from(userDepartments)
        .innerJoin(users, eq(users.id, userDepartments.userId))
        .where(
          and(
            inArray(
              userDepartments.departmentId,
              expected.map((d) => d.id),
            ),
            eq(users.active, true),
          ),
        )
        .orderBy(asc(users.displayName))
    : [];
  const representativeOf = (departmentId: string) => {
    const mine = leaders.filter((l) => l.departmentId === departmentId);
    return (mine.find((l) => l.type === "primary") ?? mine[0])?.name ?? null;
  };

  const departmentRows: DashboardDepartment[] = expected.map((d) => {
    const r = byDepartment.get(d.id);
    const submitted = r && r.status !== "draft" ? r : null;
    return {
      departmentId: d.id,
      departmentName: d.name,
      representative: representativeOf(d.id),
      progress: !r ? "not_submitted" : r.status === "draft" ? "draft_exists" : r.status,
      requestId: submitted?.id ?? null,
      referenceNumber: submitted?.referenceNumber ?? null,
      submittedAt: submitted?.submittedAt ?? null,
      requestedTotalCents: submitted?.requestedTotalCents ?? null,
      approvedTotalCents:
        submitted && isApproved(submitted.status) ? submitted.approvedTotalCents : null,
    };
  });

  const submitted = requests.filter((r) => r.status !== "draft");
  const approved = submitted.filter((r) => isApproved(r.status));
  const counts: DashboardCounts = {
    expected: departmentRows.length,
    submitted: submitted.length,
    outstanding: departmentRows.filter((d) => d.requestId === null).length,
    awaitingReview: submitted.filter((r) => AWAITING.includes(r.status)).length,
    returned: submitted.filter((r) => r.status === "returned").length,
    approved: approved.length,
    declined: submitted.filter((r) => r.status === "declined").length,
    totalRequestedCents: sumCents(submitted.map((r) => r.requestedTotalCents ?? 0)),
    totalApprovedCents: sumCents(approved.map((r) => r.approvedTotalCents ?? 0)),
  };

  const filter = QUEUE_FILTERS.find((f) => f === filters.status) ?? "all";
  const q = filters.q?.trim().toLowerCase() ?? "";
  const queue: QueueRow[] = submitted
    .filter((r) => matchesFilter(r.status, filter))
    .filter((r) => !filters.departmentId || r.departmentId === filters.departmentId)
    .filter(
      (r) =>
        q === "" ||
        [r.referenceNumber, r.departmentName, r.requesterName, r.title].some((v) =>
          v?.toLowerCase().includes(q),
        ),
    )
    .map((r) => ({
      requestId: r.id,
      referenceNumber: r.referenceNumber!,
      departmentId: r.departmentId,
      departmentName: r.departmentName,
      requesterName: r.requesterName,
      title: r.title,
      submittedAt: r.submittedAt!,
      status: r.status as Exclude<AnnualStatus, "draft">,
      requestedTotalCents: r.requestedTotalCents!,
      approvedTotalCents: isApproved(r.status) ? r.approvedTotalCents : null,
      unreadMessages: 0,
    }))
    .sort(
      (a, b) =>
        queueRank(a.status) - queueRank(b.status) ||
        a.submittedAt.getTime() - b.submittedAt.getTime(),
    );
  const unread = await unreadCounts(
    tx,
    actor,
    queue.map((r) => r.requestId),
  );
  for (const row of queue) row.unreadMessages = unread.get(row.requestId) ?? 0;

  return {
    cycles,
    cycle,
    counts,
    departments: departmentRows,
    queue,
    board: await boardAllocation(tx, cycle.id),
    release: await cycleRelease(tx, cycle.id),
    readOnly: access.readOnly,
  };
}

// ---------------------------------------------------------------- one request

export type ReviewLine = {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  link: string | null;
  notes: string | null;
};

export type ReviewRevision = {
  number: number;
  kind: "submission" | "revision" | "clarification_response";
  editedBy: string;
  createdAt: Date;
  changeSummary: string | null;
  totalCents: number;
  snapshot: {
    title: string;
    justification: string;
    lines: { name: string; quantity: number; unitPriceCents: number }[];
  };
};

export type ReviewDecision = {
  id: string;
  decision:
    "approved" | "returned" | "declined" | "reopened" | "second_approved" | "second_refused";
  method: "as_requested" | "different_amount" | "line_changes" | null;
  approvedTotalCents: number | null;
  reason: string | null;
  boardReference: string | null;
  approverName: string;
  revisionNumber: number;
  createdAt: Date;
};

/** The approval in force: its totals, per-line values and any overall adjustment. */
export type CurrentApproval = {
  method: "as_requested" | "different_amount" | "line_changes";
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  note: string | null;
  boardReference: string | null;
  approverName: string;
  approvedAt: Date;
  lines: {
    lineId: string;
    quantity: number | null;
    unitPriceCents: number | null;
    lineTotalCents: number;
    reason: string | null;
  }[];
  adjustmentCents: number | null;
};

export type ReviewView = Omit<RequestView, "lines"> & {
  lines: ReviewLine[];
  revisions: ReviewRevision[];
  decisions: ReviewDecision[];
  approval: CurrentApproval | null;
  /** The cycle's board total and what other departments have been approved (4.2). */
  board: BoardAllocation | null;
  /** Hold mode for the cycle: decisions made now wait for the release (FR-19a). */
  release: CycleRelease;
  /** The person may decide now; otherwise why not (DRD 6.7 conflict-of-interest text). */
  canDecide: boolean;
  canReopen: boolean;
  blockedReason: DenyReason | null;
  /** FR-34: the approved total that needs a second sign-off; null when it's off. */
  secondThreshold: number | null;
  /** Awaiting a second approval: whether this person may give it, or gave the first. */
  second: { canGive: boolean; gaveFirst: boolean } | null;
};

/**
 * One submitted request for the accountant (FR-15, DRD 6.7), with its history and the
 * approval in force. Null when missing, still a draft, or not visible to the person.
 */
export async function getReviewView(
  tx: Tx,
  actor: Subject,
  id: string,
): Promise<ReviewView | null> {
  if (!z.uuid().safeParse(id).success) return null;
  if (!authorize(actor, "annual.review").allowed) return null;
  const base = await getRequestView(tx, actor, id);
  if (!base || base.status === "draft") return null;

  const lines = (await lineRowsOf(tx, id)).map((l): ReviewLine => ({
    id: l.id,
    name: l.itemName,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    lineTotalCents: l.lineTotalCents,
    link: l.productUrl,
    notes: l.notes,
  }));

  const revisions = (
    await tx
      .select({ revision: requestRevisions, editedBy: users.displayName })
      .from(requestRevisions)
      .innerJoin(users, eq(users.id, requestRevisions.editedByUserId))
      .where(eq(requestRevisions.budgetRequestId, id))
      .orderBy(desc(requestRevisions.revisionNumber))
  ).map(({ revision: r, editedBy }): ReviewRevision => ({
    number: r.revisionNumber,
    kind: r.kind,
    editedBy,
    createdAt: r.createdAt,
    changeSummary: r.changeSummary,
    totalCents: r.totalCents,
    snapshot: r.requestSnapshot as ReviewRevision["snapshot"],
  }));

  const decisionRows = await tx
    .select({
      decision: approvalDecisions,
      approverName: users.displayName,
      revisionNumber: requestRevisions.revisionNumber,
    })
    .from(approvalDecisions)
    .innerJoin(users, eq(users.id, approvalDecisions.approverUserId))
    .innerJoin(requestRevisions, eq(requestRevisions.id, approvalDecisions.requestRevisionId))
    .where(eq(approvalDecisions.budgetRequestId, id))
    .orderBy(desc(approvalDecisions.createdAt));
  const decisions = decisionRows.map(
    ({ decision: d, approverName, revisionNumber }): ReviewDecision => ({
      id: d.id,
      decision: d.decision,
      method: d.method,
      approvedTotalCents: d.approvedTotalCents,
      reason: d.decisionReason,
      boardReference: d.boardReference,
      approverName,
      revisionNumber,
      createdAt: d.createdAt,
    }),
  );

  let approval: CurrentApproval | null = null;
  const latestApproval = decisionRows.find((d) => d.decision.decision === "approved");
  const awaitingSecond = base.status === "awaiting_second_approval";
  if ((isApproved(base.status) || awaitingSecond) && latestApproval) {
    const d = latestApproval.decision;
    const approvedLines = await tx
      .select()
      .from(approvedLineItems)
      .where(eq(approvedLineItems.approvalDecisionId, d.id));
    const [adjustment] = await tx
      .select({ amountCents: approvalAdjustments.amountCents })
      .from(approvalAdjustments)
      .where(eq(approvalAdjustments.approvalDecisionId, d.id));
    approval = {
      method: d.method!,
      subtotalCents: d.approvedSubtotalCents!,
      taxCents: d.approvedTaxCents!,
      totalCents: d.approvedTotalCents!,
      note: d.decisionReason,
      boardReference: d.boardReference,
      approverName: latestApproval.approverName,
      approvedAt: d.createdAt,
      lines: approvedLines.map((l) => ({
        lineId: l.budgetLineItemId,
        quantity: l.approvedQuantity,
        unitPriceCents: l.approvedUnitPriceCents,
        lineTotalCents: l.approvedLineTotalCents,
        reason: l.adjustmentReason,
      })),
      adjustmentCents: adjustment?.amountCents ?? null,
    };
  }

  const ctx = { departmentId: base.department.id, annualStatus: base.status };
  const decide = authorize(actor, "annual.decide", ctx);
  const reopen = authorize(actor, "annual.reopen", ctx);
  const decidable =
    canTransition(base.status, "approve") || canTransition(base.status, "start_review");
  return {
    ...base,
    lines,
    revisions,
    decisions,
    approval,
    board: await boardAllocation(tx, base.cycle.id, base.id),
    release: await cycleRelease(tx, base.cycle.id),
    canDecide: decide.allowed && decidable,
    canReopen: reopen.allowed && canTransition(base.status, "reopen"),
    blockedReason: decide.allowed ? null : decide.reason,
    secondThreshold: await secondApprovalThreshold(tx),
    second: awaitingSecond
      ? {
          canGive:
            authorize(actor, "annual.second_approve", ctx).allowed &&
            latestApproval?.decision.approverUserId !== actor.id,
          gaveFirst: latestApproval?.decision.approverUserId === actor.id,
        }
      : null,
  };
}
