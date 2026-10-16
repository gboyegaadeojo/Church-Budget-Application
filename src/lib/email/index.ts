import "server-only";
import { after } from "next/server";
import { getDb } from "@/db";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { FakeEmailSender } from "./fake";
import { deliverOutbox } from "./outbox";
import { ResendEmailSender } from "./resend";
import type { EmailSender } from "./sender";

let fake: FakeEmailSender | undefined;

/**
 * The sender the app uses: Resend when RESEND_API_KEY and RESEND_FROM are set, the
 * in-memory fake when fake sign-in is on (tests, local development), otherwise none.
 * With none, emails wait in the outbox until email is configured; nothing is lost.
 */
export function getEmailSender(): EmailSender | null {
  if (fakeSignInEnabled()) return (fake ??= new FakeEmailSender());
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  return apiKey && from ? new ResendEmailSender({ apiKey, from }) : null;
}

/**
 * Sends the outbox once the response has gone (Next.js `after`), so emails from an
 * action leave within seconds instead of waiting for the 15-minute job. Errors are
 * logged; the job retries whatever is still pending.
 */
export function sendOutboxAfterResponse(): void {
  const sender = getEmailSender();
  if (!sender) return;
  after(async () => {
    try {
      await deliverOutbox(getDb(), sender, { limit: 25 });
    } catch (error) {
      console.error("Sending the email outbox failed; the scheduled job will retry", error);
    }
  });
}
