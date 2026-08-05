/* Edutrack service worker — enables installable PWA + basic offline shell. */
const CACHE_NAME = "edutrack-shell-v1";
const APP_SHELL = ["/", "/login", "/register"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for navigations and API calls (always fresh data),
// falling back to the cached shell only when offline.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Let the browser handle non-HTML / non-same-origin directly.
  const url = new URL(request.url);
  const isNavigate = request.mode === "navigate";

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful same-origin HTML + static assets for offline use.
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => {
        if (isNavigate) return caches.match(request).then((r) => r || caches.match("/"));
        return caches.match(request);
      })
  );
});
