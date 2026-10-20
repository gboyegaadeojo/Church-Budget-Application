import "server-only";
import { after } from "next/server";
import { getDb } from "@/db";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { FakeEmailSender } from "./fake";
import { deliverOutbox } from "./outbox";
import { ResendEmailSender } from "./resend";
import type { EmailSender } from "./sender";

/** One fake sender per server process, shared by actions and the test-only email route. */
const shared = globalThis as typeof globalThis & { __fakeEmailSender?: FakeEmailSender };

/**
 * The sender the app uses: Resend when RESEND_API_KEY and RESEND_FROM are set, the
 * in-memory fake when fake sign-in is on (tests, local development), otherwise none.
 * With none, emails wait in the outbox until email is configured; nothing is lost.
 */
export function getEmailSender(): EmailSender | null {
  if (fakeSignInEnabled()) return (shared.__fakeEmailSender ??= new FakeEmailSender());
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  return apiKey && from ? new ResendEmailSender({ apiKey, from }) : null;
}

/**
 * Sends the outbox once the response has gone (Next.js `after`), so emails from an
 * action leave within seconds instead of waiting for the hourly job. Errors are
 * logged; the job retries whatever is still pending. With `ids`, only those emails are
 * sent, so a sign-in code never waits behind a backlog.
 */
export function sendOutboxAfterResponse(options: { ids?: string[] } = {}): void {
  const sender = getEmailSender();
  if (!sender) return;
  try {
    after(async () => {
      try {
        await deliverOutbox(getDb(), sender, { limit: 25, ids: options.ids });
      } catch (error) {
        console.error("Sending the email outbox failed; the scheduled job will retry", error);
      }
    });
  } catch (error) {
    // Outside a request (no `after` available): the scheduled job sends them instead.
    console.error("Could not schedule sending the email outbox", error);
  }
}
