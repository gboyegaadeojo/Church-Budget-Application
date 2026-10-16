import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends anyone without a session cookie to /sign-in before any app page renders
 * (Requirements 10.1: "Require sign-in before showing request details from email
 * links"). This is a fast first gate only: it checks that a session cookie exists, and
 * every page, route and action then validates the session and permissions on the
 * server (src/lib/viewer.ts, src/lib/authz.ts). It deliberately doesn't use Auth.js's
 * proxy wrapper, which re-sets the session cookie on every request and would undo
 * sign-out.
 */

/** Paths open without a session. /api/test answers 404 unless fake sign-in is on (tests only). */
const PUBLIC_PREFIXES = ["/sign-in", "/access-denied", "/api/auth", "/api/jobs", "/api/test"];

/** Auth.js session cookie names (the secure variant is used over https). */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  // Large sessions are split into numbered chunks: "authjs.session-token.0", ".1", …
  const hasSession = request.cookies
    .getAll()
    .some((c) => SESSION_COOKIES.some((name) => c.name === name || c.name.startsWith(`${name}.`)));
  if (hasSession) return NextResponse.next();

  const signIn = new URL("/sign-in", request.nextUrl.origin);
  // Return to the page after sign-in. Only same-site paths; the sign-in action checks again.
  if (pathname !== "/") signIn.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Everything except Next.js assets and files with an extension (icons, fonts).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
