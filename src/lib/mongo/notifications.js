/**
 * Mongo store — notifications domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  School,
  ReminderBatch,
  Notification,
  STAFF_ROLES,
  decryptField,
  encryptField,
  ready,
  safe,
} from "./shared.js";
import { findUserById } from "./schools.js";

// ---- Notifications (admin inbox) ----------------------------------------------

// ---- Reminder send batches (idempotency) -------------------------------------

/**
 * Look up a recorded reminder send by its idempotency key (school-scoped).
 * Null when this key has never been sent — the caller may proceed to send.
 */
export async function getReminderBatchByKey(schoolId, kind, key) {
  await ready();
  if (!key) return null;
  const found = await ReminderBatch.findOne({ schoolId, kind, key });
  return safe(found);
}

/**
 * Record a reminder send as a batch. Returns { batch, created }: the NEW
 * record on first save, or the EXISTING batch with created:false when this
 * key was already recorded. The unique (schoolId, kind, key) index makes the
 * insert atomic — a concurrent duplicate gets a duplicate-key error and is
 * served the existing record (never a second record, never a re-send).
 */
export async function saveReminderBatch({ schoolId, kind, key, context = "", studentIds = [], result }) {
  await ready();
  if (!key) return null;
  try {
    const batch = await ReminderBatch.create({
      schoolId,
      kind,
      key,
      context,
      studentIds,
      result,
    });
    return { batch: safe(batch), created: true };
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const existing = await ReminderBatch.findOne({ schoolId, kind, key });
    return { batch: safe(existing), created: false };
  }
}

export async function createNotification({ schoolId, kind, to, subject, preview, body, amount }) {
  await ready();
  // `to` is an array of recipient EMAILS — PII, so encrypt each at rest.
  const encryptedTo = (Array.isArray(to) ? to : []).map((t) => encryptField(t));
  const notification = await Notification.create({
    schoolId,
    kind: kind || "info",
    to: encryptedTo,
    subject,
    preview,
    body: body || "",
    amount: Number.isFinite(Number(amount)) ? Number(amount) : undefined,
  });
  return safe(notification);
}

/**
 * Newest first. Each entry carries the caller's OWN `read` flag — two admins
 * see different read states; readBy (other admins' ids) is stripped.
 *
 * Admin-inbox soft delete + auto-archive: a notification the school admin
 * deleted (adminDeletedAt) or that is older than the school's configured
 * retention is hidden from STAFF views only. options.view === "archived"
 * flips to ONLY the auto-archived history; options.includeDeleted === true
 * keeps soft-deleted rows (the Reconcile & forward flow uses this when the
 * school wants deleted reminders to stay forwardable). A parent's or
 * student's reminder copy must survive — they read the same collection, so
 * the caller's role decides whether any filtering applies at all.
 */
export async function listNotifications(schoolId, userId, options = {}) {
  await ready();
  const viewer = userId ? await findUserById(userId) : null;
  const staffView = STAFF_ROLES.includes(viewer?.role);
  let filter = { schoolId };
  if (staffView) {
    // `adminDeletedAt: null` matches both missing and explicit-null, so the
    // staff filter never hides non-deleted rows (unless includeDeleted — the
    // reconcile flow's opt-in). createdAt is compared to the retention
    // cutoff: inbox = newer rows, archived view = older rows.
    const school = await School.findById(schoolId);
    const days = Math.max(1, Number(school?.notificationRetentionDays) || 90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    filter = {
      schoolId,
      ...(options.includeDeleted ? {} : { adminDeletedAt: null }),
      ...(options.view === "archived"
        ? { createdAt: { $lt: cutoff } }
        : { createdAt: { $gte: cutoff } }),
    };
  }
  const docs = await Notification.find(filter).sort({ createdAt: -1 });
  return docs.map((d) => {
    const json = d.toJSON();
    delete json.readBy;
    json.read = isReadBy(d, userId);
    json.to = (json.to || []).map((t) => decryptField(t) || t);
    return json;
  });
}

/**
 * Mark a batch as read FOR THE CALLING ADMIN (their id joins readBy — other
 * admins keep their own unread state). Returns the caller's remaining unread
 * count. Legacy school-wide `read: true` documents count as read for everyone
 * (the "*" sentinel) until they're re-marked.
 */
export async function markNotificationsRead(schoolId, userId, ids) {
  await ready();
  const idList = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (idList.length && userId) {
    await Notification.updateMany(
      { schoolId, _id: { $in: idList } },
      { $addToSet: { readBy: userId } }
    );
  }
  // Soft-deleted AND auto-archived rows are gone from the admin's inbox, so
  // neither may count toward the caller's unread total.
  const school = await School.findById(schoolId);
  const days = Math.max(1, Number(school?.notificationRetentionDays) || 90);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const docs = await Notification.find({
    schoolId,
    adminDeletedAt: null,
    createdAt: { $gte: cutoff },
  });
  return docs.filter((d) => !isReadBy(d, userId)).length;
}

// A notification is read for a given admin if their id is in readBy, OR the
// "*" sentinel is (legacy school-wide "read by everyone" state), OR the doc
// still carries the pre-schema-change school-wide `read: true` (Mongo docs
// are not rewritten by a schema change — readBy only). Defined after the
// functions that use it — the const is only read at call time.
const isReadBy = (doc, userId) => {
  const readBy = Array.isArray(doc.readBy) ? doc.readBy : [];
  return (
    readBy.includes(userId) ||
    readBy.includes("*") ||
    doc.read === true
  );
};

/**
 * SOFT delete notifications by id (school-scoped) — the admin inbox cleanup.
 * Each one is stamped adminDeletedAt instead of removed, so the record (and
 * a parent's or student's own reminder copy) survives — only staff inbox
 * views hide it. The query's `adminDeletedAt: null` clause also keeps the
 * operation idempotent: re-deleting an already-hidden id returns zero.
 */
export async function deleteNotifications(schoolId, ids) {
  await ready();
  const idList = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!idList.length) return 0;
  const res = await Notification.updateMany(
    { schoolId, _id: { $in: idList }, adminDeletedAt: null },
    { $set: { adminDeletedAt: new Date() } }
  );
  return res.modifiedCount || 0;
}

/**
 * Mark a batch of notifications as "reconciled" — their fee reminder was
 * forwarded to the student's newly linked parent. Sets reconciledAt so a
 * reminder is never forwarded twice. Returns the count actually marked.
 */
export async function markNotificationsReconciled(schoolId, ids) {
  await ready();
  const idList = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!idList.length) return 0;
  const res = await Notification.updateMany(
    {
      schoolId,
      _id: { $in: idList },
      // Only un-reconciled rows — the $set below would otherwise bump the
      // timestamp on every repeat call.
      $or: [{ reconciledAt: { $exists: false } }, { reconciledAt: null }],
    },
    { $set: { reconciledAt: new Date() } }
  );
  return res.modifiedCount || 0;
}

// ── Notification Preferences ────────────────────────────────────────
import NotificationPreference from "@/models/NotificationPreference";
import ErasureRequest from "@/models/ErasureRequest";
import DataAccessLog from "@/models/DataAccessLog";

const DEFAULT_CHANNEL_PREF = { inApp: true, email: true, sms: false, whatsapp: false, push: true };

export async function getNotificationPreferences(schoolId, userId) {
  await ready();
  const existing = await NotificationPreference.findOne({ schoolId, userId });
  if (existing) return safe(existing);
  return {
    id: null, schoolId, userId,
    feeReminder: { ...DEFAULT_CHANNEL_PREF },
    reportCard: { ...DEFAULT_CHANNEL_PREF },
    announcement: { ...DEFAULT_CHANNEL_PREF },
    classResource: { ...DEFAULT_CHANNEL_PREF, email: false },
    paymentConfirmation: { ...DEFAULT_CHANNEL_PREF },
    readAhead: { ...DEFAULT_CHANNEL_PREF, email: false },
    message: { ...DEFAULT_CHANNEL_PREF, email: false },
    allDisabled: false,
  };
}

export async function updateNotificationPreferences(schoolId, userId, updates) {
  await ready();
  const existing = await NotificationPreference.findOne({ schoolId, userId });
  if (existing) {
    Object.assign(existing, updates);
    await existing.save();
    return safe(existing);
  }
  const doc = await NotificationPreference.create({
    schoolId, userId,
    feeReminder: updates.feeReminder || { ...DEFAULT_CHANNEL_PREF },
    reportCard: updates.reportCard || { ...DEFAULT_CHANNEL_PREF },
    announcement: updates.announcement || { ...DEFAULT_CHANNEL_PREF },
    classResource: updates.classResource || { ...DEFAULT_CHANNEL_PREF, email: false },
    paymentConfirmation: updates.paymentConfirmation || { ...DEFAULT_CHANNEL_PREF },
    readAhead: updates.readAhead || { ...DEFAULT_CHANNEL_PREF, email: false },
    message: updates.message || { ...DEFAULT_CHANNEL_PREF, email: false },
    allDisabled: updates.allDisabled || false,
  });
  return safe(doc);
}

export async function getEnabledChannels(schoolId, userId, notificationType) {
  const prefs = await getNotificationPreferences(schoolId, userId);
  if (prefs.allDisabled) return ["in_app"];
  const typePrefs = prefs[notificationType] || prefs.announcement || DEFAULT_CHANNEL_PREF;
  const channels = [];
  if (typePrefs.inApp) channels.push("in_app");
  if (typePrefs.email) channels.push("email");
  if (typePrefs.sms) channels.push("sms");
  if (typePrefs.whatsapp) channels.push("whatsapp");
  if (typePrefs.push) channels.push("push");
  return channels.length ? channels : ["in_app"];
}
