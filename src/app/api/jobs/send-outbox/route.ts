import { getDb } from "@/db";
import { getEmailSender } from "@/lib/email";
import { deliverOutbox } from "@/lib/email/outbox";
import { isAuthorizedJobRequest } from "@/lib/jobs";
import { getSmsSender } from "@/lib/sms";
import { deliverSmsOutbox } from "@/lib/sms/outbox";

/**
 * Sends due and retrying emails from the outbox (CLAUDE.md "Scheduled jobs"). Actions
 * already send their emails straight after commit; this catches retries and anything a
 * stopped server left behind. Reminder texts held overnight leave on the first run after
 * 9:00 a.m. church time.
 */
export async function POST(request: Request) {
  if (!isAuthorizedJobRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sender = getEmailSender();
  const sms = getSmsSender();
  const texts = sms ? await deliverSmsOutbox(getDb(), sms, { limit: 100 }) : null;
  if (!sender) {
    return Response.json({ error: "Email is not configured", texts }, { status: 503 });
  }
  const summary = await deliverOutbox(getDb(), sender, { limit: 100 });
  return Response.json({ ...summary, texts });
}
