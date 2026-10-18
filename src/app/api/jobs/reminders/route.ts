import { getDb } from "@/db";
import { runClarificationReminders } from "@/domain/annual/clarification-reminders";
import { runReminders } from "@/domain/cycles/emails";
import { runExpenseReminders } from "@/domain/expenses/reminders";
import { queueFailureDigest } from "@/domain/notifications/failure-digest";
import { getEmailSender } from "@/lib/email";
import { deliverOutbox } from "@/lib/email/outbox";
import { isAuthorizedJobRequest } from "@/lib/jobs";
import { getSmsSender } from "@/lib/sms";
import { deliverSmsOutbox } from "@/lib/sms/outbox";

/**
 * Daily job (CLAUDE.md "Scheduled jobs"): the 7-day and 1-day deadline reminders, the
 * clarification reminders (the Primary, then the Backups after the escalation delay), the
 * accountant's list of departments outstanding after the deadline, the expense reminders
 * (FR-49: waiting for the Board Chair, not processed, not bought or claimed), and the
 * administrators' digest of failed emails. The four reminders also queue a text to each
 * person with a Planning Center mobile number (docs/decisions.md 2026-10-18). Each is queued once only, so a repeated run sends nothing new.
 */
export async function POST(request: Request) {
  if (!isAuthorizedJobRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const now = new Date();
  const reminders = await runReminders(db, now);
  const clarifications = await runClarificationReminders(db, now);
  const expenses = await runExpenseReminders(db, now);
  const failureDigest = await db.transaction((tx) => queueFailureDigest(tx, now));
  const sender = getEmailSender();
  const sent = sender ? await deliverOutbox(db, sender, { limit: 100 }) : null;
  // Reminder texts wait for daytime; this sends them only if the job runs after 9:00.
  const sms = getSmsSender();
  const texts = sms ? await deliverSmsOutbox(db, sms, { limit: 100 }) : null;
  return Response.json({ ...reminders, clarifications, expenses, failureDigest, sent, texts });
}
