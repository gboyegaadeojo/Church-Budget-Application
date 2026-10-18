import { and, asc, count, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { smsOutbox, users } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { getChurchTimeZone, smsMonthlyLimit } from "@/domain/settings";
import { writeAudit } from "@/lib/audit";
import { retryDelayMs } from "@/lib/email/outbox";
import { zonedDate, zonedLocalToUtc } from "@/lib/time-zone";
import { smsConfigured } from "./config";
import { nextSendTime } from "./quiet-hours";
import type { SmsSender } from "./sender";

/**
 * Reminder texts (docs/decisions.md 2026-10-18). Queued with `enqueueSms` in the same
 * transaction as the reminder email, sent after commit by `deliverSmsOutbox`. Texts go
 * only between 9:00 a.m. and 8:00 p.m. church time, and at most `sms_monthly_limit` a
 * calendar month. A person stops them by replying STOP: Twilio then refuses the number,
 * and the row is marked failed. Email reminders always go regardless.
 */

/** A reminder text not sent within a day of its send time is stale. */
const EXPIRES_AFTER_MS = 24 * 3_600_000;
const MAX_ATTEMPTS = 5;
const STUCK_AFTER_MS = 10 * 60_000;
export const MONTHLY_LIMIT_REACHED = "Monthly text limit reached";

/** Midnight on the first of `now`'s month, church time. */
function monthStart(now: Date, zone: string): Date {
  return zonedLocalToUtc(`${zonedDate(now, zone).slice(0, 8)}01T00:00`, zone) ?? now;
}

export type QueuedSms = {
  template: string;
  userIds: readonly (string | null | undefined)[];
  body: string;
  dedupeKey: string;
  expenseSubmissionId?: string;
  cycleId?: string;
  now?: Date;
};

/**
 * One row per distinct phone among these people. People without a Planning Center mobile
 * number, or who can't sign in, are skipped. Nothing is queued while texting isn't set up.
 */
export async function enqueueSms(tx: Tx, sms: QueuedSms): Promise<number> {
  if (!smsConfigured()) return 0;
  const ids = [...new Set(sms.userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return 0;
  const people = await tx
    .select({ id: users.id, phone: users.phoneE164 })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.active, true), eq(users.accessStatus, "active")));
  const seen = new Set<string>();
  const recipients = people.filter((p): p is { id: string; phone: string } => {
    if (!p.phone || seen.has(p.phone)) return false;
    seen.add(p.phone);
    return true;
  });
  if (recipients.length === 0) return 0;
  const now = sms.now ?? new Date();
  const sendAt = nextSendTime(now, await getChurchTimeZone(tx));
  const inserted = await tx
    .insert(smsOutbox)
    .values(
      recipients.map((r) => ({
        template: sms.template,
        toPhone: r.phone,
        toUserId: r.id,
        body: sms.body,
        expenseSubmissionId: sms.expenseSubmissionId ?? null,
        cycleId: sms.cycleId ?? null,
        dedupeKey: sms.dedupeKey,
        nextAttemptAt: sendAt,
        expiresAt: new Date(sendAt.getTime() + EXPIRES_AFTER_MS),
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: smsOutbox.id });
  return inserted.length;
}

/** Texts sent so far this calendar month (church time). */
export async function smsSentThisMonth(tx: Tx | Db, now: Date = new Date()): Promise<number> {
  const start = monthStart(now, await getChurchTimeZone(tx));
  const [{ n }] = await tx
    .select({ n: count() })
    .from(smsOutbox)
    .where(and(eq(smsOutbox.status, "sent"), gte(smsOutbox.sentAt, start)));
  return n;
}

/** This month's texts for Admin → Settings: sent, and failed (STOP, cap, bad number). */
export async function smsUsage(db: Db, now: Date = new Date()) {
  const start = monthStart(now, await getChurchTimeZone(db));
  const [{ failed }] = await db
    .select({ failed: count() })
    .from(smsOutbox)
    .where(and(eq(smsOutbox.status, "failed"), gte(smsOutbox.updatedAt, start)));
  return { sent: await smsSentThisMonth(db, now), failed, limit: await smsMonthlyLimit(db) };
}

export type SmsDeliverySummary = { sent: number; retrying: number; failed: number };

type Outcome = { id: string; template: string; toPhone: string; cycleId: string | null };

/**
 * Sends what is due, oldest first, in the daytime window and under the monthly cap. Rows
 * are claimed with SKIP LOCKED, so two runs never send the same text.
 */
export async function deliverSmsOutbox(
  db: Db,
  sender: SmsSender,
  options: { now?: Date; limit?: number } = {},
): Promise<SmsDeliverySummary> {
  const now = options.now ?? new Date();
  const summary: SmsDeliverySummary = { sent: 0, retrying: 0, failed: 0 };

  const expired = await db
    .update(smsOutbox)
    .set({ status: "failed", lastError: "Expired before it could be sent", updatedAt: now })
    .where(and(inArray(smsOutbox.status, ["pending", "sending"]), lte(smsOutbox.expiresAt, now)))
    .returning();
  summary.failed += expired.length;
  for (const row of expired) await recordDelivery(db, row, "failed", row.lastError!);

  const zone = await getChurchTimeZone(db);
  if (nextSendTime(now, zone).getTime() !== now.getTime()) return summary;

  const claimed = await db.transaction(async (tx) => {
    const room = Math.max(0, (await smsMonthlyLimit(tx)) - (await smsSentThisMonth(tx, now)));
    const due = await tx
      .select({ id: smsOutbox.id })
      .from(smsOutbox)
      .where(
        or(
          and(eq(smsOutbox.status, "pending"), lte(smsOutbox.nextAttemptAt, now)),
          and(
            eq(smsOutbox.status, "sending"),
            lt(smsOutbox.lastAttemptAt, new Date(now.getTime() - STUCK_AFTER_MS)),
          ),
        ),
      )
      .orderBy(asc(smsOutbox.createdAt))
      .limit(options.limit ?? 50)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    // Over the month's cap: the rest are failed now, not sent late next month.
    const over = due.slice(room).map((d) => d.id);
    if (over.length > 0) {
      const capped = await tx
        .update(smsOutbox)
        .set({ status: "failed", lastError: MONTHLY_LIMIT_REACHED, updatedAt: now })
        .where(inArray(smsOutbox.id, over))
        .returning();
      summary.failed += capped.length;
      for (const row of capped) await recordDelivery(tx, row, "failed", MONTHLY_LIMIT_REACHED);
    }
    const sending = due.slice(0, room).map((d) => d.id);
    if (sending.length === 0) return [];
    return tx
      .update(smsOutbox)
      .set({
        status: "sending",
        attempts: sql`${smsOutbox.attempts} + 1`,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(inArray(smsOutbox.id, sending))
      .returning();
  });

  for (const row of claimed) {
    const result = await sender
      .send({ id: row.id, to: row.toPhone, body: row.body })
      .catch((error: unknown) => ({
        kind: "retry" as const,
        error: error instanceof Error ? error.message : String(error),
        retryAfterSeconds: undefined,
      }));
    if (result.kind === "sent") {
      summary.sent++;
      await db
        .update(smsOutbox)
        .set({
          status: "sent",
          sentAt: now,
          providerMessageId: result.providerMessageId,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(smsOutbox.id, row.id));
      await recordDelivery(db, row, "sent");
    } else if (result.kind === "retry" && row.attempts < MAX_ATTEMPTS) {
      summary.retrying++;
      const retryAt = new Date(
        now.getTime() + retryDelayMs(row.attempts, result.retryAfterSeconds),
      );
      await db
        .update(smsOutbox)
        .set({
          status: "pending",
          nextAttemptAt: nextSendTime(retryAt, zone),
          lastError: result.error,
          updatedAt: now,
        })
        .where(eq(smsOutbox.id, row.id));
    } else {
      summary.failed++;
      await db
        .update(smsOutbox)
        .set({ status: "failed", lastError: result.error, updatedAt: now })
        .where(eq(smsOutbox.id, row.id));
      await recordDelivery(db, row, "failed", result.error);
    }
  }
  return summary;
}

/** "•••0123": enough to tell numbers apart in the log without keeping the whole number. */
export const maskPhone = (phone: string) => `•••${phone.slice(-4)}`;

async function recordDelivery(
  db: Db | Tx,
  row: Outcome,
  outcome: "sent" | "failed",
  error?: string,
) {
  await writeAudit(db, {
    actor: { kind: "system" },
    area: "admin",
    eventType: outcome === "sent" ? "notifications.sms_sent" : "notifications.sms_failed",
    entity: { type: "sms_outbox", id: row.id },
    cycleId: row.cycleId ?? undefined,
    reason: error,
    details: { template: row.template, to: maskPhone(row.toPhone) },
  });
}
