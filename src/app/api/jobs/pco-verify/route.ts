import { getDb } from "@/db";
import { runPcoVerification } from "@/domain/users/pco-verify-job";
import { getEmailSender } from "@/lib/email";
import { deliverOutbox } from "@/lib/email/outbox";
import { isAuthorizedJobRequest } from "@/lib/jobs";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";

/** Nightly Group Leader re-check (FR-01a, AC-9). */
export async function POST(request: Request) {
  if (!isAuthorizedJobRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const directory = getPlanningCenterDirectory();
  if (!directory) {
    return Response.json({ error: "Planning Center is not configured" }, { status: 503 });
  }
  const summary = await runPcoVerification(getDb(), directory);
  // Suspension and outage notices go now rather than at the next outbox run.
  const sender = getEmailSender();
  if (sender) await deliverOutbox(getDb(), sender, { limit: 100 });
  return Response.json(summary, { status: summary.unavailable ? 503 : 200 });
}
