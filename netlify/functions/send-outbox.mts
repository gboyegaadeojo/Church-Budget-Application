/**
 * Netlify Scheduled Function (free plan): every hour, asks the app to release any held
 * budget decisions that are due (FR-19a), then to send the email outbox (emails already go
 * straight after each action; this retries failures). Hourly, not every 15 minutes: each
 * run wakes the database, and on Neon's free plan four wakes an hour on two sites would
 * use most of the monthly compute allowance (docs/decisions.md 2026-10-20). One function,
 * so the schedule costs one invocation; GitHub Actions keeps CI, nightly jobs and backups.
 *
 * Netlify sets URL to the site's main address; JOBS_SECRET is the same value the app uses.
 */
const JOBS = ["/api/jobs/release-decisions", "/api/jobs/send-outbox"];

export default async function frequentJobs(): Promise<Response> {
  const site = process.env.URL;
  const secret = process.env.JOBS_SECRET;
  if (!site || !secret) {
    console.log("URL or JOBS_SECRET is not set; skipping.");
    return new Response(null, { status: 204 });
  }
  let ok = true;
  for (const path of JOBS) {
    // One job failing doesn't stop the next: the outbox still goes out.
    try {
      const response = await fetch(new URL(path, site), {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(12_000),
      });
      console.log(`${path}: ${response.status} ${await response.text()}`);
      ok &&= response.ok;
    } catch (error) {
      console.log(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      ok = false;
    }
  }
  return new Response(null, { status: ok ? 200 : 502 });
}

export const config = { schedule: "0 * * * *" };
