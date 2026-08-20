/**
 * Push transport — Web Push API for PWA notifications.
 *
 * Uses the native Push API + Notification API. No third-party service needed.
 * The server stores push subscriptions and sends web push messages.
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY   — VAPID public key (generated with web-push)
 *   VAPID_PRIVATE_KEY  — VAPID private key
 *   VAPID_SUBJECT      — contact email for VAPID (e.g. "mailto:admin@edutrack.app")
 */

let webPush = null;
let _initialized = false;

async function getWebPush() {
  if (webPush) return webPush;
  try {
    webPush = await import("web-push");
    return webPush;
  } catch {
    return null;
  }
}

async function initVapid() {
  if (_initialized) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@edutrack.app";
  if (!publicKey || !privateKey) return false;

  const wp = await getWebPush();
  if (!wp) return false;

  wp.default.setVapidDetails(subject, publicKey, privateKey);
  _initialized = true;
  return true;
}

async function sendToSubscription(subscription, payload) {
  const wp = await getWebPush();
  if (!wp) return { success: false, reason: "web-push not installed" };

  try {
    await wp.default.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title || "EduTrack",
        body: payload.body || "",
        icon: payload.icon || "/icons/icon-192.png",
        badge: payload.badge || "/icons/badge-72.png",
        data: { url: payload.url || "/parent/dashboard" },
        tag: payload.tag || "edutrack-notification",
        renotify: true,
      })
    );
    return { success: true };
  } catch (err) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      return { success: false, reason: "subscription_expired" };
    }
    return { success: false, reason: err?.message };
  }
}

export async function sendPush({ schoolId, title, body, url, userIds, store: storeInstance }) {
  if (!await initVapid()) return { sent: 0, failed: 0, expired: [], reason: "VAPID not configured" };
  if (!storeInstance) return { sent: 0, failed: 0, expired: [], reason: "No store provided" };

  const subs = await storeInstance.listPushSubscriptions(schoolId, userIds);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, expired: [] };

  let sent = 0;
  let failed = 0;
  const expired = [];

  for (const sub of subs) {
    const result = await sendToSubscription(
      { endpoint: sub.endpoint, keys: sub.keys },
      { title, body, url, tag: `edutrack-${schoolId}` }
    );
    if (result.success) {
      sent++;
    } else {
      failed++;
      if (result.reason === "subscription_expired") {
        expired.push(sub.id);
      }
    }
  }

  if (expired.length > 0) {
    await storeInstance.removePushSubscriptions(expired).catch(() => {});
  }

  return { sent, failed, expired };
}

export async function generateVapidKeys() {
  const wp = await getWebPush();
  if (!wp) return null;
  return wp.default.generateVAPIDKeys();
}

export function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

const pushTransport = {
  async send({ schoolId, subject, body, url, store: storeInstance }) {
    return sendPush({ schoolId, title: subject, body, url, store: storeInstance });
  },
};
export default pushTransport;
