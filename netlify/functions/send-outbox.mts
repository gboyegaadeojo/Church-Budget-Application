/**
 * Netlify Scheduled Function (free plan): every 15 minutes, asks the app to send the
 * email outbox. GitHub Actions' free minutes can't cover a 15-minute schedule for a
 * private repository (docs/go-live-checklist.md), so the frequent jobs run here and
 * GitHub Actions keeps CI, the nightly jobs and backups.
 *
 * Netlify sets URL to the site's main address; JOBS_SECRET is the same value the app uses.
 */
export default async function sendOutbox(): Promise<Response> {
  const site = process.env.URL;
  const secret = process.env.JOBS_SECRET;
  if (!site || !secret) {
    console.log("URL or JOBS_SECRET is not set; skipping.");
    return new Response(null, { status: 204 });
  }
  const response = await fetch(new URL("/api/jobs/send-outbox", site), {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  console.log(`send-outbox: ${response.status} ${await response.text()}`);
  return new Response(null, { status: response.ok ? 200 : 502 });
}

export const config = { schedule: "*/15 * * * *" };
