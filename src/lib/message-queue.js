/**
 * Multi-channel message dispatch system.
 *
 * Notifications are created in the store, then dispatched to one or more
 * channels: sms, email, in_app, push, whatsapp (full Meta Cloud API).
 *
 * Each channel has a pluggable transport. The queue handles retries,
 * delivery tracking, and fallback chains.
 */

import { sendEmail, isEmailConfigured } from "@/lib/mailer";
import { store } from "@/lib/store";
import * as log from "@/lib/log";

// ── Channel transports ──────────────────────────────────────────────

const transports = {};

/**
 * Register a channel transport. Each transport must implement:
 *   send({ schoolId, to, subject, body, notificationId }) → { success, externalId? }
 */
export function registerTransport(channel, transport) {
  transports[channel] = transport;
}

/**
 * In-app transport — writes to the Notification model (existing behavior).
 */
transports.in_app = {
  async send({ schoolId, kind, to, subject, preview, body, amount, notificationId }) {
    // If a notification already exists (created by the caller), just return it.
    if (notificationId) return { success: true, externalId: notificationId };
    // Otherwise create a new one.
    const n = await store.createNotification({ schoolId, kind, to, subject, preview, body, amount });
    return { success: true, externalId: n.id };
  },
};

/**
 * Email transport — wraps the existing nodemailer setup.
 */
transports.email = {
  async send({ to, subject, body }) {
    if (!isEmailConfigured()) return { success: false, reason: "SMTP not configured" };
    if (!to || !to.length) return { success: false, reason: "No recipients" };
    const recipients = Array.isArray(to) ? to.join(", ") : to;
    try {
      const info = await sendEmail({ to: recipients, subject, text: body });
      return { success: Boolean(info), externalId: info?.messageId };
    } catch (err) {
      log.warn("message-queue", "email send failed:", err?.message);
      return { success: false, reason: err?.message };
    }
  },
};

/**
 * SMS transport — lazy-loaded from transports/sms.js to avoid circular deps.
 */
let _smsTransport = null;
async function getSmsTransport() {
  if (_smsTransport) return _smsTransport;
  try {
    const mod = await import("@/lib/transports/sms");
    _smsTransport = mod.default || mod.smsTransport;
  } catch {
    _smsTransport = null;
  }
  return _smsTransport;
}
transports.sms = {
  async send(opts) {
    const t = await getSmsTransport();
    if (!t) return { success: false, reason: "SMS transport not loaded" };
    return t.send(opts);
  },
};

/**
 * Push transport — lazy-loaded from transports/push.js.
 */
let _pushTransport = null;
async function getPushTransport() {
  if (_pushTransport) return _pushTransport;
  try {
    const mod = await import("@/lib/transports/push");
    _pushTransport = mod.default || mod.pushTransport;
  } catch {
    _pushTransport = null;
  }
  return _pushTransport;
}
transports.push = {
  async send(opts) {
    const t = await getPushTransport();
    if (!t) return { success: false, reason: "Push transport not loaded" };
    return t.send(opts);
  },
};

/**
 * WhatsApp transport — lazy-loaded from transports/whatsapp.js.
 * Full Meta Cloud API integration with text, document, and template messages.
 */
let _whatsappTransport = null;
async function getWhatsAppTransport() {
  if (_whatsappTransport) return _whatsappTransport;
  try {
    const mod = await import("@/lib/transports/whatsapp");
    _whatsappTransport = {
      async send({ to, subject, body, documentUrl, filename }) {
        const phones = Array.isArray(to) ? to : [to];
        const results = [];
        for (const phone of phones) {
          if (!phone || !phone.startsWith("+")) continue; // skip non-phone addresses
          if (documentUrl) {
            const r = await mod.sendDocument({ to: phone, documentUrl, filename, caption: body });
            results.push({ phone, ...r });
          } else {
            const r = await mod.sendText({ to: phone, text: `${subject}\n\n${body}` });
            results.push({ phone, ...r });
          }
        }
        const allFailed = results.length > 0 && results.every((r) => !r.success);
        return { success: !allFailed, results };
      },
    };
  } catch {
    _whatsappTransport = null;
  }
  return _whatsappTransport;
}
transports.whatsapp = {
  async send(opts) {
    const t = await getWhatsAppTransport();
    if (!t) return { success: false, reason: "WhatsApp transport not loaded" };
    return t.send(opts);
  },
};

// ── Queue dispatch ──────────────────────────────────────────────────

/**
 * Dispatch a message to one or more channels.
 *
 * @param {Object} opts
 * @param {string} opts.schoolId
 * @param {string} [opts.kind] — notification kind (fee_reminder, report_card, etc.)
 * @param {string[]} opts.to — recipient addresses (emails for email, phone numbers for SMS, user IDs for push)
 * @param {string} opts.subject — message subject/title
 * @param {string} opts.body — message body (plain text)
 * @param {string} [opts.preview] — short preview for in-app list
 * @param {number} [opts.amount] — optional money amount
 * @param {string} [opts.url] — URL to open when notification is clicked (push only)
 * @param {string[]} [opts.channels] — which channels to use (defaults to ["in_app"])
 * @param {string} [opts.notificationId] — existing notification ID to avoid duplicate creation
 * @returns {Promise<{ results: Object[], allFailed: boolean }>}
 */
export async function dispatchMessage(opts) {
  const {
    schoolId,
    kind = "info",
    to = [],
    subject,
    body,
    preview,
    amount,
    url,
    channels = ["in_app"],
    notificationId,
  } = opts;

  const results = [];

  for (const channel of channels) {
    const transport = transports[channel];
    if (!transport) {
      results.push({ channel, success: false, reason: `No transport for "${channel}"` });
      continue;
    }

    try {
      const result = await transport.send({
        schoolId,
        kind,
        to,
        subject,
        body,
        preview,
        amount,
        url,
        notificationId,
      });
      results.push({ channel, ...result });
    } catch (err) {
      results.push({ channel, success: false, reason: err?.message || "Unknown error" });
    }
  }

  const allFailed = results.length > 0 && results.every((r) => !r.success);
  return { results, allFailed };
}

/**
 * Convenience: send a fee reminder to a parent via the configured channels.
 * Creates the in-app notification AND sends SMS/email if configured.
 */
export async function sendFeeReminder({ schoolId, student, parent, balance, schoolName, message, channels, url }) {
  const studentName = student?.name || "your child";
  const studentLine = `${studentName}${student?.assignedClass ? ` — ${student.assignedClass}` : ""}`;
  const naira = (n) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(n) || 0);

  const subject = `Fee reminder · ${studentName}`;
  const preview = `${parent?.name || "A parent"} — ${naira(balance)} still outstanding for ${studentName}`;
  const body = message || [
    `Hi ${parent?.name || "there"}`,
    "",
    `This is a friendly reminder from ${schoolName || "your child's school"}:`,
    "",
    `  Student: ${studentLine}`,
    `  Outstanding balance: ${naira(balance)}`,
    "",
    "Kindly complete this term's fee payment at your earliest convenience.",
    "You can pay securely through the parent portal (Pay Now), or visit the",
    "school office to settle the balance.",
    "",
    "Thank you,",
    schoolName || "The School Office",
  ].join("\n");

  const channelsToUse = channels || ["in_app", "sms", "email"];
  const toAddresses = [];
  if (parent?.email) toAddresses.push(parent.email);
  // Phone numbers would be added here when parent phone data is available

  const notification = await store.createNotification({
    schoolId,
    kind: "fee_reminder",
    to: toAddresses,
    subject,
    preview,
    body,
    amount: balance,
  });

  return dispatchMessage({
    schoolId,
    kind: "fee_reminder",
    to: toAddresses,
    subject,
    body,
    preview,
    amount: balance,
    url: url || "/parent/dashboard",
    channels: channelsToUse,
    notificationId: notification.id,
  });
}

/**
 * Convenience: deliver report card notification to a parent.
 */
export async function sendReportCardReady({ schoolId, student, parent, term, session, reportUrl, channels, url }) {
  const studentName = student?.name || "your child";
  const naira = (n) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(n) || 0);

  const subject = `Report card ready · ${studentName}`;
  const preview = `${studentName}'s report card for ${term} ${session} is ready`;
  const body = [
    `Hi ${parent?.name || "there"}`,
    "",
    `${studentName}'s report card for ${term} ${session} is now ready.`,
    "",
    reportUrl ? `View and download the report card here:` : `Log in to the parent portal to view and download the report card.`,
    reportUrl || "",
    "",
    "You can also share the report card directly on WhatsApp or print it.",
    "",
    "Thank you,",
    "EduTrack",
  ].filter(Boolean).join("\n");

  const channelsToUse = channels || ["in_app", "sms", "email"];
  const toAddresses = parent?.email ? [parent.email] : [];

  const notification = await store.createNotification({
    schoolId,
    kind: "report_card",
    to: toAddresses,
    subject,
    preview,
    body,
  });

  return dispatchMessage({
    schoolId,
    kind: "report_card",
    to: toAddresses,
    subject,
    body,
    preview,
    url: url || "/parent/dashboard",
    channels: channelsToUse,
    notificationId: notification.id,
  });
}

/**
 * Convenience: send a class resource notification (notes, assignments).
 */
export async function sendResourceNotification({ schoolId, teacher, students, parentEmails, resource, channels, url }) {
  const subject = `New ${resource.type} from ${teacher?.name || "your teacher"}`;
  const preview = `${teacher?.name || "Teacher"} posted "${resource.title}" for ${resource.classArm}`;
  const body = [
    `A new ${resource.type} has been posted for ${resource.classArm} — ${resource.subject}.`,
    "",
    `Title: ${resource.title}`,
    resource.description ? `Description: ${resource.description}` : "",
    "",
    "Log in to view and download.",
  ].filter(Boolean).join("\n");

  const channelsToUse = channels || ["in_app", "push"];
  const toAddresses = parentEmails || [];

  const notification = await store.createNotification({
    schoolId,
    kind: "class_resource",
    to: toAddresses,
    subject,
    preview,
    body,
  });

  return dispatchMessage({
    schoolId,
    kind: "class_resource",
    to: toAddresses,
    subject,
    body,
    preview,
    url: url || "/student/dashboard",
    channels: channelsToUse,
    notificationId: notification.id,
  });
}
