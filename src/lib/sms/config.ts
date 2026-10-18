import { fakeSignInEnabled } from "@/lib/auth-mode";
import type { TwilioConfig } from "./twilio";

/** Twilio's settings from the environment, when all three are set. */
export function twilioConfig(
  env: Record<string, string | undefined> = process.env,
): TwilioConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM?.trim();
  return accountSid && authToken && from ? { accountSid, authToken, from } : null;
}

/**
 * Whether reminder texts are set up: Twilio configured, or the fake sender (tests, local
 * development, demo). Texts aren't queued otherwise, so nothing piles up to go later.
 */
export function smsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return fakeSignInEnabled(env) || twilioConfig(env) !== null;
}
