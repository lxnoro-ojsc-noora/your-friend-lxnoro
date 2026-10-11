const CACHE_PREFIX = "lxnoro-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

function isAppShellRequest(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin && (
    url.pathname === "/" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon.svg" ||
    /^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(url.pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !isAppShellRequest(event.request)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(event.request)) ?? (await caches.match("/"))),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_REMINDER") {
    const { title, symbol, notes, id, startLocal } = event.data.activity;
    const body = notes ? `${notes}\n\n${startLocal.slice(0, 10)} · ${startLocal.slice(11, 16)}` : `${startLocal.slice(0, 10)} · ${startLocal.slice(11, 16)}`;
    event.waitUntil(
      self.registration.showNotification(`${symbol} ${title}`, {
        body,
        tag: `lxnoro-${id}`,
        icon: "/icon.svg",
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
