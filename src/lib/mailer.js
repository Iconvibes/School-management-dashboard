/**
 * Transactional email — the safety-confirmation channel for account-level
 * actions (freezing, reactivating or restoring a school).
 *
 * Config (env):
 *   SMTP_HOST   — required to actually send (nodemailer transport)
 *   SMTP_PORT   — default 587 (465 implies implicit TLS)
 *   SMTP_USER   — optional login username
 *   SMTP_PASS   — optional login password
 *   MAIL_FROM   — sender address, default "Edutrack <no-reply@edutrack.app>"
 *
 * Without SMTP_HOST the mailer is a graceful no-op: it logs a notice and
 * returns { sent: false, transport: "disabled" } so demo/dev environments and
 * the route handlers never crash. Callers treat email as best-effort — the
 * action itself never depends on it.
 */

import nodemailer from "nodemailer";

const MAIL_FROM = process.env.MAIL_FROM || "Edutrack <no-reply@edutrack.app>";

let cachedTransport = null;

/** Lazily build the SMTP transport (only when SMTP_HOST is configured). */
function transport() {
  if (cachedTransport !== null) return cachedTransport;
  const host = process.env.SMTP_HOST;
  if (!host) {
    cachedTransport = null; // stay "unconfigured" — never retry per call
    return null;
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } }
      : {}),
  });
  return cachedTransport;
}

/**
 * Send a plain-text email. Resolves with a result object — it never throws,
 * so callers can fire-and-forget in a try/catch without crashing the request.
 *
 * @param {{ to: string, subject: string, text: string }} mail
 * @returns {Promise<{ sent: boolean, transport: "smtp"|"disabled", error?: string }>}
 */
export async function sendMail({ to, subject, text }) {
  const t = transport();
  if (!t) {
    console.warn(`[mailer] SMTP not configured — skipping "${subject}" → ${to}`);
    return { sent: false, transport: "disabled" };
  }
  try {
    await t.sendMail({ from: MAIL_FROM, to, subject, text });
    return { sent: true, transport: "smtp" };
  } catch (err) {
    console.error("[mailer] send failed:", err?.message || err);
    return { sent: false, transport: "smtp", error: err?.message };
  }
}

/** Test seam — inject a fake transport (or `null` to simulate unconfigured). */
export function __setMailerTransport(t) {
  cachedTransport = t;
}
