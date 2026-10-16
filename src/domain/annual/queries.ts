import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  approvalDecisions,
  budgetCycles,
  budgetRequests,
  departments,
  userDepartments,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { effectiveDeadline } from "@/domain/cycles/service";
import { departmentPolicy } from "@/domain/users/ministry-departments";
import { authorize, type Subject } from "@/lib/authz";
import type { TaxBreakdown } from "@/lib/money";
import type { LineContent } from "./schema";
import { currentTaxRate, editsRemaining, linesOf, totalsOf } from "./service";
import type { AnnualStatus } from "./status";

/** Read models for the requester's annual budget screens (DRD 6.2 to 6.5). */

export type OpenCycle = {
  id: string;
  name: string;
  budgetYear: number;
  submissionDeadline: Date;
};

/** Whole days until a deadline, rounded up: 0 means it's due today or has passed. */
export function daysUntil(deadline: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000));
}

/** The cycle taking submissions, if any (the latest year when several are open). */
export async function getOpenCycle(tx: Tx): Promise<OpenCycle | null> {
  const [row] = await tx
    .select({
      id: budgetCycles.id,
      name: budgetCycles.name,
      budgetYear: budgetCycles.budgetYear,
      submissionDeadline: budgetCycles.submissionDeadline,
    })
    .from(budgetCycles)
    .where(eq(budgetCycles.status, "open"))
    .orderBy(desc(budgetCycles.budgetYear))
    .limit(1);
  return row ?? null;
}

export type DepartmentChoice = {
  id: string;
  name: string;
  /** The person already represents it ("Yours"). */
  yours: boolean;
  /** This cycle's request, if one was started ("Media already has a budget…"). */
  existing: { requestId: string; startedBy: string } | null;
  /** Named by the person's Planning Center Ministry Department. */
  fromPlanningCenter: boolean;
};

export type DepartmentPicker = {
  choices: DepartmentChoice[];
  /** Whether "Other (type your department)" is offered; not in restrict mode. */
  allowOther: boolean;
  /** Restrict mode, so an empty list means "ask the administrator". */
  restricted: boolean;
};

/**
 * Active departments for the form's picker (FR-03): the person's own and Planning
 * Center ones first, then A to Z. In restrict mode only the departments the Ministry
 * Department setting allows are listed, and Other is not offered.
 */
export async function departmentPicker(
  tx: Tx,
  actor: Subject,
  cycleId: string,
): Promise<DepartmentPicker> {
  const policy = await departmentPolicy(tx, actor);
  const all = await departmentChoices(tx, actor, cycleId, policy.fromPlanningCenter);
  const choices = policy.allowed ? all.filter((c) => policy.allowed!.has(c.id)) : all;
  return { choices, allowOther: policy.allowed === null, restricted: policy.allowed !== null };
}

async function departmentChoices(
  tx: Tx,
  actor: Subject,
  cycleId: string,
  fromPlanningCenter: ReadonlySet<string>,
): Promise<DepartmentChoice[]> {
  const rows = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.status, "active"))
    .orderBy(asc(departments.name));
  const started = await tx
    .select({
      requestId: budgetRequests.id,
      departmentId: budgetRequests.departmentId,
      startedBy: users.displayName,
    })
    .from(budgetRequests)
    .innerJoin(users, eq(users.id, budgetRequests.requesterUserId))
    .where(eq(budgetRequests.budgetCycleId, cycleId));
  const mine = new Set(actor.departments.map((d) => d.id));
  const choices = rows.map((r) => {
    const request = started.find((s) => s.departmentId === r.id);
    return {
      id: r.id,
      name: r.name,
      yours: mine.has(r.id),
      existing: request ? { requestId: request.requestId, startedBy: request.startedBy } : null,
      fromPlanningCenter: fromPlanningCenter.has(r.id),
    };
  });
  const first = (c: DepartmentChoice) => c.yours || c.fromPlanningCenter;
  return [...choices.filter(first), ...choices.filter((c) => !first(c))];
}

export type RequestView = {
  id: string;
  version: number;
  status: AnnualStatus;
  referenceNumber: string | null;
  title: string;
  justification: string;
  department: { id: string; name: string; status: string };
  cycle: { id: string; name: string; budgetYear: number; status: string };
  deadline: Date;
  requesterName: string;
  /** Everyone who represents the department, who share this request (FR-32). */
  representatives: { id: string; name: string }[];
  submittedAt: Date | null;
  lines: LineContent[];
  /** The snapshotted rate once submitted; the current Settings rate for a draft (FR-05). */
  rate: string;
  totals: TaxBreakdown;
  editCount: number;
  editsRemaining: number;
  versionNumber: number;
  /** The viewer may look but not change it (System Administrator, accountant). */
  readOnly: boolean;
  /**
   * The accountant's latest decision, shown to the department while it applies: the
   * question on a returned request, the reason for a decline, or the approved amounts.
   */
  decision: LatestDecision | null;
};

/** One request as its department sees it, or null if missing or not allowed (AC-3). */
export async function getRequestView(
  tx: Tx,
  actor: Subject,
  id: string,
): Promise<RequestView | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await tx
    .select({
      request: budgetRequests,
      department: { id: departments.id, name: departments.name, status: departments.status },
      cycle: {
        id: budgetCycles.id,
        name: budgetCycles.name,
        budgetYear: budgetCycles.budgetYear,
        status: budgetCycles.status,
      },
      requesterName: users.displayName,
    })
    .from(budgetRequests)
    .innerJoin(departments, eq(departments.id, budgetRequests.departmentId))
    .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
    .innerJoin(users, eq(users.id, budgetRequests.requesterUserId))
    .where(eq(budgetRequests.id, id))
    .limit(1);
  if (!row) return null;
  const { request } = row;
  const decision = authorize(actor, "annual.view", {
    departmentId: request.departmentId,
    annualStatus: request.status,
  });
  if (!decision.allowed) return null;

  const lines = await linesOf(tx, request.id);
  const representatives = await tx
    .select({ id: users.id, name: users.displayName })
    .from(userDepartments)
    .innerJoin(users, eq(users.id, userDepartments.userId))
    .where(and(eq(userDepartments.departmentId, request.departmentId), eq(users.active, true)))
    .orderBy(asc(users.displayName));
  const rate = request.taxRate ?? (await currentTaxRate(tx));
  return {
    id: request.id,
    version: request.version,
    status: request.status,
    referenceNumber: request.referenceNumber,
    title: request.title,
    justification: request.justification,
    department: row.department,
    cycle: row.cycle,
    deadline: await effectiveDeadline(tx, request.budgetCycleId, request.departmentId),
    requesterName: row.requesterName,
    representatives,
    submittedAt: request.submittedAt,
    lines,
    rate,
    totals: totalsOf(lines, rate),
    editCount: request.editCount,
    editsRemaining: editsRemaining(request),
    versionNumber: request.versionNumber,
    readOnly: decision.readOnly || decision.actingRole !== "requester",
    decision: await latestDecision(tx, request),
  };
}

export type MyRequest = {
  id: string;
  status: AnnualStatus;
  title: string;
  referenceNumber: string | null;
  departmentId: string;
  departmentName: string;
  cycleId: string;
  cycleName: string;
  totalCents: number | null;
  editsRemaining: number;
  updatedAt: Date;
};

/** Requests of every department the person represents, newest cycle first (DRD 6.2). */
export async function listMyRequests(tx: Tx, actor: Subject): Promise<MyRequest[]> {
  const ids = actor.departments.map((d) => d.id);
  if (ids.length === 0) return [];
  const rows = await tx
    .select({
      request: budgetRequests,
      departmentName: departments.name,
      cycleName: budgetCycles.name,
    })
    .from(budgetRequests)
    .innerJoin(departments, eq(departments.id, budgetRequests.departmentId))
    .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
    .where(and(inArray(budgetRequests.departmentId, ids)))
    .orderBy(desc(budgetCycles.budgetYear), asc(departments.name));
  return rows.map(({ request, departmentName, cycleName }) => ({
    id: request.id,
    status: request.status,
    title: request.title,
    referenceNumber: request.referenceNumber,
    departmentId: request.departmentId,
    departmentName,
    cycleId: request.budgetCycleId,
    cycleName,
    totalCents: request.requestedTotalCents,
    editsRemaining: editsRemaining(request),
    updatedAt: request.updatedAt,
  }));
}

export type LatestDecision = {
  kind: "approved" | "returned" | "declined";
  reason: string | null;
  boardReference: string | null;
  approved: TaxBreakdown | null;
  decidedAt: Date;
};

const DECISION_FOR_STATUS: Partial<Record<AnnualStatus, LatestDecision["kind"]>> = {
  returned: "returned",
  approved: "approved",
  closed: "approved",
  declined: "declined",
};

/** The decision behind the request's current status, if its status comes from one. */
async function latestDecision(
  tx: Tx,
  request: typeof budgetRequests.$inferSelect,
): Promise<LatestDecision | null> {
  const kind = DECISION_FOR_STATUS[request.status];
  if (!kind) return null;
  const [row] = await tx
    .select()
    .from(approvalDecisions)
    .where(eq(approvalDecisions.budgetRequestId, request.id))
    .orderBy(desc(approvalDecisions.createdAt))
    .limit(1);
  // A reopen also returns a request; its reason is what the department needs to see.
  if (!row || (row.decision !== kind && !(kind === "returned" && row.decision === "reopened"))) {
    return null;
  }
  return {
    kind,
    reason: row.decisionReason,
    boardReference: row.boardReference,
    approved:
      row.approvedTotalCents === null
        ? null
        : {
            subtotal: row.approvedSubtotalCents!,
            tax: row.approvedTaxCents!,
            total: row.approvedTotalCents,
          },
    decidedAt: row.createdAt,
  };
}
