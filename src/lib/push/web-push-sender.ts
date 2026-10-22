import webpush from "web-push";
import type { PushMessage, PushResult, PushSender, PushTarget } from "./sender";

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/**
 * Standard web push (RFC 8030 with VAPID), through the browser's own push service: Apple's
 * for iPhone and Safari, Google's for Android and Chrome. Free, with no account to manage
 * (docs/decisions.md 2026-10-22). Messages are encrypted for the device.
 */
export class WebPushSender implements PushSender {
  constructor(private readonly config: VapidConfig) {}

  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        {
          vapidDetails: this.config,
          // An alert more than a day old is no longer news; the bell still has it.
          TTL: 24 * 60 * 60,
          urgency: "normal",
          timeout: 10_000,
        },
      );
      return "sent";
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      console.error("Sending a phone alert failed", status ?? error);
      return "failed";
    }
  }
}
