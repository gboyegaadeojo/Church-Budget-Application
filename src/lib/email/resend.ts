import type { EmailMessage, EmailSender, SendResult } from "./sender";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Resend's REST API through `fetch`, with no SDK (decisions.md "Email: Resend only").
 * The outbox row id is the Idempotency-Key, so a retry after a timeout never sends twice.
 *
 * Rate limits, quota (the free plan is shared with the church's other apps), outages and
 * key or domain problems are "retry later": fixing the setting lets the waiting emails go.
 * Only a refusal of the email itself (bad address, invalid content) is permanent.
 */
export class ResendEmailSender implements EmailSender {
  constructor(private readonly options: { apiKey: string; from: string; fetch?: typeof fetch }) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const doFetch = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.id,
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      return { kind: "retry", error: `Could not reach Resend: ${describe(error)}` };
    }

    const body = (await response.json().catch(() => null)) as {
      id?: string;
      name?: string;
      message?: string;
    } | null;
    if (response.ok) return { kind: "sent", providerMessageId: body?.id ?? null };

    const error = `Resend ${response.status}${body?.name ? ` ${body.name}` : ""}: ${
      body?.message ?? response.statusText
    }`.slice(0, 500);
    if (isTemporary(response.status, body?.name)) {
      const retryAfter = Number(response.headers.get("retry-after"));
      return {
        kind: "retry",
        error,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      };
    }
    return { kind: "failed", error };
  }
}

function isTemporary(status: number, name: string | undefined): boolean {
  if (status === 429 || status >= 500) return true;
  // Missing or wrong API key, or the From domain not verified: a setting to fix.
  if (status === 401 || status === 403) return true;
  // Another send with this key is still running.
  if (status === 409 && name === "concurrent_idempotent_requests") return true;
  return false;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
