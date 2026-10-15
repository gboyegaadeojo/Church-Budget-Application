import "server-only";
import { cookies } from "next/headers";

/**
 * The access-denied screen shows the email that was used (DRD 6.1a). It travels in a
 * short-lived, httpOnly cookie scoped to that page, never in the URL, so it stays out of
 * browser history and server logs.
 */
const COOKIE = "cb-denied-email";
const PATH = "/access-denied";

export async function rememberDeniedEmail(email: string | null): Promise<void> {
  const jar = await cookies();
  if (!email) {
    jar.delete({ name: COOKIE, path: PATH });
    return;
  }
  jar.set(COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.AUTH_URL?.startsWith("http://"),
    path: PATH,
    maxAge: 10 * 60,
  });
}

export async function deniedEmail(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value ?? null;
  return value && /^[^\s@]+@[^\s@]+$/.test(value) ? value : null;
}
