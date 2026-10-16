import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { userPreferences } from "@/db/schema";
import type { Tx } from "@/db/types";
import { ConflictError, parseInput } from "@/domain/errors";
import { queueAccountantDigests } from "@/domain/notifications/accountant-digest";
import { writeAudit } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import {
  DEFAULT_EMAIL_PREFERENCES,
  emailPreferencesOf,
  type EmailPreferences,
} from "@/lib/email/preferences";

/**
 * A person's email preferences (FR-21 "Email rules", DRD 6.11b). Everyone can turn
 * reminders off. Accountants can also turn off copies of their own decisions and take new
 * submissions and revisions in one daily digest. Request and decision emails always go.
 * The outbox applies these (src/lib/email/preferences.ts). Changes are audited.
 */

export type MyEmailPreferences = EmailPreferences & { version: number };

export async function getMyEmailPreferences(tx: Tx, userId: string): Promise<MyEmailPreferences> {
  const [row] = await tx
    .select({ version: userPreferences.version })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  const prefs = (await emailPreferencesOf(tx, [userId])).get(userId);
  return { ...(prefs ?? DEFAULT_EMAIL_PREFERENCES), version: row?.version ?? 0 };
}

const schema = z.object({
  reminders: z.boolean(),
  copies: z.boolean(),
  digest: z.enum(["instant", "daily"]),
  version: z.coerce.number().int().min(0),
});

export async function updateMyEmailPreferences(
  tx: Tx,
  actor: Subject,
  input: { reminders: boolean; copies: boolean; digest: string; version: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  const { actingRole } = assertCan(actor, "account.email_preferences");
  const data = parseInput(schema, input);
  const before = await getMyEmailPreferences(tx, actor.id);
  // Copies and the digest are the accountant's; anyone else's stay as they were.
  const accountant = authorize(actor, "account.accountant_emails").allowed;
  const after: EmailPreferences = {
    reminders: data.reminders,
    copies: accountant ? data.copies : before.copies,
    digest: accountant ? data.digest : before.digest,
  };
  const values = {
    emailReminders: after.reminders,
    emailCopies: after.copies,
    emailDigest: after.digest,
  };

  if (data.version === 0) {
    const inserted = await tx
      .insert(userPreferences)
      .values({ userId: actor.id, ...values })
      .onConflictDoNothing()
      .returning({ userId: userPreferences.userId });
    if (inserted.length === 0) throw new ConflictError({ type: "user_preferences", id: actor.id });
  } else {
    const updated = await tx
      .update(userPreferences)
      .set({ ...values, version: sql`${userPreferences.version} + 1`, updatedAt: now })
      .where(and(eq(userPreferences.userId, actor.id), eq(userPreferences.version, data.version)))
      .returning({ userId: userPreferences.userId });
    if (updated.length === 0) throw new ConflictError({ type: "user_preferences", id: actor.id });
  }

  const was = { reminders: before.reminders, copies: before.copies, digest: before.digest };
  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "admin",
    eventType: "user.email_preferences_changed",
    entity: { type: "user", id: actor.id },
    details: { before: was, after },
  });

  // Back to instant: whatever was waiting for tonight's digest goes now.
  if (before.digest === "daily" && after.digest === "instant") {
    await queueAccountantDigests(tx, now, { userId: actor.id });
  }
}
