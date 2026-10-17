import { and, eq, inArray, or } from "drizzle-orm";
import { expensesCopy } from "@/copy/expenses";
import { expenseSubmissions } from "@/db/schema";
import type { Tx } from "@/db/types";
import { boardPermission } from "@/domain/expenses/board";
import { isProcessable } from "@/domain/expenses/payment";
import { authzContextOf } from "@/domain/expenses/service";
import { ACCOUNTANT_WAITING, BOARD_WAITING } from "@/domain/expenses/status";
import { authorize } from "@/lib/authz";
import { hasRole, type Viewer } from "@/lib/roles";
import type { Task } from "./types";

const t = expensesCopy.tasks;

/**
 * Expense tasks (FR-37, 6B): what's waiting for this person at each step.
 * - Department: drafts to finish, questions to answer, approved purchases to buy and claim.
 * - Accountant: expenses to review (not their own department, claim or payee).
 * - Board Chair, or the Vice-Chair covering: approvals, asked alongside the accountant.
 * - Church Administrator and accountant: payments to record.
 */
export function canHaveExpenseTasks(viewer: Viewer): boolean {
  return (
    (viewer.roles.includes("requester") &&
      viewer.departments.length + (viewer.expenseDepartments?.length ?? 0) > 0) ||
    hasRole(viewer, "accountant", "backup_approver", "board_chair", "vice_chair", "church_admin")
  );
}

const label = (r: {
  referenceNumber: string | null;
  title: string;
  departmentNameSnapshot: string;
}) =>
  `${r.referenceNumber ?? expensesCopy.status.draft.label} · ${r.departmentNameSnapshot}: ${
    r.title || expensesCopy.mine.untitled
  }`;

export async function expenseTasks(
  tx: Tx,
  viewer: Viewer,
  now: Date = new Date(),
): Promise<Task[]> {
  if (!canHaveExpenseTasks(viewer)) return [];
  const mine = viewer.roles.includes("requester") ? viewer.departments.map((d) => d.id) : [];
  const accountant = hasRole(viewer, "accountant", "backup_approver");
  const boardMember = hasRole(viewer, "board_chair", "vice_chair");
  const payer = hasRole(viewer, "accountant", "backup_approver", "church_admin");
  const conditions = [
    mine.length > 0
      ? and(
          inArray(expenseSubmissions.departmentId, mine),
          inArray(expenseSubmissions.status, ["draft", "returned", "approved"]),
        )
      : undefined,
    // An Expense submitter (6B.2): what they submitted themselves.
    (viewer.expenseDepartments?.length ?? 0) > 0
      ? and(
          eq(expenseSubmissions.requesterUserId, viewer.id),
          inArray(expenseSubmissions.status, ["draft", "returned", "approved"]),
        )
      : undefined,
    accountant ? inArray(expenseSubmissions.status, [...ACCOUNTANT_WAITING]) : undefined,
    boardMember ? inArray(expenseSubmissions.status, [...BOARD_WAITING]) : undefined,
    payer ? inArray(expenseSubmissions.status, ["approved", "processing"]) : undefined,
  ].filter((c) => c !== undefined);
  if (conditions.length === 0) return [];
  const rows = await tx
    .select()
    .from(expenseSubmissions)
    .where(or(...conditions));

  const tasks: Task[] = [];
  for (const r of rows) {
    const ctx = authzContextOf(r);
    const amountCents = r.approvedTotalCents ?? r.totalCents ?? undefined;
    const base = {
      area: "expenses" as const,
      item: label(r),
      ...(amountCents ? { amountCents } : {}),
    };
    const ours =
      mine.includes(r.departmentId) ||
      ((viewer.expenseDepartments?.length ?? 0) > 0 && r.requesterUserId === viewer.id);
    if (ours && r.status === "draft" && r.requesterUserId === viewer.id) {
      tasks.push({
        ...base,
        id: `expense:${r.id}:submit`,
        action: t.finishDraft,
        waitingSince: r.createdAt,
        href: `/expenses/${r.id}/edit`,
        buttonLabel: t.open,
      });
    }
    if (ours && r.status === "returned") {
      tasks.push({
        ...base,
        id: `expense:${r.id}:respond`,
        action: t.respond,
        waitingSince: r.updatedAt,
        href: `/expenses/${r.id}`,
        buttonLabel: t.open,
      });
    }
    if (
      ours &&
      r.status === "approved" &&
      r.type === "purchase_request" &&
      r.howBought === "requester_claims"
    ) {
      tasks.push({
        ...base,
        id: `expense:${r.id}:claim`,
        action: t.buyAndClaim,
        waitingSince: r.approvedAt ?? r.updatedAt,
        href: `/expenses/${r.id}`,
        buttonLabel: t.open,
      });
    }
    if (
      accountant &&
      ACCOUNTANT_WAITING.includes(r.status) &&
      authorize(viewer, "expense.first_approve", ctx).allowed
    ) {
      tasks.push({
        ...base,
        id: `expense:${r.id}:review`,
        action: t.review,
        waitingSince: r.submittedAt ?? r.updatedAt,
        href: `/expenses/review/${r.id}`,
        buttonLabel: t.review_,
      });
    }
    if (
      boardMember &&
      BOARD_WAITING.includes(r.status) &&
      (await boardPermission(tx, viewer, r, now)).allowed
    ) {
      tasks.push({
        ...base,
        id: `expense:${r.id}:final-approval`,
        action: t.finalApproval,
        waitingSince: r.submittedAt ?? r.updatedAt,
        href: `/expenses/awaiting-approval/${r.id}`,
        buttonLabel: t.decide,
      });
    }
    if (
      payer &&
      (r.status === "approved" || r.status === "processing") &&
      isProcessable(r) &&
      authorize(viewer, "expense.pay", ctx).allowed
    ) {
      tasks.push({
        ...base,
        id: `expense:${r.id}:pay`,
        action: t.recordPayment,
        waitingSince: r.approvedAt ?? r.updatedAt,
        href: `/expenses/ready/${r.id}`,
        buttonLabel: t.pay,
      });
    }
  }
  return tasks;
}
