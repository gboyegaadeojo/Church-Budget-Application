import type { Tx } from "@/db/types";
import { readSettings } from "@/domain/settings";
import type { EmailBrand, EmailContent } from "@/lib/email/layout";
import { enqueueEmail, type EmailAudience, type Recipient } from "@/lib/email/outbox";

/**
 * Queues one notice email in the caller's transaction (FR-21 "Cycle and reminders",
 * "System"; FR-03; FR-38). The church and app names come from Settings.
 */
export async function queueNotice(
  tx: Tx,
  notice: {
    template: string;
    audience: EmailAudience;
    to: readonly Recipient[];
    content: EmailContent;
    cycleId?: string;
    budgetRequestId?: string;
    dedupeKey?: string;
    now?: Date;
  },
): Promise<number> {
  if (notice.to.length === 0) return 0;
  return enqueueEmail(tx, { ...notice, brand: await emailBrand(tx) });
}

export async function emailBrand(tx: Tx): Promise<EmailBrand> {
  const s = await readSettings(tx, ["church_name", "app_name"]);
  return { churchName: s.church_name, appName: s.app_name };
}
