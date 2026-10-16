/**
 * Fake sign-in (a test-only "provider" that lets you sign in as any Planning Center or
 * email identity) exists so end-to-end tests and local development work without real
 * credentials. It can never turn on for a deployed site: it needs AUTH_FAKE_PROVIDERS=1
 * and an AUTH_URL on this computer, and Netlify builds are always refused.
 */
export function fakeSignInEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.AUTH_FAKE_PROVIDERS !== "1") return false;
  if (env.NETLIFY === "true" || env.CONTEXT) return false;
  try {
    const host = new URL(env.AUTH_URL ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}
