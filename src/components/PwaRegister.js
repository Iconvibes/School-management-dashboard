"use client";

import { useEffect } from "react";

/**
 * Registers the enhanced service worker so Edutrack becomes installable as a
 * PWA on Android and Windows (Chrome/Edge) while remaining a normal website
 * everywhere else. The enhanced SW provides:
 *   - Cache-first for static assets, network-first for API calls
 *   - Push notification handling (push + notificationclick events)
 *   - Offline fallback with separate static and data caches
 *
 * Registered in dev too (localhost is a secure context), so the
 * installable-app experience can be tested locally without a production build.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!"serviceWorker" in navigator) return;

    const isDev = process.env.NODE_ENV !== "production";
    let updateInterval;

    navigator.serviceWorker
      .register("/sw-enhanced.js")
      .then((reg) => {
        if (isDev) {
          // Dev mode: check for updates every 15 seconds and force-activate.
          // This prevents stale JS bundles from being served after code changes.
          updateInterval = setInterval(() => {
            reg.update().then(() => {
              if (reg.waiting) {
                // Tell the waiting SW to skip and take over immediately
                reg.waiting.postMessage({ type: "SKIP_WAITING" });
              }
            }).catch(() => {});
          }, 15 * 1000);
        } else {
          // Production: check for updates every 60 minutes
          updateInterval = setInterval(() => reg.update(), 60 * 60 * 1000);
        }
      })
      .catch(() => {
        /* unsupported / blocked — the site still works as a plain website */
      });

    // Listen for the new SW taking over and reload to pick up fresh code
    function onControllerChange() {
      // Only reload if we didn't just install (first visit)
      if (isDev && navigator.serviceWorker.controller) {
        window.location.reload();
      }
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (updateInterval) clearInterval(updateInterval);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
