/*
 * Church Budget's service worker (docs/decisions.md 2026-10-22). It only shows phone and
 * computer alerts and opens the right page when one is tapped. It caches nothing: every
 * page always comes fresh from the server, so nobody sees an out-of-date amount.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: "Church Budget", body: event.data ? event.data.text() : "" };
  }
  const title = message.title || "Church Budget";
  const shown = self.registration.showNotification(title, {
    body: message.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: message.tag || undefined,
    data: {
      url: typeof message.url === "string" && message.url.startsWith("/") ? message.url : "/",
    },
  });
  // The number on the app icon; a test alert (-1) leaves it as it is.
  const unread = Number(message.unread);
  let badge = Promise.resolve();
  if (Number.isFinite(unread) && unread >= 0 && "setAppBadge" in self.navigator) {
    badge = (
      unread > 0 ? self.navigator.setAppBadge(unread) : self.navigator.clearAppBadge()
    ).catch(() => {});
  }
  event.waitUntil(Promise.all([shown, badge]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open window of the app rather than opening another.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
