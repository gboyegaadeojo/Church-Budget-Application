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
 * Paths open without a session: sign-in, access screens, the privacy notice (FR-36) and
 * the church's logo and icon (FR-30), which the sign-in screen and emails show.
 * /api/test answers 404 unless fake sign-in is on (tests only).
 */
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/access-denied",
  "/privacy",
  "/brand",
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
 * No file uploads (FR-23, AC-25, CLAUDE.md constraint 5). Any multipart body to an API
 * route is refused here. Forms reach server actions as multipart bodies, so those pass,
 * and the body is never read here: on Netlify this proxy runs at the edge, and reading
 * the body (even a clone) leaves the app an empty form ("Unexpected end of form").
 * Instead, every action reads its fields as text only, so a file sent to any form is
 * never read or stored (tests/unit/no-file-reads.test.ts). The allowed uploads: the
 * administrator's logo and icon on Settings → Branding (FR-30), whose service checks the
 * role, size and file type; receipts and attachments go from the browser straight to
 * private storage with a signed link (src/lib/storage), never through the app.
 */
export function refusesFiles(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.startsWith("multipart/form-data")) return false;
  return new URL(request.url).pathname.startsWith("/api/");
}

const FILES_REFUSED = { message: "Files can't be uploaded here." };

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (refusesFiles(request)) return NextResponse.json(FILES_REFUSED, { status: 415 });
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
