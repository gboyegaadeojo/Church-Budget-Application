import { connection } from "next/server";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { getEmailSender } from "@/lib/email";
import type { EmailMessage } from "@/lib/email/sender";

/**
 * Test-only: the emails the fake sender "sent" to one address, newest first, so
 * end-to-end tests can read an emailed sign-in code. Only exists when fake sign-in is on
 * (never on a deployed site, see src/lib/auth-mode.ts); otherwise it's a plain 404.
 */
export async function GET(request: Request) {
  // Answer at request time; a build-time answer would always be the 404.
  await connection();
  const sender = fakeSignInEnabled() ? getEmailSender() : null;
  // Checked by shape: route and action bundles each hold their own copy of the class.
  const sent = (sender as { sent?: EmailMessage[] } | null)?.sent;
  if (!Array.isArray(sent)) return new Response("Not found", { status: 404 });
  const to = new URL(request.url).searchParams.get("to")?.trim().toLowerCase() ?? "";
  const emails = sent
    .filter((m) => m.to.toLowerCase() === to)
    .reverse()
    .map((m) => ({ subject: m.subject, text: m.text }));
  return Response.json({ emails });
}
