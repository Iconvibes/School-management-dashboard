/**
 * Paystack payment gateway integration.
 *
 * Handles payment initialization, verification, and webhook processing.
 * When a parent pays via bank transfer, the system auto-matches the payment
 * to the student using the reference number.
 *
 * Required env vars:
 *   PAYSTACK_SECRET_KEY — Paystack secret API key
 *   NEXT_PUBLIC_PAYSTACK_KEY — Paystack public key (client-side)
 *   PAYSTACK_WEBHOOK_SECRET — webhook signature verification secret
 */

const PAYSTACK_BASE = "https://api.paystack.co";

function getHeaders() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return null;
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Initialize a Paystack transaction.
 *
 * @param {Object} opts
 * @param {number} opts.amount — amount in kobo (Naira × 100)
 * @param {string} opts.email — customer email
 * @param {string} opts.reference — unique transaction reference
 * @param {string} [opts.callbackUrl] — URL to redirect after payment
 * @param {Object} [opts.metadata] — additional data to attach to the transaction
 * @returns {Promise<{ success: boolean, authorizationUrl?: string, accessCode?: string, error?: string }>}
 */
export async function initializeTransaction({ amount, email, reference, callbackUrl, metadata }) {
  const headers = getHeaders();
  if (!headers) return { success: false, error: "PAYSTACK_SECRET_KEY not configured" };

  try {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100), // convert to kobo
        email,
        reference,
        callback_url: callbackUrl,
        metadata: metadata || {},
      }),
    });

    const data = await res.json();
    if (data.status) {
      return {
        success: true,
        authorizationUrl: data.data.authorization_url,
        accessCode: data.data.access_code,
        reference: data.data.reference,
      };
    }
    return { success: false, error: data.message || "Initialization failed" };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Verify a Paystack transaction.
 *
 * @param {string} reference — transaction reference
 * @returns {Promise<{ success: boolean, amount?: number, status?: string, metadata?: Object, error?: string }>}
 */
export async function verifyTransaction(reference) {
  const headers = getHeaders();
  if (!headers) return { success: false, error: "PAYSTACK_SECRET_KEY not configured" };

  try {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, { headers });
    const data = await res.json();

    if (data.status && data.data?.status === "success") {
      return {
        success: true,
        amount: data.data.amount / 100, // convert from kobo to naira
        status: data.data.status,
        reference: data.data.reference,
        metadata: data.data.metadata || {},
        paidAt: data.data.paid_at,
        channel: data.data.channel,
      };
    }
    return { success: false, status: data.data?.status, error: data.message };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Verify Paystack webhook signature.
 *
 * @param {string} body — raw request body
 * @param {string} signature — x-paystack-signature header
 * @returns {boolean}
 */
export function verifyWebhookSignature(body, signature) {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!secret) return false;

  const crypto = require("crypto");
  const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");
  return hash === signature;
}

/**
 * Check if Paystack is configured.
 */
export function isPaystackConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

/**
 * Generate a unique payment reference.
 */
export function generateReference(prefix = "EDU") {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
}
