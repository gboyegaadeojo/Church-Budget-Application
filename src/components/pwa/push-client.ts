import { savePushAction } from "@/app/actions/push";

/*
 * The browser side of installing the app and phone alerts (docs/decisions.md 2026-10-22).
 * Everything here runs only in the browser, after the page has loaded.
 */

/** The install prompt Chrome and Edge offer, kept until the person asks to install. */
export type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export const INSTALLABLE_EVENT = "app:installable";

declare global {
  interface Window {
    __installPrompt?: InstallPrompt | null;
  }
}

export type DeviceKind = "iphone" | "android" | "computer";

export type DeviceState = {
  kind: DeviceKind;
  /** Opened from the home screen or as its own window. */
  installed: boolean;
  /** The browser can receive alerts here (on iPhone, only once installed). */
  pushable: boolean;
  permission: NotificationPermission | "unsupported";
};

export function deviceState(): DeviceState {
  const ua = navigator.userAgent;
  const iphone =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const kind: DeviceKind = iphone ? "iphone" : /Android/.test(ua) ? "android" : "computer";
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const pushable =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return {
    kind,
    installed,
    pushable,
    permission: "Notification" in window ? Notification.permission : "unsupported",
  };
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function save(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return savePushAction({
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  });
}

/**
 * Asks to show alerts (must follow a tap: iPhone requires it) and saves this device.
 * Returns "on", "declined" (permission refused) or an error message.
 */
export async function turnOnAlerts(publicKey: string): Promise<"on" | "declined" | string> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "declined";
  const reg = (await registration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const result = await save(subscription);
  return result.ok ? "on" : result.message;
}

const RESYNC_KEY = "push-resynced";
const DAY = 24 * 60 * 60 * 1000;

/**
 * Browsers renew their push address now and then, so once a day this device's current
 * one is saved again. It is saved at once when someone else signs in on the device, so
 * alerts move to them and stop reaching the previous person.
 */
export async function resyncAlerts(userId: string): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const last = JSON.parse(localStorage.getItem(RESYNC_KEY) ?? "{}") as {
      at?: number;
      user?: string;
    };
    if (last.user === userId && Date.now() - (last.at ?? 0) < DAY) return;
    const subscription = await currentSubscription();
    if (!subscription) return;
    const result = await save(subscription);
    if (result.ok)
      localStorage.setItem(RESYNC_KEY, JSON.stringify({ at: Date.now(), user: userId }));
  } catch {
    // Storage blocked or offline: try again next visit.
  }
}

/** Shows the unread count on the installed app's icon, where the phone supports it. */
export function showAppBadge(unread: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (!nav.setAppBadge || !nav.clearAppBadge) return;
  (unread > 0 ? nav.setAppBadge(unread) : nav.clearAppBadge()).catch(() => undefined);
}
