"use server";

import { emailCopy } from "@/copy/email";
import { retryFailedEmails, sendTestEmail } from "@/domain/notifications/admin";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";
import { sendOutboxAfterResponse } from "@/lib/email";

const PATH = "/admin/audit";

/** Sends one failed email, or every failed email, again (FR-21). */
export async function retryEmailsAction(_: ActionState, data: FormData): Promise<ActionState> {
  const all = form.text(data, "all") === "1";
  const result = await runAction(
    async (tx, viewer) => {
      const n = await retryFailedEmails(tx, viewer, all ? { all } : { ids: form.all(data, "id") });
      return emailCopy.admin.retried(n);
    },
    { paths: [PATH] },
  );
  if (result.status === "success") sendOutboxAfterResponse();
  return result;
}

/** Sends a test email to any address, through the outbox (go-live checklist, step 3). */
export async function sendTestEmailAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      const to = await sendTestEmail(tx, viewer, { to: form.text(data, "to") });
      return emailCopy.admin.test.queued(to);
    },
    { paths: [PATH] },
  );
}
