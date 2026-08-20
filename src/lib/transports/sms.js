/**
 * SMS transport — Termii API integration.
 *
 * Required env vars (all optional — the app runs fine without them):
 *   TERMII_API_KEY  — Termii API key
 *   TERMII_SENDER_ID — sender ID (e.g. "EduTrack")
 *   TERMII_BASE_URL  — default "https://api.termii.com"
 *
 * Cost: ~₦2–4 per SMS in Nigeria.
 */

const TERMII_BASE = process.env.TERMII_BASE_URL || "https://api.termii.com";

function getConfig() {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID || "EduTrack";
  if (!apiKey) return null;
  return { apiKey, senderId };
}

/**
 * Send an SMS via Termii.
 *
 * @param {Object} opts
 * @param {string|string[]} opts.to — phone number(s) in international format (e.g. "+2348012345678")
 * @param {string} opts.body — SMS message text (max 160 chars for single segment)
 * @returns {Promise<{ success: boolean, externalId?: string, reason?: string }>}
 */
export async function sendSms({ to, body }) {
  const config = getConfig();
  if (!config) return { success: false, reason: "TERMII_API_KEY not configured" };

  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.length) return { success: false, reason: "No recipients" };

  // Termii sends one SMS per request; batch by sending to each number
  const results = [];
  for (const phone of recipients) {
    try {
      const res = await fetch(`${TERMII_BASE}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: config.apiKey,
          type: "plain",
          to: phone,
          from: config.senderId,
          channel: "generic",
          sms: body,
        }),
      });

      const data = await res.json();
      if (res.ok && data.request_id) {
        results.push({ phone, success: true, externalId: data.request_id });
      } else {
        results.push({ phone, success: false, reason: data.message || `HTTP ${res.status}` });
      }
    } catch (err) {
      results.push({ phone, success: false, reason: err?.message });
    }
  }

  const allFailed = results.every((r) => !r.success);
  return {
    success: !allFailed,
    externalId: results.find((r) => r.externalId)?.externalId,
    results,
  };
}

/**
 * Check delivery status of an SMS via Termii.
 *
 * @param {string} requestId — the request_id from sendSms
 * @returns {Promise<{ status: string, delivered: boolean }>}
 */
export async function checkDelivery(requestId) {
  const config = getConfig();
  if (!config) return { status: "unknown", delivered: false };

  try {
    const res = await fetch(`${TERMII_BASE}/api/sms/${requestId}?api_key=${config.apiKey}`);
    const data = await res.json();
    return {
      status: data.status || "unknown",
      delivered: data.status === "delivered",
    };
  } catch {
    return { status: "unknown", delivered: false };
  }
}

/**
 * Check if SMS is configured.
 */
export function isSmsConfigured() {
  return Boolean(process.env.TERMII_API_KEY);
}

// Default export for the message queue's lazy import
const smsTransport = { send: sendSms };
export default smsTransport;
