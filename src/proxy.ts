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

/**
 * Paths open without a session: sign-in, access screens and the privacy notice (FR-36).
 * /api/test answers 404 unless fake sign-in is on (tests only).
 */
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/access-denied",
  "/privacy",
  "/api/auth",
  "/api/jobs",
  "/api/test",
];

/** Auth.js session cookie names (the secure variant is used over https). */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * No file uploads (FR-23, AC-25, CLAUDE.md constraint 5). Forms reach server actions as
 * multipart bodies, so multipart itself can't be refused; what's refused is any file in
 * it, and any multipart body to an API route. The two allowed uploads (receipts, the
 * logo) arrive with their stages and will be let through here, by path, then.
 */
export async function refusesFiles(request: Request): Promise<boolean> {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.startsWith("multipart/form-data")) return false;
  if (new URL(request.url).pathname.startsWith("/api/")) return true;
  try {
    const form = await request.clone().formData();
    for (const [, value] of form) {
      if (typeof value !== "string") return true;
    }
    return false;
  } catch {
    // A multipart body that can't be read isn't one the app sends.
    return true;
  }
}

const FILES_REFUSED = { message: "Files can't be uploaded here." };

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (await refusesFiles(request)) return NextResponse.json(FILES_REFUSED, { status: 415 });
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
