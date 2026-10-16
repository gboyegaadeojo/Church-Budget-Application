import { getDb } from "@/db";
import { runScheduledReleases } from "@/domain/annual/release";
import { getEmailSender } from "@/lib/email";
import { deliverOutbox } from "@/lib/email/outbox";
import { isAuthorizedJobRequest } from "@/lib/jobs";

/**
 * Every 15 minutes (FR-19a): releases held annual budget decisions whose time has come,
 * and a day ahead warns the accountants about departments still undecided. Then it sends
 * what it queued, so held emails go out within 15 minutes of the scheduled time. Each
 * release, warning and summary happens once, so a repeated run sends nothing new.
 */
export async function POST(request: Request) {
  if (!isAuthorizedJobRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const summary = await runScheduledReleases(db, new Date());
  const sender = getEmailSender();
  const sent = sender ? await deliverOutbox(db, sender, { limit: 100 }) : null;
  return Response.json({ ...summary, sent });
}
