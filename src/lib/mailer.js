import nodemailer from "nodemailer";
import * as log from "@/lib/log";

/**
 * Email transport — initialised lazily on first send. When SMTP env vars are
 * absent the module is a no-op (sendEmail returns null silently), so the app
 * works identically without email configured.
 *
 * Required env vars (all optional — the app runs fine without them):
 *   SMTP_HOST     — SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT     — port (default 465 for TLS, 587 for STARTTLS)
 *   SMTP_USER     — username / email address
 *   SMTP_PASS     — password or app password
 *   SMTP_FROM     — "From" address shown on outgoing emails
 *   SMTP_SECURE   — "true" for TLS on port 465, "false" for STARTTLS on 587
 */

let _transporter = null;
let _testTransport = null;

/**
 * Inject a mock transport for testing. Pass null to reset to real SMTP.
 * @param {object|null} transport — mock object with a sendMail method, or null
 */
export function __setMailerTransport(transport) {
  _testTransport = transport;
}

function getTransporter() {
  if (_testTransport) return _testTransport;
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  if (!host) return null; // No SMTP configured — silently skip

  _transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || (process.env.SMTP_SECURE === "true" ? 465 : 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  return _transporter;
}

/**
 * Send an email. Returns the nodemailer info object on success, or null when
 * SMTP is not configured (the caller should treat null as "skipped").
 *
 * @param {Object} opts
 * @param {string} opts.to      — recipient email address
 * @param {string} opts.subject — email subject line
 * @param {string} opts.text    — plain-text body (required)
 * @param {string} opts.html    — HTML body (optional, falls back to text)
 * @returns {Promise<object|null>}
 */
export async function sendEmail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) return null;

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "EduTrack <no-reply@edutrack.app>",
      to,
      subject,
      text,
      html: html || text,
    });
    return info;
  } catch (err) {
    log.warn("mailer", "send failed:", err?.message);
    return null;
  }
}

/**
 * Test-friendly send wrapper. Returns a structured result instead of
 * the raw nodemailer info object.
 *
 * @param {Object} opts
 * @param {string} opts.to      — recipient email address
 * @param {string} opts.subject — email subject line
 * @param {string} opts.text    — plain-text body
 * @returns {Promise<{sent: boolean, transport: string}>}
 */
export async function sendMail({ to, subject, text }) {
  const result = await sendEmail({ to, subject, text });
  if (result === null) return { sent: false, transport: "disabled" };
  return { sent: true, transport: "smtp" };
}

/**
 * Check whether email delivery is configured.
 */
export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST);
}
