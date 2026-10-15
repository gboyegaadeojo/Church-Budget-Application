import { getDb } from "@/db";
import { runPcoVerification } from "@/domain/users/pco-verify-job";
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
  return Response.json(summary, { status: summary.unavailable ? 503 : 200 });
}
