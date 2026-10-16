/**
 * How the app hands an email to a provider (CLAUDE.md "Email"). The outbox calls
 * `send` after commit; the answer decides what happens to the row: sent, tried again
 * later, or marked failed for the administrator to see.
 */

export type EmailMessage = {
  /** The outbox row id; providers use it as the idempotency key so a retry never sends twice. */
  id: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendResult =
  | { kind: "sent"; providerMessageId: string | null }
  /** Temporary: rate limit, daily quota, outage. The row stays pending. */
  | { kind: "retry"; error: string; retryAfterSeconds?: number }
  /** Permanent: the provider refused this email (e.g. an invalid address). */
  | { kind: "failed"; error: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<SendResult>;
}
