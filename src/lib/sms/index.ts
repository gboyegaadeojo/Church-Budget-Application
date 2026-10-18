import "server-only";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { twilioConfig } from "./config";
import { FakeSmsSender } from "./fake";
import type { SmsSender } from "./sender";
import { TwilioSmsSender } from "./twilio";

/** One fake sender per server process, shared by the jobs and the test-only route. */
const shared = globalThis as typeof globalThis & { __fakeSmsSender?: FakeSmsSender };

/** Twilio when it's configured, the in-memory fake when fake sign-in is on, else none. */
export function getSmsSender(): SmsSender | null {
  if (fakeSignInEnabled()) return (shared.__fakeSmsSender ??= new FakeSmsSender());
  const config = twilioConfig();
  return config ? new TwilioSmsSender(config) : null;
}
