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

    let updateInterval;

    navigator.serviceWorker
      .register("/sw-enhanced.js")
      .then((reg) => {
        // Check for updates periodically (every 60 minutes)
        updateInterval = setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(() => {
        /* unsupported / blocked — the site still works as a plain website */
      });

    return () => {
      if (updateInterval) clearInterval(updateInterval);
    };
  }, []);

  return null;
}
