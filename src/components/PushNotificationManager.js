"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

/**
 * Push notification manager for PWA.
 * Handles subscription to Web Push API, permission requests, and notification display.
 *
 * Usage:
 *   <PushNotificationManager schoolId={schoolId} userId={userId} />
 */
export default function PushNotificationManager({ schoolId, userId }) {
  const [permission, setPermission] = useState("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported("serviceWorker" in navigator && "PushManager" in window);
    setPermission(Notification?.permission || "default");
    checkSubscription();
  }, []);

  const checkSubscription = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setLoading(false);
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      setSubscribed(Boolean(subscription));
    } catch {}
    setLoading(false);
  }, []);

  async function subscribe() {
    if (!supported) return;

    try {
      // Request permission
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      // Register service worker if not already
      const reg = await navigator.serviceWorker.ready;

      // Get VAPID public key from the server
      const res = await fetch("/api/push/vapid-key");
      const { publicKey } = await res.json();
      if (!publicKey) return;

      // Subscribe to push
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to server
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.toJSON().keys.p256dh,
            auth: subscription.toJSON().keys.auth,
          },
        }),
      });

      setSubscribed(true);
    } catch (err) {
      console.warn("[Push] Subscription failed:", err);
    }
  }

  async function unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setPermission("default");
    } catch {}
  }

  if (!supported || loading) return null;

  if (permission === "denied") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-500">
        <BellOff className="h-4 w-4" />
        <span>Push notifications are blocked. Enable them in your browser settings.</span>
      </div>
    );
  }

  if (subscribed) {
    return (
      <button
        onClick={unsubscribe}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
      >
        <BellRing className="h-4 w-4" />
        Notifications enabled
      </button>
    );
  }

  return (
    <button
      onClick={subscribe}
      className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
    >
      <Bell className="h-4 w-4" />
      Enable push notifications
    </button>
  );
}

/**
 * Convert a VAPID public key from base64url to Uint8Array.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
