/**
 * Communications module — demo store implementation.
 */
import { notifications, messages, pushSubscriptions as pushSubs, notificationPreferences as notifPrefs, reminderBatches as remindBatches, digestPrefs as digPrefs, digests as digArr, users, schools, nid, clone, nowIso, persist } from "@/modules/shared/store-state";

export async function createNotification({ schoolId, kind, to, subject, preview, body, amount }) {
  const notification = { id: nid("not"), schoolId, kind: kind || "info", to: Array.isArray(to) ? to : [], subject, preview, body: body || "", amount: Number.isFinite(Number(amount)) ? Number(amount) : undefined, readBy: [], createdAt: nowIso() };
  notifications.push(notification); persist(); return clone(notification);
}

export async function listNotifications(schoolId, userId, options = {}) {
  return notifications.filter((n) => n.schoolId === schoolId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((n) => { const read = n.readBy?.includes(userId) || n.readBy?.includes("*") || n.read === true; return { ...clone(n), read }; });
}

export async function markNotificationsRead(schoolId, userId, ids) { for (const n of notifications) { if (n.schoolId === schoolId && ids.includes(n.id)) { if (!n.readBy) n.readBy = []; if (!n.readBy.includes(userId)) n.readBy.push(userId); } } persist(); }

export async function deleteNotifications(schoolId, ids) { for (const n of notifications) { if (n.schoolId === schoolId && ids.includes(n.id)) n.adminDeletedAt = nowIso(); } persist(); }

export async function markNotificationsReconciled(schoolId, ids) { for (const n of notifications) { if (n.schoolId === schoolId && ids.includes(n.id)) n.reconciledAt = nowIso(); } persist(); }

export async function getReminderBatchByKey(schoolId, kind, key) { return clone(remindBatches.find((b) => b.schoolId === schoolId && b.kind === kind && b.key === key) || null); }

export async function saveReminderBatch({ schoolId, kind, key, context, studentIds, result }) {
  let batch = remindBatches.find((b) => b.schoolId === schoolId && b.kind === kind && b.key === key);
  if (!batch) { batch = { id: nid("rmb"), schoolId, kind, key, createdAt: nowIso() }; remindBatches.push(batch); }
  batch.context = context || batch.context; batch.studentIds = studentIds || batch.studentIds; batch.result = result || batch.result; persist(); return clone(batch);
}

export async function sendMessage({ schoolId, from, to, studentId, subject, body, type, replyTo, attachments }) {
  const msg = { id: nid("msg"), schoolId, from, to, studentId: studentId || null, subject: subject || "", body, type: type || "direct", replyTo: replyTo || null, attachments: attachments || [], read: false, readAt: null, createdAt: nowIso(), updatedAt: nowIso() };
  messages.push(msg); persist(); return clone(msg);
}

export async function getConversation(schoolId, userId1, userId2, { limit = 50, before } = {}) {
  return messages.filter((m) => { if (m.schoolId !== schoolId) return false; const isBetween = (m.from === userId1 && m.to === userId2) || (m.from === userId2 && m.to === userId1); if (!isBetween) return false; if (before && new Date(m.createdAt) >= new Date(before)) return false; return true; }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(-limit).map(clone);
}

export async function listConversations(schoolId, userId) {
  const convos = {};
  for (const m of messages) { if (m.schoolId !== schoolId) continue; const isMine = m.from === userId || m.to === userId; if (!isMine) continue; const partnerId = m.from === userId ? m.to : m.from; if (!convos[partnerId] || new Date(m.createdAt) > new Date(convos[partnerId].lastDate)) convos[partnerId] = { partnerId, lastMessage: m.body, lastDate: m.createdAt, unread: 0 }; if (m.to === userId && !m.read) convos[partnerId].unread = (convos[partnerId].unread || 0) + 1; }
  const result = Object.values(convos).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
  for (const c of result) { const user = users.find((u) => u.id === c.partnerId); if (user) { c.partnerName = user.name; c.partnerRole = user.role; c.partnerClass = user.assignedClass; } }
  return result;
}

export async function markMessageRead(messageId) { const msg = messages.find((m) => m.id === messageId); if (msg) { msg.read = true; msg.readAt = nowIso(); persist(); } }

export async function markConversationRead(schoolId, userId, partnerId) { for (const m of messages) { if (m.schoolId === schoolId && m.from === partnerId && m.to === userId && !m.read) { m.read = true; m.readAt = nowIso(); } } persist(); }

export async function getUnreadMessageCount(schoolId, userId) { return messages.filter((m) => m.schoolId === schoolId && m.to === userId && !m.read).length; }

export async function getNotificationPreferences(schoolId, userId) {
  const existing = notifPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (existing) return clone(existing);
  return { id: null, schoolId, userId, feeReminder: { inApp: true, email: true, sms: false, whatsapp: false, push: true }, reportCard: { inApp: true, email: true, sms: true, whatsapp: false, push: true }, announcement: { inApp: true, email: true, sms: false, whatsapp: false, push: true }, classResource: { inApp: true, email: false, sms: false, whatsapp: false, push: true }, paymentConfirmation: { inApp: true, email: true, sms: true, whatsapp: false, push: true }, readAhead: { inApp: true, email: false, sms: false, whatsapp: false, push: true }, message: { inApp: true, email: false, sms: false, whatsapp: false, push: true }, allDisabled: false };
}

export async function getEnabledChannels(schoolId, userId, notificationType) {
  const prefs = await getNotificationPreferences(schoolId, userId);
  if (prefs.allDisabled) return ["in_app"];
  const DEFAULT_CHANNEL_PREF = { inApp: true, email: true, sms: false, whatsapp: false, push: true };
  const typePrefs = prefs[notificationType] || prefs.announcement || DEFAULT_CHANNEL_PREF;
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
    existing.keys = keys; existing.userAgent = userAgent || existing.userAgent;
    existing.active = true; existing.lastUsedAt = nowIso(); existing.updatedAt = nowIso();
    persist(); return clone(existing);
  }
  const sub = { id: nid("push"), schoolId, userId, endpoint, keys, userAgent: userAgent || "", active: true, lastUsedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso() };
  pushSubs.push(sub); persist(); return clone(sub);
}

export async function listPushSubscriptions(schoolId, userIds) {
  return pushSubs.filter((s) => {
    if (s.schoolId !== schoolId || !s.active) return false;
    if (userIds && userIds.length && !userIds.includes(s.userId)) return false;
    return true;
  }).map(clone);
}

export async function removePushSubscriptions(ids) {
  for (const id of ids) { const sub = pushSubs.find((s) => s.id === id); if (sub) sub.active = false; }
  persist();
}

export async function deletePushSubscription(endpoint) {
  const idx = pushSubs.findIndex((s) => s.endpoint === endpoint);
  if (idx === -1) return false;
  pushSubs.splice(idx, 1); persist(); return true;
}

// ── Digests ─────────────────────────────────────────────────────────

export async function getDigestPref(schoolId, userId) {
  const pref = digPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (pref) return clone(pref);
  return { schoolId, userId, frequency: "off", lastSentAt: null };
}

export async function setDigestPref(schoolId, userId, frequency) {
  const freq = ["off", "daily", "weekly"].includes(frequency) ? frequency : "off";
  let pref = digPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (!pref) { pref = { id: nid("dgp"), schoolId, userId, frequency: "off", lastSentAt: null, createdAt: nowIso() }; digPrefs.push(pref); }
  pref.frequency = freq; persist(); return clone(pref);
}

export async function sendDigest({ schoolId, userId, frequency, subject, preview, body, itemCount }) {
  const digest = { id: nid("dgs"), schoolId, userId, frequency: frequency === "weekly" ? "weekly" : "daily", subject, preview, body: body || "", itemCount: Number(itemCount) || 0, createdAt: nowIso() };
  digArr.push(digest);
  let pref = digPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (!pref) { pref = { id: nid("dgp"), schoolId, userId, frequency: "off", lastSentAt: null, createdAt: nowIso() }; digPrefs.push(pref); }
  pref.lastSentAt = digest.createdAt; persist(); return clone(digest);
}

export async function listDigests(schoolId, userId, { limit = 20 } = {}) {
  return digArr.filter((d) => d.schoolId === schoolId && d.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || Number(b.id.replace(/\D/g, "")) - Number(a.id.replace(/\D/g, "")))
    .slice(0, limit).map(clone);
}

export async function updateNotificationPreferences(schoolId, userId, updates) {
  const existing = notifPrefs.find((p) => p.schoolId === schoolId && 
