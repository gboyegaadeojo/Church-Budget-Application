import { expensesCopy } from "@/copy/expenses";
import type { Tx } from "@/db/types";
import { parseKey, parseVersion, previousResult } from "@/domain/annual/service";
import { ConflictError, parseInput, RuleError } from "@/domain/errors";
import { boardCover } from "@/domain/notifications/recipients";
import { authorize, ForbiddenError, type Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { applyDecision, type ApprovalResult } from "./approval";
import { boardDecisionSchema } from "./decision";
import { authzContextOf, loadExpense, storeIdempotent, type ExpenseRow } from "./service";

/**
 * The Board Chair's side of the two approvals (6B.4): the Board Chair, or the Vice-Chair
 * when the Chair is Away or conflicted (3.3, AC-112). Asked at submission, alongside the
 * accountant, and decides in either order (`approval.ts`).
 */

const e = expensesCopy.errors;
type Options = { now?: Date };

export type BoardPermission =
  | { allowed: true; actingRole: Role }
  | {
      allowed: false;
      reason: "conflict_of_interest" | "missing_role" | "vice_not_needed" | string;
    };

/**
 * Whether this person may give the board's approval now. The Chair may unless conflicted
 * (even while Away: they can still sign in). The Vice-Chair only while no Chair can.
 */
export async function boardPermission(
  tx: Tx,
  actor: Subject,
  row: ExpenseRow,
  now: Date = new Date(),
): Promise<BoardPermission> {
  const decision = authorize(actor, "expense.final_approve", authzContextOf(row));
  if (!decision.allowed) return { allowed: false, reason: decision.reason };
  if (decision.actingRole === "vice_chair") {
    const cover = await boardCover(tx, row, now);
    if (!cover.viceCovering) return { allowed: false, reason: "vice_not_needed" };
  }
  return { allowed: true, actingRole: decision.actingRole };
}

export type BoardDecideResult = ApprovalResult;

/**
 * The Board Chair's (or Vice-Chair's) decision: approve, approve a smaller amount (never
 * more than asked), return to the department with a question, or decline. Each decision
 * records who made it and in which role (AC-112).
 */
export async function boardDecide(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown; decision: unknown },
  options: Options = {},
): Promise<BoardDecideResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<BoardDecideResult>(tx, key, actor, "expenses.board_decide");
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const permission = await boardPermission(tx, actor, row, now);
  if (!permission.allowed) {
    if (permission.reason === "vice_not_needed") throw new RuleError(e.viceChairNotNeeded);
    throw new ForbiddenError("expense.final_approve", permission.reason as never);
  }
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  const decision = parseInput(boardDecisionSchema, input.decision);
  const result = await applyDecision(tx, actor, {
    row,
    version,
    level: "board",
    actingRole: permission.actingRole,
    kind: decision.kind,
    amount: decision.kind === "approve_smaller" ? decision.amount : undefined,
    note: decision.note,
    now,
  });
  return storeIdempotent(tx, key, actor, "expenses.board_decide", row.id, result);
}
