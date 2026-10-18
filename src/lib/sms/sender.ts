import type { SendResult } from "@/lib/email/sender";

/**
 * How the app hands a reminder text to a provider (docs/decisions.md 2026-10-18). The SMS
 * outbox calls `send` after commit; the answer works as it does for email: sent, tried
 * again later, or marked failed.
 */

export type SmsMessage = {
  /** The outbox row id. */
  id: string;
  /** E.164, "+12045550123". */
  to: string;
  body: string;
};

export type { SendResult };

export interface SmsSender {
  send(message: SmsMessage): Promise<SendResult>;
}
