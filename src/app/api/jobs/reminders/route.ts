import { getDb } from "@/db";
import { runReminders } from "@/domain/cycles/emails";
import { queueFailureDigest } from "@/domain/notifications/failure-digest";
import { getEmailSender } from "@/lib/email";
import { deliverOutbox } from "@/lib/email/outbox";
import { isAuthorizedJobRequest } from "@/lib/jobs";

/**
 * Daily job (CLAUDE.md "Scheduled jobs"): the 7-day and 1-day deadline reminders, the
 * accountant's list of departments outstanding after the deadline, and the administrators'
 * digest of failed emails. Each is queued once only, so a repeated run sends nothing new.
 */
export async function POST(request: Request) {
  if (!isAuthorizedJobRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const now = new Date();
  const reminders = await runReminders(db, now);
  const failureDigest = await db.transaction((tx) => queueFailureDigest(tx, now));
  const sender = getEmailSender();
  const sent = sender ? await deliverOutbox(db, sender, { limit: 100 }) : null;
  return Response.json({ ...reminders, failureDigest, sent });
}
