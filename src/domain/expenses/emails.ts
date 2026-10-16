import type { Tx } from "@/db/types";
import type { ExpenseStatus } from "./status";

/**
 * The expense emails (FR-49). Each service calls `queueExpenseEmails` in its
 * transaction, after the change and its audit event; rows are sent after commit.
 */

export type ExpenseEmailEvent =
  | { kind: "submitted" }
  | { kind: "edited" }
  | { kind: "clarification_answered" }
  | { kind: "withdrawn"; from: ExpenseStatus }
  | { kind: "cancelled"; reason: string }
  | { kind: "review_started" }
  | { kind: "returned"; question: string }
  | { kind: "declined"; reason: string; level: "accountant" | "board" }
  | { kind: "accountant_approved" }
  | { kind: "board_returned"; question: string }
  | { kind: "final_approved" }
  | { kind: "processing_started" }
  | { kind: "paid" };

export type ExpenseEmailOptions = { now?: Date };

export async function queueExpenseEmails(
  _tx: Tx,
  _expenseId: string,
  _actorId: string,
  _event: ExpenseEmailEvent,
  _options?: ExpenseEmailOptions,
): Promise<void> {
  // Stage 3 step 7 adds the FR-49 emails here.
}
