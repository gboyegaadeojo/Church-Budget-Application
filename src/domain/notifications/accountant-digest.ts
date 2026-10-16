import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { emailCopy } from "@/copy/email";
import { emailDigestItems } from "@/db/schema";
import type { Tx } from "@/db/types";
import { getChurchTimeZone } from "@/domain/settings";
import { appUrl } from "@/lib/email/layout";
import { enqueueEmailIds } from "@/lib/email/outbox";
import { formatDateTime } from "@/lib/time-zone";
import { emailBrand } from "./notice";

const m = emailCopy.accountantDigest;
export const DIGEST_TEMPLATE = "annual.accountant_digest";

/** How many updates are waiting for this person's next digest. */
export async function pendingDigestCount(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(emailDigestItems)
    .where(and(eq(emailDigestItems.userId, userId), isNull(emailDigestItems.digestedAt)));
  return row?.n ?? 0;
}

/**
 * The accountant's daily digest (FR-21 "Email rules"): new submissions and revisions held
 * for someone who chose one daily email go out together, in one email per person. Run
 * nightly, and straight away for one person who switches back to instant. Each item is
 * marked with the email it went out in, in the same transaction, so nothing goes twice.
 */
export async function queueAccountantDigests(
  tx: Tx,
  now: Date = new Date(),
  { userId }: { userId?: string } = {},
): Promise<number> {
  const pending = await tx
    .select()
    .from(emailDigestItems)
    .where(
      and(
        isNull(emailDigestItems.digestedAt),
        userId ? eq(emailDigestItems.userId, userId) : undefined,
      ),
    )
    .orderBy(asc(emailDigestItems.createdAt))
    .for("update", { skipLocked: true });
  if (pending.length === 0) return 0;

  const zone = await getChurchTimeZone(tx);
  const brand = await emailBrand(tx);
  const byUser = new Map<string, typeof pending>();
  for (const item of pending) byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item]);

  let queued = 0;
  for (const [user, items] of byUser) {
    const to = { email: items[items.length - 1]!.toEmail, userId: user };
    const [outboxId] = await enqueueEmailIds(tx, {
      template: DIGEST_TEMPLATE,
      audience: "accountant",
      to: [to],
      brand,
      now,
      content: {
        subject: m.subject(items.length),
        heading: m.heading,
        status: emailCopy.statuses.actionNeeded,
        paragraphs: [m.intro],
        list: {
          heading: m.listHeading,
          items: items.map((i) => m.item(i.subject, formatDateTime(i.createdAt, zone))),
        },
        action: m.action,
        button: { label: emailCopy.buttons.openDashboard, href: appUrl("/annual/review") },
      },
    });
    if (!outboxId) continue;
    await tx
      .update(emailDigestItems)
      .set({ digestedAt: now, outboxId })
      .where(
        inArray(
          emailDigestItems.id,
          items.map((i) => i.id),
        ),
      );
    queued++;
  }
  return queued;
}
