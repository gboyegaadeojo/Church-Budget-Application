import "server-only";
import { getDb } from "@/db";
import { alertsFor } from "@/domain/notifications/push";
import { getPushPublicKey } from "@/lib/push";
import { getViewerAllowingWaiting as getViewer } from "@/lib/viewer";
import { AlertsPrompt } from "./alerts-prompt";
import { ServiceWorker } from "./service-worker";

/*
 * The app shell's parts for phone alerts (docs/decisions.md 2026-10-22). Each reads the
 * viewer at request time, so the (app) layout renders them inside <Suspense>.
 */

/** Registers the service worker, keeping this device's alerts with whoever is signed in. */
export async function ViewerServiceWorker() {
  const viewer = await getViewer();
  return <ServiceWorker userId={viewer.id} />;
}

/** In the installed app, asks to allow alerts until the person does (no way to dismiss it). */
export async function ViewerAlertsPrompt() {
  const viewer = await getViewer();
  const publicKey = getPushPublicKey();
  if (!publicKey || (await alertsFor(getDb(), viewer.id)) !== "on") return null;
  return <AlertsPrompt publicKey={publicKey} />;
}
