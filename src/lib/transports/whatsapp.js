/**
 * WhatsApp transport — Meta Cloud API integration.
 *
 * Sends messages to parents via WhatsApp Business API.
 * Supports text messages, document messages (report card PDFs),
 * and template messages for fee reminders.
 *
 * Required env vars:
 *   WHATSAPP_ACCESS_TOKEN   — Meta Cloud API access token
 *   WHATSAPP_PHONE_NUMBER_ID — WhatsApp Business phone number ID
 *   WHATSAPP_BUSINESS_ACCOUNT_ID — WhatsApp Business Account ID
 *
 * Cost: ~₦25–50 per conversation (Nigeria business-initiated).
 *
 * Flow:
 *   1. Admin enables WhatsApp in Settings → Notification Channels
 *   2. System sends messages via Meta Cloud API
 *   3. Delivery status callbacks update the notification record
 *   4. Failed deliveries fall back to SMS
 */

const GRAPH_API = "https://graph.facebook.com/v19.0";

function getConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId, businessAccountId };
}

/**
 * Format a Nigerian phone number for WhatsApp.
 * Accepts: "+2348012345678", "08012345678", "2348012345678"
 * Returns: "2348012345678" (no + prefix for WhatsApp API)
 */
function formatPhone(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("0")) cleaned = "234" + cleaned.slice(1);
  if (!cleaned.startsWith("234")) cleaned = "234" + cleaned;
  return cleaned;
}

/**
 * Send a text message via WhatsApp.
 *
 * @param {Object} opts
 * @param {string} opts.to — phone number
 * @param {string} opts.text — message text (max 4096 chars)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendText({ to, text }) {
  const config = getConfig();
  if (!config) return { success: false, error: "WhatsApp not configured" };

  const phone = formatPhone(to);
  if (!phone) return { success: false, error: "Invalid phone number" };

  try {
    const res = await fetch(
      `${GRAPH_API}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: text },
        }),
      }
    );

    const data = await res.json();
    if (data.messages?.[0]?.id) {
      return { success: true, messageId: data.messages[0].id };
    }
    return {
      success: false,
      error: data.error?.message || `HTTP ${res.status}`,
      errorCode: data.error?.code,
    };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Send a document message via WhatsApp (e.g. report card PDF).
 *
 * @param {Object} opts
 * @param {string} opts.to — phone number
 * @param {string} opts.documentUrl — public URL of the document
 * @param {string} opts.filename — display filename
 * @param {string} [opts.caption] — optional caption text
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendDocument({ to, documentUrl, filename, caption }) {
  const config = getConfig();
  if (!config) return { success: false, error: "WhatsApp not configured" };

  const phone = formatPhone(to);
  if (!phone) return { success: false, error: "Invalid phone number" };

  try {
    const res = await fetch(
      `${GRAPH_API}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "document",
          document: {
            link: documentUrl,
            filename: filename || "document.pdf",
            caption: caption || "",
          },
        }),
      }
    );

    const data = await res.json();
    if (data.messages?.[0]?.id) {
      return { success: true, messageId: data.messages[0].id };
    }
    return {
      success: false,
      error: data.error?.message || `HTTP ${res.status}`,
      errorCode: data.error?.code,
    };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Send a template message via WhatsApp.
 * Template messages are pre-approved by Meta and can be sent to non-contacts.
 *
 * @param {Object} opts
 * @param {string} opts.to — phone number
 * @param {string} opts.templateName — template name (e.g. "fee_reminder")
 * @param {string} opts.languageCode — language code (e.g. "en_US")
 * @param {Array} [opts.parameters] — template parameters
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendTemplate({ to, templateName, languageCode = "en_US", parameters }) {
  const config = getConfig();
  if (!config) return { success: false, error: "WhatsApp not configured" };

  const phone = formatPhone(to);
  if (!phone) return { success: false, error: "Invalid phone number" };

  const bodyParams = (parameters || []).map((p) => ({
    type: "text",
    text: String(p),
  }));

  try {
    const res = await fetch(
      `${GRAPH_API}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: bodyParams.length
              ? [{ type: "body", parameters: bodyParams }]
              : [],
          },
        }),
      }
    );

    const data = await res.json();
    if (data.messages?.[0]?.id) {
      return { success: true, messageId: data.messages[0].id };
    }
    return {
      success: false,
      error: data.error?.message || `HTTP ${res.status}`,
      errorCode: data.error?.code,
    };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Check delivery status of a WhatsApp message.
 */
export async function checkStatus(messageId) {
  const config = getConfig();
  if (!config) return { status: "unknown" };

  try {
    const res = await fetch(
      `${GRAPH_API}/${messageId}?access_token=${config.token}`
    );
    const data = await res.json();
    return {
      status: data.status || "unknown",
      delivered: data.status === "delivered",
      read: data.status === "read",
    };
  } catch {
    return { status: "unknown" };
  }
}

/**
 * Check if WhatsApp is configured.
 */
export function isWhatsAppConfigured() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

/**
 * Get WhatsApp account info (for settings page).
 */
export async function getAccountInfo() {
  const config = getConfig();
  if (!config) return null;

  try {
    const res = await fetch(
      `${GRAPH_API}/${config.phoneNumberId}?access_token=${config.token}`
    );
    const data = await res.json();
    return {
      phoneNumber: data.display_phone_number,
      verifiedName: data.verified_name,
      qualityRating: data.quality_rating,
      status: data.account_mode,
    };
  } catch {
    return null;
  }
}
