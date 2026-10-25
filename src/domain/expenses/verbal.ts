import { expensesCopy } from "@/copy/expenses";
import type { Tx } from "@/db/types";
import { parseKey, parseVersion, previousResult } from "@/domain/annual/service";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { usersWithRole } from "@/domain/notifications/recipients";
import { loadViewer } from "@/domain/users/viewer";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { applyDecision, type ApprovalLevel, type ApprovalResult } from "./approval";
import { boardPermission } from "./board";
import { verbalApprovalSchema } from "./decision";
import { authzContextOf, loadExpense, storeIdempotent, type ExpenseRow } from "./service";

/**
 * Verbal approvals (decided by the church 2026-10-24). The Accountant and the Board Chair
 * may give their approval verbally; the Church Administrator then records each one on
 * their behalf. The decision row names the approver, says it was verbal, and names who
 * recorded it; the audit's actor is the Church Administrator, so nothing reads as though
 * the approver signed in. The approver is emailed every time one is recorded for them.
 */

const e = expensesCopy.errors;
type Options = { now?: Date };

export type VerbalApprover = { userId: string; name: string; role: Role };

/** Which approvals this expense still needs, given where it stands. */
export function levelsWaiting(row: Pick<ExpenseRow, "status">): ApprovalLevel[] {
  switch (row.status) {
    case "submitted":
    case "in_review":
      return ["accountant", "board"];
    case "awaiting_accountant":
      return ["accountant"];
    case "awaiting_board":
      return ["board"];
    default:
      return [];
  }
}

/**
 * Whether this person could give this level's approval themselves, and in which role:
 * the same checks as an approval in the app (own department, payee, submitter, and the
 * Vice-Chair only while covering for the Chair).
 */
async function approverRole(
  tx: Tx,
  row: ExpenseRow,
  level: ApprovalLevel,
  userId: string,
  now: Date,
): Promise<Role | null> {
  const loaded = await loadViewer(tx, userId);
  if (!loaded.ok) return null;
  const approver: Subject = loaded.viewer;
  if (level === "accountant") {
    const decision = authorize(approver, "expense.first_approve", authzContextOf(row));
    return decision.allowed && !decision.readOnly ? decision.actingRole : null;
  }
  const board = await boardPermission(tx, approver, row, now);
  return board.allowed ? board.actingRole : null;
}

/** The people whose verbal approval may be recorded now, per level still waiting. */
export async function verbalApprovers(
  tx: Tx,
  row: ExpenseRow,
  now: Date = new Date(),
): Promise<Partial<Record<ApprovalLevel, VerbalApprover[]>>> {
  const out: Partial<Record<ApprovalLevel, VerbalApprover[]>> = {};
  for (const level of levelsWaiting(row)) {
    const candidates = await usersWithRole(
      tx,
      level === "accountant" ? ["accountant", "backup_approver"] : ["board_chair", "vice_chair"],
    );
    const eligible: VerbalApprover[] = [];
    for (const c of candidates) {
      const role = await approverRole(tx, row, level, c.userId, now);
      if (role) eligible.push({ userId: c.userId, name: c.name, role });
    }
    out[level] = eligible;
  }
  return out;
}

export type VerbalApprovalResult = Omit<ApprovalResult, "actingRole">;

/**
 * Records one approver's verbal approval (approve, or approve a smaller amount). The
 * Church Administrator confirms the approver told them, and says when and how.
 */
export async function recordVerbalApproval(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown; approval: unknown },
  options: Options = {},
): Promise<VerbalApprovalResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<VerbalApprovalResult>(
    tx,
    key,
    actor,
    "expenses.record_verbal_approval",
  );
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const { actingRole } = assertCan(actor, "expense.record_verbal_approval", authzContextOf(row));
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  const approval = parseInput(verbalApprovalSchema, input.approval);
  if (!levelsWaiting(row).includes(approval.level)) throw new RuleError(e.verbalNotWaiting);
  if (approval.approverUserId === actor.id) {
    throw new ValidationError({ approverUserId: e.verbalApproverNotEligible });
  }
  const role = await approverRole(tx, row, approval.level, approval.approverUserId, now);
  if (!role) throw new ValidationError({ approverUserId: e.verbalApproverNotEligible });

  const applied = await applyDecision(tx, actor, {
    row,
    version,
    level: approval.level,
    actingRole,
    kind: approval.kind,
    amount: approval.kind === "approve_smaller" ? approval.amount : undefined,
    note: approval.note,
    now,
    onBehalfOf: { userId: approval.approverUserId, role, how: approval.how },
  });
  return storeIdempotent(tx, key, actor, "expenses.record_verbal_approval", row.id, {
    expenseId: applied.expenseId,
    status: applied.status,
    approved: applied.approved,
    remainingAfterCents: applied.remainingAfterCents,
  });
}
