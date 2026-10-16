import { inArray } from "drizzle-orm";
import { userPreferences } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { Recipient } from "./outbox";

/**
 * Email preferences (FR-21 "Email rules", DRD 6.11b). Request and decision emails can't
 * be turned off. Reminders and the accountant's copies can, per person, and an accountant
 * can take new submissions and revisions in one daily digest. The outbox applies this to
 * every email it queues, so no sender can forget it.
 */

export type EmailCategory = "always" | "reminder" | "copy" | "digestible";

/** Templates that aren't "always". Anything not listed here is always sent. */
const CATEGORY: Record<string, Exclude<EmailCategory, "always">> = {
  "cycle.reminder": "reminder",
  "cycle.deadline_passed": "reminder",
  "annual.clarification_reminder": "reminder",
  "annual.clarification_backup_reminder": "reminder",
  "annual.returned.accountant": "copy",
  "annual.approved.accountant": "copy",
  "annual.declined.accountant": "copy",
  "annual.reopened.accountant": "copy",
  "annual.submitted.accountant": "digestible",
  "annual.revised.accountant": "digestible",
};

export function emailCategory(template: string): EmailCategory {
  return CATEGORY[template] ?? "always";
}

/** The templates in one category, for the settings page and tests. */
export function templatesIn(category: Exclude<EmailCategory, "always">): string[] {
  return Object.entries(CATEGORY)
    .filter(([, c]) => c === category)
    .map(([t]) => t);
}

export type EmailDigest = "instant" | "daily";
export type EmailPreferences = { reminders: boolean; copies: boolean; digest: EmailDigest };
export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  reminders: true,
  copies: true,
  digest: "instant",
};

export async function emailPreferencesOf(
  tx: Tx,
  userIds: string[],
): Promise<Map<string, EmailPreferences>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx
    .select({
      userId: userPreferences.userId,
      reminders: userPreferences.emailReminders,
      copies: userPreferences.emailCopies,
      digest: userPreferences.emailDigest,
    })
    .from(userPreferences)
    .where(inArray(userPreferences.userId, userIds));
  return new Map(
    rows.map((r) => [
      r.userId,
      {
        reminders: r.reminders,
        copies: r.copies,
        digest: r.digest === "daily" ? "daily" : "instant",
      },
    ]),
  );
}

export type Routed = { now: Recipient[]; digest: Recipient[] };

/**
 * Who gets this email now, who gets it in their daily digest, and (by omission) who
 * turned it off. An address without an account always gets it.
 */
export async function routeByPreference(
  tx: Tx,
  template: string,
  recipients: Recipient[],
): Promise<Routed> {
  const category = emailCategory(template);
  if (category === "always") return { now: recipients, digest: [] };
  const ids = recipients.flatMap((r) => (r.userId ? [r.userId] : []));
  const prefs = await emailPreferencesOf(tx, ids);
  const routed: Routed = { now: [], digest: [] };
  for (const r of recipients) {
    const p = (r.userId && prefs.get(r.userId)) || DEFAULT_EMAIL_PREFERENCES;
    if (category === "reminder" && !p.reminders) continue;
    if (category === "copy" && !p.copies) continue;
    if (category === "digestible" && p.digest === "daily" && r.userId) routed.digest.push(r);
    else routed.now.push(r);
  }
  return routed;
}
