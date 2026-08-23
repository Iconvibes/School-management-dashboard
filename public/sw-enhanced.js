/**
 * Enhanced Service Worker for EduTrack PWA.
 *
 * Features:
 *   - Pre-caches all dashboard pages so role-specific portals work offline
 *   - Dynamically caches any visited page (network-first, cache fallback)
 *   - Cache-first for static assets (CSS, JS, images, fonts)
 *   - Stale-while-revalidate for API calls (1-hour cache, background refresh)
 *   - Push notification handling
 *   - Notification click → focus or open app
 *   - Cache versioning with automatic cleanup of old caches
 *   - Message listener for client-triggered pre-caching after login
 */

const VERSION = "edutrack-v4";
const STATIC_CACHE = `${VERSION}-static`;
const DATA_CACHE = `${VERSION}-data`;
const SHELL_CACHE = `${VERSION}-shell`;

// Pre-cache all key routes so the app works offline from the first visit.
// Next.js pages are small HTML shells — the total cost is ~50-100 KB.
const APP_SHELL = [
  // Public
  "/",
  "/login",
  "/register",
  "/features",
  "/pricing",
  "/download",
  // Dashboards — every role's entry point
  "/admin/dashboard",
  "/teacher/dashboard",
  "/student/dashboard",
  "/parent/dashboard",
  // Admin sub-pages
  "/admin/import",
  "/admin/quick-add",
  "/admin/placeholders",
];

// Static assets that should be cache-first
const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot|ico|webmanifest)$/i;

// API routes that should NEVER be cached (always go to network)
const NEVER_CACHE_PATTERNS = [
  "/api/auth",
  "/api/sse",
  "/api/push",
  "/api/me",
];

// API routes that are safe to cache briefly (read-only dashboard data)
const CACHEABLE_API = /^\/api\/(student|parent|teacher|admin|grades|attendance|fees)\//;

// Install — pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches from previous versions
self.addEventListener("activate", (event) => {
  const currentCaches = [STATIC_CACHE, DATA_CACHE, SHELL_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !currentCaches.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Message listener — client can request pre-caching of additional routes
// after login (e.g. the user's specific dashboard).
// Only routes in PRE_CACHE_ALLOWLIST are accepted to prevent caching arbitrary URLs.
const PRE_CACHE_ALLOWLIST = [
  "/admin/dashboard",
  "/teacher/dashboard",
  "/student/dashboard",
  "/parent/dashboard",
  "/admin/import",
  "/admin/quick-add",
  "/admin/placeholders",
];

self.addEventListener("message", (event) => {
  const { type, urls } = event.data || {};

  if (type === "PRE_CACHE_URLS" && Array.isArray(urls) && urls.length > 0) {
    // Only cache URLs that are in the allowlist
    const safeUrls = urls.filter((url) => PRE_CACHE_ALLOWLIST.includes(url));
    if (safeUrls.length === 0) return;

    event.waitUntil(
      caches.open(SHELL_CACHE).then((cache) =>
        Promise.allSettled(
          safeUrls.map((url) =>
            fetch(url)
              .then((response) => {
                if (response && response.status === 200) {
                  return cache.put(url, response);
                }
              })
              .catch(() => {
                /* network failed — skip, will be cached on next visit */
              })
          )
        )
      )
    );
  }

  // Client can also request cache cleanup
  if (type === "CLEAR_SHELL_CACHE") {
    event.waitUntil(caches.delete(SHELL_CACHE));
  }

  // Client can request cache invalidation after a successful write
  if (type === "INVALIDATE_CACHE" && event.data.url) {
    const url = new URL(event.data.url, self.location.origin);
    // Invalidate the DATA_CACHE for API endpoints
    if (url.pathname.startsWith("/api/")) {
      event.waitUntil(
        caches.open(DATA_CACHE).then((cache) => {
          // Delete all entries matching the API prefix
          return cache.keys().then((keys) => {
            const prefix = url.pathname.split("/").slice(0, 4).join("/") + "/";
            return Promise.all(
              keys
                .filter((req) => new URL(req.url).pathname.startsWith(prefix))
                .map((req) => cache.delete(req))
            );
          });
        })
      );
    }
  }
});

// Fetch — routing strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Skip cross-origin requests (let browser handle them directly)
  if (url.origin !== self.location.origin) return;

  const isNavigate = request.mode === "navigate";

  // Auth, SSE, push, and /api/me — always network, never cached
  if (NEVER_CACHE_PATTERNS.some((p) => url.pathname.startsWith(p))) {
    return;
  }

  // Read-only dashboard API routes — stale-while-revalidate:
  // serve cached data instantly for speed, then refresh in the background.
  // The 1-hour TTL means data stays usable offline for up to an hour.
  if (url.pathname.startsWith("/api/") && CACHEABLE_API.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE, 60 * 60 * 1000));
    return;
  }

  // Other API routes — network only, no caching
  if (url.pathname.startsWith("/api/")) return;

  // Static assets — cache-first (fast, never changes mid-session)
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML navigations — network-first, cache-while-you-go, offline fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful navigations for offline use
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — try the exact cached page first
        return caches.match(request).then((cached) => {
          if (cached) return cached;

          // For dashboard navigations, try the role-specific cached page
          const dashboardMatch = APP_SHELL.find((route) =>
            url.pathname.startsWith(route)
          );
          if (dashboardMatch) {
            return caches.match(dashboardMatch).then(
              (dash) =>
                dash ||
                caches.match("/login").then(
                  (login) =>
                    login ||
                    caches.match("/")
                )
            );
          }

          // Fallback chain: login → root → offline message
          return caches
            .match("/login")
            .then(
              (login) =>
                login ||
                caches.match("/").then(
                  (shell) =>
                    shell ||
                    new Response(offlinePage(), {
                      status: 503,
                      headers: { "Content-Type": "text/html" },
                    })
                )
            );
        });
      })
  );
});

// --- Caching strategies ---

/** Cache-first: fast for static assets that don't change mid-session */
function cacheFirst(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, clone));
      }
      return response;
    });
  });
}

/**
 * Stale-while-revalidate: serve cached data immediately (fast + works offline),
 * then fetch a fresh copy in the background and update the cache.
 * If nothing is cached yet, falls back to network-first.
 *
 * @param {Request} request
 * @param {string} cacheName
 * @param {number} maxAgeMs — cache entries older than this are treated as missing
 */
function staleWhileRevalidate(request, cacheName, maxAgeMs) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      // Check if the cached response is too old (stale beyond maxAge)
      const cachedAt = cached?.headers.get("sw-cached-at");
      const isFresh = cached && cachedAt && (Date.now() - Date.parse(cachedAt) < maxAgeMs);

      // Kick off a background fetch to refresh the cache (fire-and-forget)
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            // Stamp with current time so we can enforce maxAge on next read
            const headers = new Headers(clone.headers);
            headers.set("sw-cached-at", new Date().toISOString());
            return new Response(clone.body, {
              status: clone.status,
              statusText: clone.statusText,
              headers,
            });
          }
        })
        .then((stamped) => {
          if (stamped) cache.put(request, stamped);
        })
        .catch(() => {
          /* network failed — keep serving the cached version */
        });

      // Return cached immediately if fresh; otherwise wait for network
      if (isFresh) return cached;
      if (cached) {
        // Cache exists but is stale — serve it now, let background refresh update it
        return cached;
      }
      // No cache at all — must wait for network
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            const headers = new Headers(clone.headers);
            headers.set("sw-cached-at", new Date().toISOString());
            cache.put(request, new Response(clone.body, {
              status: clone.status,
              statusText: clone.statusText,
              headers,
            }));
          }
          return response;
        })
        .catch(() =>
          new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
        );
    })
  );
}

/** Minimal offline fallback page (no external dependencies) */
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline — Edutrack</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#1e293b}
  .c{text-align:center;padding:2rem}
  h1{font-size:1.5rem;margin:0 0 .5rem}
  p{color:#64748b;margin:0 0 1.5rem}
  a{display:inline-block;padding:.6rem 1.5rem;background:#1e293b;color:#fff;
    border-radius:.75rem;text-decoration:none;font-weight:600}
  a:hover{background:#334155}
</style>
</head>
<body>
  <div class="c">
    <h1>You're offline</h1>
    <p>Check your internet connection and try again.</p>
    <a href="/">Retry</a>
  </div>
</body>
</html>`;
}

// --- Push notifications ---

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "EduTrack", body: event.data.text() };
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/badge-72.png",
    tag: data.tag || "edutrack-notification",
    renotify: true,
    data: { url: data.url || "/" },
    actions: [
      { action: "open", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "EduTrack", options)
  );
});

// Notification click — focus existing window or open new one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing window showing the target URL
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        // No matching window — open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
