import { getDb } from "@/db";
import { getEmailSender } from "@/lib/email";
import { deliverOutbox } from "@/lib/email/outbox";
import { isAuthorizedJobRequest } from "@/lib/jobs";

/**
 * Sends due and retrying emails from the outbox (CLAUDE.md "Scheduled jobs"). Actions
 * already send their emails straight after commit; this catches retries and anything a
 * stopped server left behind.
 */
export async function POST(request: Request) {
  if (!isAuthorizedJobRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sender = getEmailSender();
  if (!sender) {
    return Response.json({ error: "Email is not configured" }, { status: 503 });
  }
  const summary = await deliverOutbox(getDb(), sender, { limit: 100 });
  return Response.json(summary);
}
