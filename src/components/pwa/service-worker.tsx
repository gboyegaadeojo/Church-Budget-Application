"use client";

import { useEffect } from "react";
import { INSTALLABLE_EVENT, resyncAlerts, type InstallPrompt } from "./push-client";

/**
 * Registers the service worker that shows phone alerts, and keeps the browser's install
 * prompt for the Get the app page (docs/decisions.md 2026-10-22). Renders nothing.
 */
export function ServiceWorker({ userId }: { userId: string }) {
  useEffect(() => {
    const keep = (event: Event) => {
      // Chrome shows its own banner unless the page keeps the prompt for its own button.
      event.preventDefault();
      window.__installPrompt = event as InstallPrompt;
      window.dispatchEvent(new Event(INSTALLABLE_EVENT));
    };
    const installed = () => {
      window.__installPrompt = null;
      window.dispatchEvent(new Event(INSTALLABLE_EVENT));
    };
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", installed);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => resyncAlerts(userId))
        .catch(() => undefined);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", keep);
      window.removeEventListener("appinstalled", installed);
    };
  }, [userId]);
  return null;
}
