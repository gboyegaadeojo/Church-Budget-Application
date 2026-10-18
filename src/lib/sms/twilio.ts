import type { SendResult, SmsMessage, SmsSender } from "./sender";

export type TwilioConfig = { accountSid: string; authToken: string; from: string };

/**
 * Twilio error codes that won't change on a retry: the person replied STOP (21610), the
 * number can't take texts or is invalid, or the From number isn't allowed.
 */
const PERMANENT = new Set([21211, 21214, 21408, 21610, 21612, 21614, 21606, 21659, 21660]);

/**
 * Twilio's Messages API over plain `fetch` (no SDK). Pay-as-you-go; the church's one
 * paid service (docs/decisions.md 2026-10-18).
 */
export class TwilioSmsSender implements SmsSender {
  private readonly authorization: string;

  constructor(
    private readonly config: TwilioConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.authorization = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
  }

  async send(message: SmsMessage): Promise<SendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: this.authorization,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: message.to, From: this.config.from, Body: message.body }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      return { kind: "retry", error: `Twilio could not be reached: ${errorText(error)}` };
    }
    const body = (await response.json().catch(() => ({}))) as {
      sid?: string;
      code?: number;
      message?: string;
    };
    if (response.ok) return { kind: "sent", providerMessageId: body.sid ?? null };
    const error = `Twilio ${response.status}${body.code ? ` (${body.code})` : ""}: ${body.message ?? "refused"}`;
    if (body.code !== undefined && PERMANENT.has(body.code)) return { kind: "failed", error };
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after"));
      return {
        kind: "retry",
        error,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      };
    }
    // Bad credentials or a suspended account: keep it until someone fixes the setup.
    if (response.status === 401 || response.status === 403) return { kind: "retry", error };
    return { kind: "failed", error };
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
