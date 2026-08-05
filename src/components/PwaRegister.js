"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so Edutrack becomes installable as a PWA
 * on Android and Windows (Chrome/Edge) while remaining a normal website
 * everywhere else. No visible UI — runs once on app load.
 *
 * Registered in dev too (localhost is a secure context and the SW is
 * network-first), so the installable-app experience can be tested locally
 * without a production build.
 */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* unsupported / blocked — the site still works as a plain website */
      });
    }
  }, []);

  return null;
}
