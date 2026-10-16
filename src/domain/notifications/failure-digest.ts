import { and, desc, eq, gt, ne } from "drizzle-orm";
import { emailCopy } from "@/copy/email";
import { emailOutbox, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { getChurchTimeZone } from "@/domain/settings";
import { appUrl } from "@/lib/email/layout";
import { zonedDate } from "@/lib/time-zone";
import { queueNotice } from "./notice";
import { administrators } from "./recipients";

const m = emailCopy.failureDigest;
const TEMPLATE = "system.failure_digest";
/** The first digest looks back this far; later ones start where the last one ended. */
const FIRST_LOOK_BACK_MS = 7 * 86_400_000;
const MAX_ITEMS = 50;

/**
 * The administrators' daily digest of emails that failed after every retry (FR-21
 * "Email delivery failed after retries"). Each failure is reported once: the digest
 * covers failures since the previous digest. A failed digest is never itself reported.
 */
export async function queueFailureDigest(tx: Tx, now: Date = new Date()): Promise<number> {
  const [last] = await tx
    .select({ at: emailOutbox.createdAt })
    .from(emailOutbox)
    .where(eq(emailOutbox.template, TEMPLATE))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  const since = last?.at ?? new Date(now.getTime() - FIRST_LOOK_BACK_MS);
  const failed = await tx
    .select({
      subject: emailOutbox.subject,
      toEmail: emailOutbox.toEmail,
      toName: users.displayName,
      error: emailOutbox.lastError,
    })
    .from(emailOutbox)
    .leftJoin(users, eq(users.id, emailOutbox.toUserId))
    .where(
      and(
        eq(emailOutbox.status, "failed"),
        gt(emailOutbox.updatedAt, since),
        ne(emailOutbox.template, TEMPLATE),
      ),
    )
    .orderBy(desc(emailOutbox.updatedAt))
    .limit(MAX_ITEMS + 1);
  if (failed.length === 0) return 0;

  const zone = await getChurchTimeZone(tx);
  const items = failed
    .slice(0, MAX_ITEMS)
    .map((r) => m.item(r.subject, r.toName ?? r.toEmail, r.error ?? ""));
  return queueNotice(tx, {
    template: TEMPLATE,
    audience: "administrator",
    to: await administrators(tx),
    dedupeKey: `failure-digest:${zonedDate(now, zone)}`,
    now,
    content: {
      subject: m.subject(failed.length > MAX_ITEMS ? MAX_ITEMS : failed.length),
      heading: m.heading,
      status: emailCopy.statuses.actionNeeded,
      paragraphs: [m.intro],
      list: { heading: m.listHeading, items },
      action: m.action,
      button: { label: emailCopy.buttons.openApp, href: appUrl("/admin/audit") },
    },
  });
}
