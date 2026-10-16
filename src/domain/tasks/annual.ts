import { and, eq, inArray } from "drizzle-orm";
import { annualCopy } from "@/copy/annual";
import { budgetCycles, budgetRequests } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { Viewer } from "@/lib/roles";
import { backupsReminded } from "@/domain/annual/clarification-reminders";
import { pendingFirstApproval } from "@/domain/annual/review";
import type { Task } from "./types";

const t = annualCopy.tasks;

/**
 * Annual budget tasks for requesters (FR-37): drafts in the open cycle still to submit,
 * and requests the accountant returned with a question.
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
  const reminded = await backupsReminded(
    tx,
    rows.filter((r) => r.status === "returned").map((r) => r.id),
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
      ...(reminded.has(r.id) ? { note: t.backupReminded } : {}),
    } satisfies Task;
  });
}

/** Accountants (and backup approvers) review submitted budgets (FR-13, FR-37). */
export function canHaveAnnualReviewTasks(viewer: Viewer): boolean {
  return viewer.roles.includes("accountant") || viewer.roles.includes("backup_approver");
}

/**
 * Submitted, changed and in-review requests in the open cycle, for accountants. A
 * department the person represents is left out: someone else decides it (FR-33).
 */
export async function annualReviewTasks(tx: Tx, viewer: Viewer): Promise<Task[]> {
  if (!canHaveAnnualReviewTasks(viewer)) return [];
  const rows = await tx
    .select({
      id: budgetRequests.id,
      status: budgetRequests.status,
      title: budgetRequests.title,
      reference: budgetRequests.referenceNumber,
      departmentId: budgetRequests.departmentId,
      department: budgetRequests.departmentNameSnapshot,
      totalCents: budgetRequests.requestedTotalCents,
      updatedAt: budgetRequests.updatedAt,
      submittedAt: budgetRequests.submittedAt,
    })
    .from(budgetRequests)
    .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
    .where(
      and(
        inArray(budgetRequests.status, [
          "submitted",
          "updated",
          "in_review",
          "awaiting_second_approval",
        ]),
        eq(budgetCycles.status, "open"),
      ),
    );
  const mine = new Set(viewer.departments.map((d) => d.id));
  // FR-34: a second approval is for someone other than the first approver.
  const awaiting = rows.filter((r) => r.status === "awaiting_second_approval");
  const firstBy = new Map<string, string>();
  for (const r of awaiting) {
    const first = await pendingFirstApproval(tx, r.id);
    if (first) firstBy.set(r.id, first.approverUserId);
  }
  return rows
    .filter((r) => !mine.has(r.departmentId))
    .filter((r) => r.status !== "awaiting_second_approval" || firstBy.get(r.id) !== viewer.id)
    .map(
      (r) =>
        ({
          id: `annual:${r.id}:review`,
          area: "annual",
          action:
            r.status === "awaiting_second_approval"
              ? t.secondApproval
              : r.status === "updated"
                ? t.reviewUpdated
                : t.review,
          item: [r.reference, r.department, r.title].filter(Boolean).join(" · "),
          amountCents: r.totalCents ?? undefined,
          waitingSince: r.status === "updated" ? r.updatedAt : (r.submittedAt ?? r.updatedAt),
          href: `/annual/review/${r.id}`,
          buttonLabel: t.reviewButton,
        }) satisfies Task,
    );
}
