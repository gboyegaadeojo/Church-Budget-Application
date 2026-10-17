import { eq } from "drizzle-orm";
import { budgetCycles } from "@/db/schema";
import type { Tx } from "@/db/types";
import { listDepartments, type Leader } from "@/domain/departments/queries";
import { budgetFigures } from "@/domain/expenses/budget";
import { effectiveDeadline } from "@/domain/cycles/service";
import { departmentCover } from "@/domain/users/away";
import { authorize, type Subject } from "@/lib/authz";
import { getReviewDashboard, type CycleOption, type Progress } from "./review-queries";

/**
 * Annual Budget → Departments (DRD 6.0 navigation, accountant): every department with
 * who leads it and how to reach them, whether the Primary is away and who covers, its
 * budget this cycle (status, requested, approved), its deadline if extended, and what's
 * left to spend. Read-only: leaders are managed in Admin → Departments. Built on the
 * review dashboard's rows, so the figures match it.
 */

export type DepartmentOverviewRow = {
  id: string;
  name: string;
  primary: Pick<Leader, "name" | "email"> | null;
  backups: Pick<Leader, "name" | "email" | "slot">[];
  representatives: number;
  /** The Primary is away; these Backups receive the department's emails. */
  away: { covering: string[]; until: Date | null } | null;
  progress: Progress;
  requestId: string | null;
  reference: string | null;
  requestedCents: number | null;
  approvedCents: number | null;
  /** Set when this department has its own deadline (an extension, 4.3). */
  extendedTo: Date | null;
  /** Available − committed − spent; null without an approved budget. */
  remainingCents: number | null;
};

export type DepartmentsOverview = {
  cycles: CycleOption[];
  cycle: (CycleOption & { deadline: Date }) | null;
  rows: DepartmentOverviewRow[];
};

export async function departmentsOverview(
  tx: Tx,
  viewer: Subject,
  cycleId?: string,
): Promise<DepartmentsOverview | null> {
  if (!authorize(viewer, "annual.review").allowed) return null;
  const dashboard = await getReviewDashboard(tx, viewer, { cycleId });
  if (!dashboard) return null;
  const { cycle } = dashboard;
  const active = await listDepartments(tx, "active");
  const leaders = new Map(active.map((d) => [d.id, d]));
  if (!cycle) {
    return { cycles: dashboard.cycles, cycle: null, rows: [] };
  }
  const [{ deadline: cycleDeadline }] = await tx
    .select({ deadline: budgetCycles.submissionDeadline })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, cycle.id));

  const rows: DepartmentOverviewRow[] = [];
  for (const d of dashboard.departments) {
    const lead = leaders.get(d.departmentId);
    const cover = await departmentCover(tx, d.departmentId);
    const deadline = await effectiveDeadline(tx, cycle.id, d.departmentId);
    const figures = await budgetFigures(tx, cycle.id, d.departmentId);
    rows.push({
      id: d.departmentId,
      name: d.departmentName,
      primary: lead?.primary ? { name: lead.primary.name, email: lead.primary.email } : null,
      backups: (lead?.backups ?? []).map((b) => ({ name: b.name, email: b.email, slot: b.slot })),
      representatives: lead?.representatives ?? 0,
      away: cover.away
        ? { covering: cover.backups.map((b) => b.name), until: cover.window.until }
        : null,
      progress: d.progress,
      requestId: d.requestId,
      reference: d.referenceNumber,
      requestedCents: d.requestedTotalCents,
      approvedCents: d.approvedTotalCents,
      extendedTo: deadline.getTime() !== cycleDeadline.getTime() ? deadline : null,
      remainingCents: figures.annualRequestId ? figures.remaining : null,
    });
  }
  return { cycles: dashboard.cycles, cycle: { ...cycle, deadline: cycleDeadline }, rows };
}
