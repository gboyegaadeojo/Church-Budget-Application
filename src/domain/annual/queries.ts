import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { budgetCycles, budgetRequests, departments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { effectiveDeadline } from "@/domain/cycles/service";
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
};

/** Active departments for the form's picker: the person's own first, then A to Z (FR-03). */
export async function departmentChoices(
  tx: Tx,
  actor: Subject,
  cycleId: string,
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
    };
  });
  return [...choices.filter((c) => c.yours), ...choices.filter((c) => !c.yours)];
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
    submittedAt: request.submittedAt,
    lines,
    rate,
    totals: totalsOf(lines, rate),
    editCount: request.editCount,
    editsRemaining: editsRemaining(request),
    versionNumber: request.versionNumber,
    readOnly: decision.readOnly || decision.actingRole !== "requester",
  };
}

export type MyRequest = {
  id: string;
  status: AnnualStatus;
  title: string;
  referenceNumber: string | null;
  departmentName: string;
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
    departmentName,
    cycleName,
    totalCents: request.requestedTotalCents,
    editsRemaining: editsRemaining(request),
    updatedAt: request.updatedAt,
  }));
}
