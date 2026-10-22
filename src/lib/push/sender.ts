/** One browser's push address and keys, as the browser gave them when alerts were turned on. */
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** What the phone or computer shows (the service worker in public/sw.js reads it). */
export type PushMessage = {
  title: string;
  body: string;
  /** An app path to open when the alert is tapped. */
  url: string;
  /** Alerts with the same tag replace each other instead of piling up. */
  tag: string;
  /** Unread notifications, for the number on the app icon. */
  unread: number;
};

/**
 * "sent": the push service took it. "gone": the device turned alerts off or the app was
 * removed, so the subscription should be dropped. "failed": anything else; the bell and
 * the email still have it, so it isn't retried.
 */
export type PushResult = "sent" | "gone" | "failed";

export interface PushSender {
  send(target: PushTarget, message: PushMessage): Promise<PushResult>;
}
