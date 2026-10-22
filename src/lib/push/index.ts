import "server-only";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { FakePushSender } from "./fake";
import type { PushSender } from "./sender";
import { WebPushSender, type VapidConfig } from "./web-push-sender";

/** One fake sender per server process, shared by actions and jobs. */
const shared = globalThis as typeof globalThis & { __fakePushSender?: FakePushSender };

/**
 * A public key for fake mode only, so a browser can still turn alerts on locally. Its
 * private half was thrown away: nothing is ever sent with it.
 */
const FAKE_PUBLIC_KEY =
  "BJVM1ZOZ-QeP4Pr-3kuyusGJ-zXUDXsdR-66_n6wbAcwV3pfQzjKx1QxTNvE72mAtlbmYTwQbx_UPOsWiilD17U";

function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT || process.env.AUTH_URL || "https://localhost";
  return { publicKey, privateKey, subject };
}

/** The in-memory fake when fake sign-in is on, web push when the keys are set, else none. */
export function getPushSender(): PushSender | null {
  if (fakeSignInEnabled()) return (shared.__fakePushSender ??= new FakePushSender());
  const config = vapidConfig();
  return config ? new WebPushSender(config) : null;
}

/** The key a browser needs to turn alerts on, or null when alerts aren't set up. */
export function getPushPublicKey(): string | null {
  if (fakeSignInEnabled()) return FAKE_PUBLIC_KEY;
  return vapidConfig()?.publicKey ?? null;
}
