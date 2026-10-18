import { connection } from "next/server";
import { demoMode, fakeSignInEnabled } from "@/lib/auth-mode";
import { getSmsSender } from "@/lib/sms";
import type { SmsMessage } from "@/lib/sms/sender";

/**
 * Test-only: the texts the fake sender "sent" to one number, newest first. Only exists
 * when fake sign-in is on (never on a deployed site); otherwise it's a plain 404.
 */
export async function GET(request: Request) {
  await connection();
  const sender = fakeSignInEnabled() && !demoMode() ? getSmsSender() : null;
  // Checked by shape: route and job bundles each hold their own copy of the class.
  const sent = (sender as { sent?: SmsMessage[] } | null)?.sent;
  if (!Array.isArray(sent)) return new Response("Not found", { status: 404 });
  const to = new URL(request.url).searchParams.get("to")?.trim() ?? "";
  const texts = sent
    .filter((m) => m.to === to)
    .reverse()
    .map((m) => ({ body: m.body }));
  return Response.json({ texts });
}
