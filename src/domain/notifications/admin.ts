import { and, count, desc, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { emailCopy } from "@/copy/email";
import { emailOutbox, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { RuleError, ValidationError } from "@/domain/errors";
import { getChurchTimeZone } from "@/domain/settings";
import { writeAudit } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import { appUrl } from "@/lib/email/layout";
import { formatDateTime } from "@/lib/time-zone";
import { queueNotice } from "./notice";

/**
 * Admin → Notifications & Audit (FR-21 "Log attempted notifications, provider outcomes,
 * and failures", decisions.md 7a): the email log, and sending a failed email again once
 * the problem (an address, the Resend settings) is fixed.
 */

export const EMAIL_STATUSES = emailOutbox.status.enumValues;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

const PAGE_SIZE = 100;

export type EmailLogItem = {
  id: string;
  subject: string;
  template: string;
  to: string;
  toEmail: string;
  status: EmailStatus;
  attempts: number;
  lastError: string | null;
  queuedAt: Date;
  sentAt: Date | null;
  nextAttemptAt: Date;
  budgetRequestId: string | null;
  /** A sign-in code email: its body is cleared and it is never sent again. */
  sensitive: boolean;
};

export type EmailLog = {
  counts: Record<EmailStatus, number>;
  /** Failed emails that Send again can queue (every failed one except sign-in codes). */
  retryable: number;
  items: EmailLogItem[];
  truncated: boolean;
};

export async function getEmailLog(
  tx: Tx,
  actor: Subject,
  filters: { status?: EmailStatus; q?: string } = {},
): Promise<EmailLog> {
  assertCan(actor, "admin.notifications");
  const totals = await tx
    .select({ status: emailOutbox.status, n: count() })
    .from(emailOutbox)
    .groupBy(emailOutbox.status);
  const [{ retryable }] = await tx
    .select({ retryable: count() })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "failed"), eq(emailOutbox.sensitive, false)));
  const counts = Object.fromEntries(EMAIL_STATUSES.map((s) => [s, 0])) as Record<
    EmailStatus,
    number
  >;
  for (const t of totals) counts[t.status] = t.n;

  const q = filters.q?.trim();
  const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = await tx
    .select({
      id: emailOutbox.id,
      subject: emailOutbox.subject,
      template: emailOutbox.template,
      toEmail: emailOutbox.toEmail,
      toName: users.displayName,
      status: emailOutbox.status,
      attempts: emailOutbox.attempts,
      lastError: emailOutbox.lastError,
      queuedAt: emailOutbox.createdAt,
      sentAt: emailOutbox.sentAt,
      nextAttemptAt: emailOutbox.nextAttemptAt,
      budgetRequestId: emailOutbox.budgetRequestId,
      sensitive: emailOutbox.sensitive,
    })
    .from(emailOutbox)
    .leftJoin(users, eq(users.id, emailOutbox.toUserId))
    .where(
      and(
        filters.status ? eq(emailOutbox.status, filters.status) : undefined,
        pattern
          ? or(
              ilike(emailOutbox.subject, pattern),
              ilike(emailOutbox.toEmail, pattern),
              ilike(users.displayName, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(desc(emailOutbox.createdAt))
    .limit(PAGE_SIZE + 1);
  return {
    counts,
    retryable,
    truncated: rows.length > PAGE_SIZE,
    items: rows.slice(0, PAGE_SIZE).map(({ toName, ...r }) => ({ ...r, to: toName ?? r.toEmail })),
  };
}

const idSchema = z.uuid();

/**
 * Sends failed emails again with a fresh set of retries. Only failed ones: a pending
 * email is already queued, and a sent one must never go twice. Sign-in code emails are
 * never sent again: the code has run out and the body is cleared. Audited with the count.
 */
export async function retryFailedEmails(
  tx: Tx,
  actor: Subject,
  input: { ids?: string[]; all?: boolean },
  { now = new Date() }: { now?: Date } = {},
): Promise<number> {
  const { actingRole } = assertCan(actor, "admin.notifications");
  const ids = input.all
    ? undefined
    : (input.ids ?? []).filter((id) => idSchema.safeParse(id).success);
  if (!input.all && (!ids || ids.length === 0)) throw new RuleError(emailCopy.admin.nothingToRetry);
  const retried = await tx
    .update(emailOutbox)
    .set({ status: "pending", attempts: 0, nextAttemptAt: now, updatedAt: now })
    .where(
      and(
        eq(emailOutbox.status, "failed"),
        eq(emailOutbox.sensitive, false),
        ids ? inArray(emailOutbox.id, ids) : undefined,
      ),
    )
    .returning({ id: emailOutbox.id });
  if (retried.length === 0) throw new RuleError(emailCopy.admin.nothingToRetry);
  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "admin",
    eventType: "admin.emails_retried",
    entity: { type: "email_outbox", id: retried.length === 1 ? retried[0].id : undefined },
    details: { count: retried.length, ids: retried.map((r) => r.id).slice(0, 50) },
  });
  return retried.length;
}

export const TEST_EMAIL_TEMPLATE = "system.test_email";
/** Test emails share the church's Resend allowance (100 a day), so they're capped. */
export const TEST_EMAILS_PER_DAY = 20;

const testAddress = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Queues a test email to any address (go-live checklist, launch step 3): it goes through
 * the outbox and the shared layout exactly like a real email, so it shows whether the
 * Resend settings work and whether Gmail, Outlook and Apple Mail put it in the inbox.
 * At most TEST_EMAILS_PER_DAY in any 24 hours. Audited with the address.
 */
export async function sendTestEmail(
  tx: Tx,
  actor: Subject & { name: string },
  input: { to: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<string> {
  const { actingRole } = assertCan(actor, "admin.notifications");
  const m = emailCopy.testEmail;
  const parsed = testAddress.safeParse(input.to);
  if (!parsed.success) throw new ValidationError({ to: m.invalid });
  const to = parsed.data;

  const [{ recent }] = await tx
    .select({ recent: count() })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.template, TEST_EMAIL_TEMPLATE),
        gt(emailOutbox.createdAt, new Date(now.getTime() - 86_400_000)),
      ),
    );
  if (recent >= TEST_EMAILS_PER_DAY) throw new RuleError(m.tooMany(TEST_EMAILS_PER_DAY));

  const zone = await getChurchTimeZone(tx);
  await queueNotice(tx, {
    template: TEST_EMAIL_TEMPLATE,
    audience: "administrator",
    to: [{ email: to }],
    now,
    content: {
      subject: m.subject,
      heading: m.heading,
      status: emailCopy.statuses.forYourRecords,
      paragraphs: [m.intro, m.check],
      facts: [
        { label: m.facts.sentBy, value: actor.name },
        { label: m.facts.queued, value: formatDateTime(now, zone) },
      ],
      action: emailCopy.noAction,
      button: { label: emailCopy.buttons.openApp, href: appUrl("/admin/audit") },
    },
  });
  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "admin",
    eventType: "admin.test_email_sent",
    entity: { type: "email_outbox" },
    details: { to },
  });
  return to;
}
