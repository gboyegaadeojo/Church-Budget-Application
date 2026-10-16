/**
 * Netlify Scheduled Function (free plan): every 15 minutes, asks the app to release any
 * held budget decisions that are due (FR-19a), then to send the email outbox. GitHub
 * Actions' free minutes can't cover a 15-minute schedule for a private repository
 * (docs/go-live-checklist.md), so the frequent jobs run here, in one function so the
 * schedule costs one invocation; GitHub Actions keeps CI, the nightly jobs and backups.
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

export const config = { schedule: "*/15 * * * *" };
