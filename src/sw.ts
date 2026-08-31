/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

// Web Push delivery: fires even when no NexxaDBC tab is open at all,
// which is the whole point of push over the in-page Notification API
// (see Holder.tsx's notifyMessage) or the Realtime broadcast -- both of
// those need a live tab. The browser has already decrypted event.data
// by the time this runs; send-push (the Edge Function) is what put the
// JSON payload there.
self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }

  const title = data.title || "NexxaDBC";
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "nexxadbc-message",
    data: { url: data.url || "/" },
    // Matches the in-app chime's rhythm (see Holder.tsx playMessageChime)
    // so the haptic feels like the same "brand" on platforms that honor it.
    vibrate: [70, 40, 70, 40, 70, 40, 180],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the lock-screen/tray notification focuses an already-open tab
// if there is one, otherwise opens a new one at the target URL.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => "focus" in c);
      if (existing) {
        existing.focus();
        if ("navigate" in existing) (existing as WindowClient).navigate(url).catch(() => {});
        return;
      }
      self.clients.openWindow(url);
    })
  );
});
