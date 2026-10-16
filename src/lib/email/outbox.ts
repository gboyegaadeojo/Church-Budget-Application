import { AsyncLocalStorage } from "node:async_hooks";
import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { emailOutbox } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { renderEmail, type EmailBrand, type EmailContent } from "./layout";
import type { EmailSender } from "./sender";

/**
 * The email outbox (CLAUDE.md constraint 7, FR-11, FR-21). A service calls
 * `enqueueEmail` inside its transaction, so the email exists exactly when the change
 * commits. `deliverOutbox` runs after commit (straight after the action, and every 15
 * minutes from the scheduled job) and never inside a business transaction, so a slow or
 * failed send cannot hold up or undo the action.
 */

export type EmailAudience = (typeof emailOutbox.audience.enumValues)[number];
export type Recipient = { email: string; userId?: string | null };

export type QueuedEmail = {
  template: string;
  audience: EmailAudience;
  to: readonly Recipient[];
  content: EmailContent;
  brand: EmailBrand;
  budgetRequestId?: string;
  cycleId?: string;
  /** For emails that must go once only: a repeat with this key skips addresses already queued. */
  dedupeKey?: string;
  /** Not sent after this time (a sign-in code that has run out). */
  expiresAt?: Date;
  /** The body holds a secret: it's cleared once sent, failed or expired, and never resent. */
  sensitive?: boolean;
  now?: Date;
};

/** What a sensitive email's body becomes once it no longer needs to be sent. */
export const CLEARED_BODY = "[Removed after sending: this email held a sign-in code.]";

/** Collects emails queued during one action, so the action knows to send after commit. */
const queuedInAction = new AsyncLocalStorage<{ ids: string[] }>();

export function trackQueuedEmails<T>(
  work: () => Promise<T>,
): Promise<{ result: T; queued: number; ids: string[] }> {
  const store = { ids: [] as string[] };
  return queuedInAction.run(store, async () => {
    const result = await work();
    return { result, queued: store.ids.length, ids: store.ids };
  });
}

/**
 * One row per distinct address, each with the same rendered email. Returns how many rows
 * were added (fewer than the recipients when a dedupe key was already used).
 */
export async function enqueueEmail(tx: Tx, email: QueuedEmail): Promise<number> {
  const seen = new Set<string>();
  const recipients = email.to.filter((r) => {
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (recipients.length === 0) return 0;
  const rendered = renderEmail(email.content, email.brand);
  const now = email.now ?? new Date();
  const inserted = await tx
    .insert(emailOutbox)
    .values(
      recipients.map((r) => ({
        template: email.template,
        audience: email.audience,
        toEmail: r.email.trim(),
        toUserId: r.userId ?? null,
        subject: rendered.subject,
        textBody: rendered.text,
        htmlBody: rendered.html,
        budgetRequestId: email.budgetRequestId ?? null,
        cycleId: email.cycleId ?? null,
        dedupeKey: email.dedupeKey ?? null,
        expiresAt: email.expiresAt ?? null,
        sensitive: email.sensitive ?? false,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: emailOutbox.id });
  const store = queuedInAction.getStore();
  if (store) store.ids.push(...inserted.map((r) => r.id));
  return inserted.length;
}

// ---------------------------------------------------------------- delivery

const CLEARED = { textBody: CLEARED_BODY, htmlBody: CLEARED_BODY };

/** Clears the body in SQL, only on rows marked sensitive. */
const clearedIfSensitive = () => ({
  textBody: sql`case when ${emailOutbox.sensitive} then ${CLEARED_BODY} else ${emailOutbox.textBody} end`,
  htmlBody: sql`case when ${emailOutbox.sensitive} then ${CLEARED_BODY} else ${emailOutbox.htmlBody} end`,
});

/** After this many tries an email is marked failed and listed for the administrator. */
export const MAX_ATTEMPTS = 10;
/** Minutes to wait after each failed try: quick at first, then hourly, then daily. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720, 1440, 1440];
/** A row left "sending" this long (the server stopped mid-send) is tried again. */
const STUCK_AFTER_MS = 10 * 60_000;

export function retryDelayMs(attempts: number, retryAfterSeconds?: number): number {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1] ?? 1;
  return Math.max(minutes * 60_000, (retryAfterSeconds ?? 0) * 1000);
}

export type DeliverySummary = { sent: number; retrying: number; failed: number };

/**
 * Sends what is due, oldest first. Rows are claimed with SKIP LOCKED, so the job and an
 * action finishing at the same moment never send the same row twice; the provider's
 * idempotency key covers a crash between sending and recording it.
 */
export async function deliverOutbox(
  db: Db,
  sender: EmailSender,
  options: { now?: Date; limit?: number; ids?: string[] } = {},
): Promise<DeliverySummary> {
  const now = options.now ?? new Date();
  const summary: DeliverySummary = { sent: 0, retrying: 0, failed: 0 };

  // Emails that ran out before they could go (a sign-in code after 10 minutes) are failed.
  const expired = await db
    .update(emailOutbox)
    .set({
      status: "failed",
      lastError: "Expired before it could be sent",
      updatedAt: now,
      ...clearedIfSensitive(),
    })
    .where(
      and(
        inArray(emailOutbox.status, ["pending", "sending"]),
        lte(emailOutbox.expiresAt, now),
        options.ids ? inArray(emailOutbox.id, options.ids) : undefined,
      ),
    )
    .returning({ id: emailOutbox.id });
  summary.failed += expired.length;

  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(
        and(
          or(
            and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, now)),
            and(
              eq(emailOutbox.status, "sending"),
              lt(emailOutbox.lastAttemptAt, new Date(now.getTime() - STUCK_AFTER_MS)),
            ),
          ),
          options.ids ? inArray(emailOutbox.id, options.ids) : undefined,
        ),
      )
      .orderBy(asc(emailOutbox.createdAt))
      .limit(options.limit ?? 50)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(emailOutbox)
      .set({
        status: "sending",
        attempts: sql`${emailOutbox.attempts} + 1`,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(
        inArray(
          emailOutbox.id,
          due.map((d) => d.id),
        ),
      )
      .returning();
  });

  for (const row of claimed) {
    const result = await sender
      .send({
        id: row.id,
        to: row.toEmail,
        subject: row.subject,
        text: row.textBody,
        html: row.htmlBody,
      })
      .catch((error: unknown) => ({
        kind: "retry" as const,
        error: error instanceof Error ? error.message : String(error),
        retryAfterSeconds: undefined,
      }));

    if (result.kind === "sent") {
      summary.sent++;
      await db
        .update(emailOutbox)
        .set({
          status: "sent",
          sentAt: now,
          providerMessageId: result.providerMessageId,
          lastError: null,
          updatedAt: now,
          ...(row.sensitive ? CLEARED : {}),
        })
        .where(eq(emailOutbox.id, row.id));
    } else if (result.kind === "retry" && row.attempts < MAX_ATTEMPTS) {
      summary.retrying++;
      await db
        .update(emailOutbox)
        .set({
          status: "pending",
          nextAttemptAt: new Date(
            now.getTime() + retryDelayMs(row.attempts, result.retryAfterSeconds),
          ),
          lastError: result.error,
          updatedAt: now,
        })
        .where(eq(emailOutbox.id, row.id));
    } else {
      summary.failed++;
      await db
        .update(emailOutbox)
        .set({
          status: "failed",
          lastError: result.error,
          updatedAt: now,
          ...(row.sensitive ? CLEARED : {}),
        })
        .where(eq(emailOutbox.id, row.id));
    }
  }
  return summary;
}
