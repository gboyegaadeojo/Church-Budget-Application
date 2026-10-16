"use server";

import { emailCopy } from "@/copy/email";
import { retryFailedEmails } from "@/domain/notifications/admin";
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
