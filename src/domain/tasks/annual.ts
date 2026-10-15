import { and, eq, inArray } from "drizzle-orm";
import { annualCopy } from "@/copy/annual";
import { budgetCycles, budgetRequests } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { Viewer } from "@/lib/roles";
import type { Task } from "./types";

const t = annualCopy.tasks;

/**
 * Annual budget tasks for requesters (FR-37): drafts in the open cycle still to submit,
 * and requests the accountant returned with a question. Accountant review tasks come
 * with step 6.
 */
export function canHaveAnnualRequesterTasks(viewer: Viewer): boolean {
  return viewer.roles.includes("requester") && viewer.departments.length > 0;
}

export async function annualRequesterTasks(tx: Tx, viewer: Viewer): Promise<Task[]> {
  if (!canHaveAnnualRequesterTasks(viewer)) return [];
  const rows = await tx
    .select({
      id: budgetRequests.id,
      status: budgetRequests.status,
      title: budgetRequests.title,
      department: budgetRequests.departmentNameSnapshot,
      createdAt: budgetRequests.createdAt,
      updatedAt: budgetRequests.updatedAt,
    })
    .from(budgetRequests)
    .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
    .where(
      and(
        inArray(
          budgetRequests.departmentId,
          viewer.departments.map((d) => d.id),
        ),
        inArray(budgetRequests.status, ["draft", "returned"]),
        eq(budgetCycles.status, "open"),
      ),
    );
  return rows.map((r) => {
    const draft = r.status === "draft";
    return {
      id: `annual:${r.id}:${draft ? "submit" : "respond"}`,
      area: "annual",
      action: draft ? t.continueDraft : t.respond,
      item: r.title ? `${r.department}: ${r.title}` : r.department,
      waitingSince: draft ? r.createdAt : r.updatedAt,
      href: draft ? `/annual/${r.id}/edit` : `/annual/${r.id}`,
      buttonLabel: t.open,
    } satisfies Task;
  });
}
