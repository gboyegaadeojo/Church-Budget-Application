/**
 * Fake sign-in (a test-only "provider" that lets you sign in as any Planning Center or
 * email identity) exists so end-to-end tests and local development work without real
 * credentials. Locally it needs AUTH_FAKE_PROVIDERS=1 and an AUTH_URL on this computer,
 * and Netlify and Vercel builds are refused.
 *
 * The one deployed exception is the demo site (docs/demo-site.md): DEMO_MODE=1 and an
 * AUTH_URL whose host names it a demo. Even then, signing in also needs the database
 * itself to be marked as the demo's (`isDemoDatabase`), so a stray setting on the real
 * site can never let anyone in as someone else.
 */
export function fakeSignInEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (demoMode(env)) return true;
  if (env.AUTH_FAKE_PROVIDERS !== "1") return false;
  if (env.NETLIFY === "true" || env.CONTEXT || env.VERCEL || env.VERCEL_ENV) return false;
  try {
    const host = new URL(env.AUTH_URL ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * The hosted demo: made-up people and data, fake email and Planning Center, reset every
 * night. Needs DEMO_MODE=1 and "demo" in the site's host name (demo-ifc-budget.netlify.app).
 */
export function demoMode(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DEMO_MODE !== "1") return false;
  try {
    return new URL(env.AUTH_URL ?? "").hostname.split(/[.-]/).includes("demo");
  } catch {
    return false;
  }
}
