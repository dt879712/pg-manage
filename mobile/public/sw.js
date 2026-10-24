self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network-first passthrough: satisfies PWA installability without
  // aggressively caching, so users always get fresh content.
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data?.text() ?? "" };
  }
  const title = typeof message.title === "string" && message.title ? message.title : "Dev Hostel";
  const options = {
    body: typeof message.body === "string" ? message.body : "You have a new notification.",
    icon: "/logo192.png",
    badge: "/logo192.png",
    data: { url: "/", ...(message.data && typeof message.data === "object" ? message.data : {}) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = event.notification.data?.url;
  let target = new URL("/", self.location.origin).href;
  if (typeof requested === "string") {
    try {
      const parsed = new URL(requested, self.location.origin);
      if (parsed.origin === self.location.origin) target = parsed.href;
    } catch {}
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        if ("navigate" in client && client.url !== target) await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
