"use server";

import { expensesCopy } from "@/copy/expenses";
import { sendExpenseMessage } from "@/domain/expenses/messages";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/lib/admin-server";

/**
 * Messages on an expense (6B.4). The service checks who may write, validates the text,
 * audits, and emails the other sides through the outbox.
 */
export async function sendExpenseMessageAction(input: {
  requestId: string;
  body: string;
  idempotencyKey: string;
}): Promise<ActionState> {
  const id = input.requestId;
  return runAction(
    async (tx, viewer) => {
      await sendExpenseMessage(tx, viewer, {
        expenseId: id,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      });
      return expensesCopy.thread.sent;
    },
    { paths: [`/expenses/${id}`, `/expenses/review/${id}`, `/expenses/awaiting-approval/${id}`] },
  );
}
