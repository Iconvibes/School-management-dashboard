/**
 * Communications module — demo store implementation.
 *
 * Full implementations ported from the original monolithic demo-store.js
 * to preserve all features: soft-delete, auto-archive, tie-break sorting,
 * role-based filtering, unread count with cutoff, etc.
 */
import {
  notifications,
  messages,
  pushSubscriptions as pushSubs,
  notificationPreferences as notifPrefs,
  reminderBatches as remindBatches,
  digestPrefs as digPrefs,
  digests as digArr,
  users,
  schools,
  nid,
  clone,
  nowIso,
  persist,
} from "@/modules/shared/store-state";
import { STAFF_ROLES } from "@/lib/permissions";
import { findUserById } from "@/modules/users/store";

// ── SSE push (lazy-loaded to avoid sse-manager's setInterval in tests) ──
let _broadcastToSchool;
async function pushSse(schoolId, event) {
  if (!_broadcastToSchool) {
    try {
      const mod = await import("@/lib/sse-manager");
      _broadcastToSchool = mod.broadcastToSchool;
    } catch {
      _broadcastToSchool = () => {}; // no-op if sse-manager unavailable
    }
  }
  try { _broadcastToSchool(schoolId, event); } catch {}
}

// ── Helpers ─────────────────────────────────────────────────────────

/** A notification is read for a given admin if their id is in readBy, OR the
 *  "*" sentinel is (the legacy school-wide "read by everyone" state), OR it
 *  still carries the old school-wide `read: true`. */
const isReadBy = (n, userId) => {
  const readBy = Array.isArray(n.readBy) ? n.readBy : [];
  return readBy.includes(userId) || readBy.includes("*") || n.read === true;
};

/** Auto-archive cutoff timestamp (ms) — notifications older than the school's
 *  notificationRetentionDays are hidden from staff views. */
function notificationCutoff(schoolId) {
  const school = schools.find((s) => s.id === schoolId);
  const days = Math.max(1, Number(school?.notificationRetentionDays) || 90);
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

// ── Notifications ───────────────────────────────────────────────────

export async function createNotification({ schoolId, kind, to, subject, preview, body, amount }) {
  const notification = {
    id: nid("not"),
    schoolId,
    kind: kind || "info",
    to: Array.isArray(to) ? to : [],
    subject,
    preview,
    body: body || "",
    amount: Number.isFinite(Number(amount)) ? Number(amount) : undefined,
    readBy: [],
    createdAt: nowIso(),
  };
  notifications.push(notification);
  persist();
  // Push to connected SSE clients for real-time notification delivery.
  // No-op when no clients are connected or sse-manager is unavailable.
  const cloned = clone(notification);
  pushSse(schoolId, { type: "notification", data: cloned });
  return cloned;
}

/**
 * Newest first (parity with Mongo's createdAt desc sort). Each entry carries
 * the caller's OWN `read` flag — two admins see different read states, and
 * readBy (other admins' ids) is stripped from the payload.
 *
 * Admin-inbox soft delete + auto-archive: a notification the school admin
 * deleted (adminDeletedAt) or that is older than the school's retention is
 * hidden from STAFF views only. options.view === "archived" flips to ONLY
 * the auto-archived history; options.includeDeleted === true keeps
 * soft-deleted rows (the Reconcile & forward flow uses this when the
 * school wants deleted reminders to stay forwardable). A parent's or
 * student's reminder copy must survive — the portals read the same store,
 * so the caller's role decides whether any filtering applies at all.
 */
export async function listNotifications(schoolId, userId, options = {}) {
  const viewer = userId ? await findUserById(userId) : null;
  const staffView = STAFF_ROLES.includes(viewer?.role);
  const cutoff = staffView ? notificationCutoff(schoolId) : null;
  const wantArchived = staffView && options.view === "archived";
  const includeDeleted = options.includeDeleted === true;
  return notifications
    .filter((n) => n.schoolId === schoolId)
    .filter((n) => {
      if (!staffView) return true;
      if (n.adminDeletedAt && !includeDeleted) return false;
      const isArchived = new Date(n.createdAt).getTime() < cutoff;
      return wantArchived ? isArchived : !isArchived;
    })
    // Tie-break on the (monotonic) id suffix so same-millisecond creates still
    // order deterministically — newest created sorts first.
    .sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt) ||
        Number(b.id.replace(/\D/g, "")) - Number(a.id.replace(/\D/g, ""))
    )
    .map((n) => {
      const copy = { ...n };
      delete copy.readBy;
      copy.read = isReadBy(n, userId);
      return copy;
    });
}

/**
 * Mark a batch as read FOR THE CALLING ADMIN (their id joins readBy — other
 * admins keep their own unread state). Returns the caller's remaining unread
 * count. A legacy school-wide `read: true` becomes "*" so it stays read.
 */
export async function markNotificationsRead(schoolId, userId, ids) {
  const set = new Set(ids || []);
  let changed = false;
  notifications.forEach((n) => {
    if (n.schoolId !== schoolId || !set.has(n.id)) return;
    if (n.read === true) {
      // Legacy school-wide read → sentinel, then record this admin too.
      n.readBy = Array.isArray(n.readBy) ? n.readBy : [];
      if (!n.readBy.includes("*")) n.readBy.push("*");
      delete n.read;
      changed = true;
    }
    if (n.readBy === undefined) n.readBy = [];
    if (!n.readBy.includes(userId)) {
      n.readBy.push(userId);
      changed = true;
    }
  });
  if (changed) persist();
  // Soft-deleted AND auto-archived rows are gone from the admin's inbox, so
  // neither may count toward the caller's unread total.
  const cutoff = notificationCutoff(schoolId);
  return notifications.filter(
    (n) =>
      n.schoolId === schoolId &&
      !isReadBy(n, userId) &&
      !n.adminDeletedAt &&
      new Date(n.createdAt).getTime() >= cutoff
  ).length;
}

/**
 * SOFT delete notifications by id (school-scoped) — the admin inbox cleanup.
 * Each one is stamped adminDeletedAt instead of removed, so the record (and
 * a parent's or student's own reminder copy) survives — only staff inbox
 * views hide it. Returns the number newly hidden.
 */
export async function deleteNotifications(schoolId, ids) {
  const set = new Set(ids || []);
  const stamp = nowIso();
  let marked = 0;
  notifications.forEach((n) => {
    if (n.schoolId !== schoolId || !set.has(n.id) || n.adminDeletedAt) return;
    n.adminDeletedAt = stamp;
    marked += 1;
  });
  if (marked) persist();
  return marked;
}

/**
 * Mark a batch of notifications as "reconciled" — i.e. their fee reminder
 * was forwarded to the student's newly linked parent. Sets reconciledAt.
 * Returns the number actually marked (already-reconciled ones don't count).
 */
export async function markNotificationsReconciled(schoolId, ids) {
  const set = new Set(ids || []);
  const stamp = nowIso();
  let changed = 0;
  notifications.forEach((n) => {
    if (n.schoolId !== schoolId || !set.has(n.id)) return;
    if (n.reconciledAt) return; // already forwarded
    n.reconciledAt = stamp;
    changed += 1;
  });
  if (changed) persist();
  return changed;
}

// ── Reminder send batches (idempotency) ────────────────────────────

/**
 * Look up a recorded reminder send by its idempotency key (school-scoped).
 * Null when this key has never been sent.
 */
export async function getReminderBatchByKey(schoolId, kind, key) {
  if (!key) return null;
  const found = remindBatches.find(
    (b) => b.schoolId === schoolId && b.kind === kind && b.key === key
  );
  return found ? clone(found) : null;
}

/**
 * Record a reminder send as a batch. Returns { batch, created }: the NEW
 * record on first save, or the EXISTING batch with created:false when this
 * key was already recorded (a concurrent duplicate — the caller must treat
 * the send as already done and replay the existing result, never re-send).
 */
export async function saveReminderBatch({ schoolId, kind, key, context = "", studentIds = [], result }) {
  if (!key) return null;
  const existing = remindBatches.find(
    (b) => b.schoolId === schoolId && b.kind === kind && b.key === key
  );
  if (existing) return { batch: clone(existing), created: false };
  const batch = {
    id: nid("rmb"),
    schoolId,
    kind,
    key,
    context,
    studentIds,
    result,
    createdAt: nowIso(),
  };
  remindBatches.push(batch);
  persist();
  return { batch: clone(batch), created: true };
}

// ── Messaging ───────────────────────────────────────────────────────

export async function sendMessage({ schoolId, from, to, studentId, subject, body, type, replyTo, attachments }) {
  const msg = {
    id: nid("msg"),
    schoolId,
    from,
    to,
    studentId: studentId || null,
    subject: subject || "",
    body,
    type: type || "direct",
    replyTo: replyTo || null,
    attachments: attachments || [],
    read: false,
    readAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  messages.push(msg);
  persist();
  return clone(msg);
}

export async function getConversation(schoolId, userId1, userId2, { limit = 50, before } = {}) {
  return messages
    .filter((m) => {
      if (m.schoolId !== schoolId) return false;
      const isBetween =
        (m.from === userId1 && m.to === userId2) ||
        (m.from === userId2 && m.to === userId1);
      if (!isBetween) return false;
      if (before && new Date(m.createdAt) >= new Date(before)) return false;
      return true;
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-limit)
    .map(clone);
}

export async function listConversations(schoolId, userId) {
  const convos = {};
  for (const m of messages) {
    if (m.schoolId !== schoolId) continue;
    const isMine = m.from === userId || m.to === userId;
    if (!isMine) continue;
    const partnerId = m.from === userId ? m.to : m.from;
    if (!convos[partnerId] || new Date(m.createdAt) > new Date(convos[partnerId].lastDate))
      convos[partnerId] = { partnerId, lastMessage: m.body, lastDate: m.createdAt, unread: 0 };
    if (m.to === userId && !m.read)
      convos[partnerId].unread = (convos[partnerId].unread || 0) + 1;
  }
  const result = Object.values(convos).sort(
    (a, b) => new Date(b.lastDate) - new Date(a.lastDate)
  );
  for (const c of result) {
    const user = users.find((u) => u.id === c.partnerId);
    if (user) {
      c.partnerName = user.name;
      c.partnerRole = user.role;
      c.partnerClass = user.assignedClass;
    }
  }
  return result;
}

export async function markMessageRead(messageId) {
  const msg = messages.find((m) => m.id === messageId);
  if (msg) {
    msg.read = true;
    msg.readAt = nowIso();
    persist();
  }
}

export async function markConversationRead(schoolId, userId, partnerId) {
  for (const m of messages) {
    if (m.schoolId === schoolId && m.from === partnerId && m.to === userId && !m.read) {
      m.read = true;
      m.readAt = nowIso();
    }
  }
  persist();
}

export async function getUnreadMessageCount(schoolId, userId) {
  return messages.filter(
    (m) => m.schoolId === schoolId && m.to === userId && !m.read
  ).length;
}

// ── Notification Preferences ────────────────────────────────────────

export async function getNotificationPreferences(schoolId, userId) {
  const existing = notifPrefs.find(
    (p) => p.schoolId === schoolId && p.userId === userId
  );
  if (existing) return clone(existing);
  return {
    id: null,
    schoolId,
    userId,
    feeReminder: { inApp: true, email: true, sms: false, whatsapp: false, push: true },
    reportCard: { inApp: true, email: true, sms: true, whatsapp: false, push: true },
    announcement: { inApp: true, email: true, sms: false, whatsapp: false, push: true },
    classResource: { inApp: true, email: false, sms: false, whatsapp: false, push: true },
    paymentConfirmation: { inApp: true, email: true, sms: true, whatsapp: false, push: true },
    readAhead: { inApp: true, email: false, sms: false, whatsapp: false, push: true },
    message: { inApp: true, email: false, sms: false, whatsapp: false, push: true },
    allDisabled: false,
  };
}

export async function getEnabledChannels(schoolId, userId, notificationType) {
  const prefs = await getNotificationPreferences(schoolId, userId);
  if (prefs.allDisabled) return ["in_app"];
  const DEFAULT_CHANNEL_PREF = {
    inApp: true,
    email: true,
    sms: false,
    whatsapp: false,
    push: true,
  };
  const typePrefs =
    prefs[notificationType] || prefs.announcement || DEFAULT_CHANNEL_PREF;
  const channels = [];
  if (typePrefs.inApp) channels.push("in_app");
  if (typePrefs.email) channels.push("email");
  if (typePrefs.sms) channels.push("sms");
  if (typePrefs.whatsapp) channels.push("whatsapp");
  if (typePrefs.push) channels.push("push");
  return channels.length ? channels : ["in_app"];
}

// ── Push Subscriptions ──────────────────────────────────────────────

export async function savePushSubscription({ schoolId, userId, endpoint, keys, userAgent }) {
  const existing = pushSubs.find((s) => s.endpoint === endpoint);
  if (existing) {
    existing.keys = keys;
    existing.userAgent = userAgent || existing.userAgent;
    existing.active = true;
    existing.lastUsedAt = nowIso();
    existing.updatedAt = nowIso();
    persist();
    return clone(existing);
  }
  const sub = {
    id: nid("push"),
    schoolId,
    userId,
    endpoint,
    keys,
    userAgent: userAgent || "",
    active: true,
    lastUsedAt: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  pushSubs.push(sub);
  persist();
  return clone(sub);
}

export async function listPushSubscriptions(schoolId, userIds) {
  return pushSubs
    .filter((s) => {
      if (s.schoolId !== schoolId || !s.active) return false;
      if (userIds && userIds.length && !userIds.includes(s.userId)) return false;
      return true;
    })
    .map(clone);
}

export async function removePushSubscriptions(ids) {
  for (const id of ids) {
    const sub = pushSubs.find((s) => s.id === id);
    if (sub) sub.active = false;
  }
  persist();
}

export async function deletePushSubscription(endpoint) {
  const idx = pushSubs.findIndex((s) => s.endpoint === endpoint);
  if (idx === -1) return false;
  pushSubs.splice(idx, 1);
  persist();
  return true;
}

// ── Digests ─────────────────────────────────────────────────────────

export async function getDigestPref(schoolId, userId) {
  const pref = digPrefs.find(
    (p) => p.schoolId === schoolId && p.userId === userId
  );
  if (pref) return clone(pref);
  return { schoolId, userId, frequency: "off", lastSentAt: null };
}

export async function setDigestPref(schoolId, userId, frequency) {
  const freq = ["off", "daily", "weekly"].includes(frequency)
    ? frequency
    : "off";
  let pref = digPrefs.find(
    (p) => p.schoolId === schoolId && p.userId === userId
  );
  if (!pref) {
    pref = {
      id: nid("dgp"),
      schoolId,
      userId,
      frequency: "off",
      lastSentAt: null,
      createdAt: nowIso(),
    };
    digPrefs.push(pref);
  }
  pref.frequency = freq;
  persist();
  return clone(pref);
}

export async function sendDigest({ schoolId, userId, frequency, subject, preview, body, itemCount }) {
  const digest = {
    id: nid("dgs"),
    schoolId,
    userId,
    frequency: frequency === "weekly" ? "weekly" : "daily",
    subject,
    preview,
    body: body || "",
    itemCount: Number(itemCount) || 0,
    createdAt: nowIso(),
  };
  digArr.push(digest);

  let pref = digPrefs.find(
    (p) => p.schoolId === schoolId && p.userId === userId
  );
  if (!pref) {
    pref = {
      id: nid("dgp"),
      schoolId,
      userId,
      frequency: "off",
      lastSentAt: null,
      createdAt: nowIso(),
    };
    digPrefs.push(pref);
  }
  pref.lastSentAt = digest.createdAt;
  persist();
  return clone(digest);
}

export async function listDigests(schoolId, userId, { limit = 20 } = {}) {
  return digArr
    .filter((d) => d.schoolId === schoolId && d.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt) ||
        Number(b.id.replace(/\D/g, "")) - Number(a.id.replace(/\D/g, ""))
    )
    .slice(0, limit)
    .map(clone);
}

// ── Notification Preferences (update) ───────────────────────────────

const DEFAULT_CHANNEL_PREF = {
  in_app: true,
  sms: false,
  whatsapp: false,
  email: false,
};

export async function updateNotificationPreferences(schoolId, userId, updates) {
  const existing = notifPrefs.find(
    (p) => p.schoolId === schoolId && p.userId === userId
  );
  if (existing) {
    Object.assign(existing, updates);
    persist();
    return clone(existing);
  }
  const doc = {
    id: nid("npref"),
    schoolId,
    userId,
    feeReminder: updates.feeReminder || { ...DEFAULT_CHANNEL_PREF },
    reportCard: updates.reportCard || { ...DEFAULT_CHANNEL_PREF },
    announcement: updates.announcement || { ...DEFAULT_CHANNEL_PREF },
    classResource: updates.classResource || { ...DEFAULT_CHANNEL_PREF, email: false },
    paymentConfirmation: updates.paymentConfirmation || { ...DEFAULT_CHANNEL_PREF },
    readAhead: updates.readAhead || { ...DEFAULT_CHANNEL_PREF, email: false },
    message: updates.message || { ...DEFAULT_CHANNEL_PREF, email: false },
    allDisabled: updates.allDisabled || false,
    createdAt: nowIso(),
  };
  notifPrefs.push(doc);
  persist();
  return clone(doc);
}
