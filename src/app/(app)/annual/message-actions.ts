"use server";

import { annualCopy } from "@/copy/annual";
import { markThreadRead, sendMessage } from "@/domain/annual/messages";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/lib/admin-server";
import { getDb } from "@/db";
import { getViewer } from "@/lib/viewer";

/**
 * Messages on a request (FR-31). The service checks who may write, validates the text,
 * audits, and emails the other side through the outbox.
 */

const pathsOf = (id: string) => [
  `/annual/${id}`,
  `/annual/review/${id}`,
  "/annual",
  "/annual/review",
];

export async function sendMessageAction(input: {
  requestId: string;
  body: string;
  idempotencyKey: string;
}): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await sendMessage(tx, viewer, input);
      return annualCopy.thread.sent;
    },
    { paths: pathsOf(input.requestId) },
  );
}

/** The thread was shown: its messages are read (unread counts, DRD 6.11a). */
export async function markMessagesReadAction(requestId: string): Promise<void> {
  const viewer = await getViewer();
  await getDb().transaction((tx) => markThreadRead(tx, viewer, requestId));
}
