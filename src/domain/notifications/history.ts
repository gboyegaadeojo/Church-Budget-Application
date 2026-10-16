import { and, desc, eq, inArray } from "drizzle-orm";
import { emailOutbox, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { EmailAudience } from "@/lib/email/outbox";

export type EmailHistoryItem = {
  id: string;
  subject: string;
  to: string;
  status: (typeof emailOutbox.status.enumValues)[number];
  queuedAt: Date;
  sentAt: Date | null;
};

/**
 * The emails about one request, newest first (FR-21 "Every sent email is listed on the
 * request's history", AC-58). The caller has already checked the person may see the
 * request; `audiences` narrows it, so the department sees only the emails sent to it.
 */
export async function requestEmails(
  tx: Tx,
  requestId: string,
  audiences?: readonly EmailAudience[],
): Promise<EmailHistoryItem[]> {
  const rows = await tx
    .select({
      id: emailOutbox.id,
      subject: emailOutbox.subject,
      toEmail: emailOutbox.toEmail,
      toName: users.displayName,
      status: emailOutbox.status,
      queuedAt: emailOutbox.createdAt,
      sentAt: emailOutbox.sentAt,
    })
    .from(emailOutbox)
    .leftJoin(users, eq(users.id, emailOutbox.toUserId))
    .where(
      and(
        eq(emailOutbox.budgetRequestId, requestId),
        audiences ? inArray(emailOutbox.audience, [...audiences]) : undefined,
      ),
    )
    .orderBy(desc(emailOutbox.createdAt), emailOutbox.toEmail);
  return rows.map(({ toEmail, toName, ...row }) => ({ ...row, to: toName ?? toEmail }));
}
