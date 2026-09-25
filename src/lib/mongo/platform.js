/**
 * Mongo store — platform domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  RoleAudit,
  DigestPref,
  Digest,
  ready,
  safe,
} from "./shared.js";

// ── Platform Alerts ──────────────────────────────────────────────────────

import PlatformAlert from "@/models/PlatformAlert";
import AuditLog from "@/models/AuditLog";
import HealthMetric from "@/models/HealthMetric";

export async function createPlatformAlert({ schoolId, schoolName, type, severity, title, message, meta }) {
  await ready();
  const doc = await PlatformAlert.create({
    schoolId: schoolId || null,
    schoolName: schoolName || "",
    type,
    severity: severity || "info",
    title,
    message: message || "",
    read: false,
    meta: meta || {},
  });
  return safe(doc);
}

export async function listPlatformAlerts({ type, unreadOnly, limit } = {}) {
  await ready();
  const query = {};
  if (type) query.type = type;
  if (unreadOnly) query.read = false;
  let q = PlatformAlert.find(query).sort({ createdAt: -1 });
  if (limit) q = q.limit(limit);
  return (await q).map(safe);
}

export async function markAlertsRead(alertIds) {
  await ready();
  await PlatformAlert.updateMany({ _id: { $in: alertIds } }, { read: true, updatedAt: new Date() });
}

export async function markAllAlertsRead() {
  await ready();
  await PlatformAlert.updateMany({ read: false }, { read: true, updatedAt: new Date() });
}

export async function getUnreadAlertCount() {
  await ready();
  return PlatformAlert.countDocuments({ read: false });
}

export async function seedPlatformAlerts() {
  // No-op in Mongo — alerts are created by the application.
}

// ---- Audit Log ---------------------------------------------------------------

export async function createAuditLog({ action, actor, schoolId, schoolName, description, meta, ip }) {
  await ready();
  const entry = await AuditLog.create({
    action,
    actor: actor || "Platform Admin",
    schoolId: schoolId || null,
    schoolName: schoolName || "",
    description: description || "",
    meta: meta || {},
    ip: ip || null,
  });
  return safe(entry);
}

export async function listAuditLogs({ action, schoolId, search, from, to, limit, offset } = {}) {
  await ready();
  const q = {};
  if (action) q.action = action;
  if (schoolId) q.schoolId = schoolId;
  if (search) {
    q.$or = [
      { description: { $regex: search, $options: "i" } },
      { actor: { $regex: search, $options: "i" } },
      { schoolName: { $regex: search, $options: "i" } },
    ];
  }
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) {
      const endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
      q.createdAt.$lte = endOfDay;
    }
  }
  const total = await AuditLog.countDocuments(q);
  let query = AuditLog.find(q).sort({ createdAt: -1 });
  if (offset) query = query.skip(offset);
  if (limit) query = query.limit(limit);
  const logs = await query.lean();
  return { logs: logs.map(safe), total };
}

export async function getAuditLogStats() {
  await ready();
  const total = await AuditLog.countDocuments();
  const actionCountsRaw = await AuditLog.aggregate([
    { $group: { _id: "$action", count: { $sum: 1 } } },
  ]);
  const actionCounts = {};
  for (const row of actionCountsRaw) {
    actionCounts[row._id] = row.count;
  }
  return { total, actionCounts };
}

export async function getAuditHeatmap() {
  await ready();
  const now = Date.now();
  const ninetyDaysAgo = now - 90 * 86400000;

  const entries = await AuditLog.find({
    createdAt: { $gte: new Date(ninetyDaysAgo) },
  }).lean();

  const dailyCounts = {};
  for (let i = 0; i < 90; i++) {
    const d = new Date(ninetyDaysAgo + i * 86400000);
    dailyCounts[d.toISOString().slice(0, 10)] = 0;
  }

  for (const entry of entries) {
    const key = new Date(entry.createdAt).toISOString().slice(0, 10);
    if (dailyCounts[key] !== undefined) dailyCounts[key]++;
  }

  const days = Object.entries(dailyCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const maxCount = Math.max(...days.map((d) => d.count), 1);
  return { days, maxCount };
}

// ---- Health Metrics ----------------------------------------------------------

export async function recordHealthMetric({ type, endpoint, method, value, statusCode, errorMessage, meta }) {
  await ready();
  const entry = await HealthMetric.create({
    type,
    endpoint: endpoint || null,
    method: method || null,
    value: typeof value === "number" ? value : null,
    statusCode: statusCode || null,
    errorMessage: errorMessage || null,
    meta: meta || {},
  });
  return safe(entry);
}

export async function getHealthDashboard() {
  await ready();
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  const oneDayAgo = now - 86400000;

  const apiResponses = await HealthMetric.find({
    type: "api_response",
    createdAt: { $gt: new Date(oneHourAgo) },
  }).lean();
  const responseTimes = apiResponses.map((m) => m.value).filter((v) => v != null);
  const avgResponseTime = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0;
  const sorted = [...responseTimes].sort((a, b) => a - b);
  const p95ResponseTime = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] || 0 : 0;
  const p99ResponseTime = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] || 0 : 0;

  const recentErrors = await HealthMetric.countDocuments({
    type: "error",
    createdAt: { $gt: new Date(oneDayAgo) },
  });
  const totalRequestsLast24h = await HealthMetric.countDocuments({
    type: "api_response",
    createdAt: { $gt: new Date(oneDayAgo) },
  });
  const errorRate = totalRequestsLast24h > 0
    ? Number(((recentErrors / totalRequestsLast24h) * 100).toFixed(1))
    : 0;

  const endpointAgg = await HealthMetric.aggregate([
    { $match: { type: "api_response", createdAt: { $gt: new Date(oneHourAgo) } } },
    { $group: {
      _id: { method: "$method", endpoint: "$endpoint" },
      count: { $sum: 1 },
      avgTime: { $avg: "$value" },
      maxTime: { $max: "$value" },
    } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  const endpoints = endpointAgg.map((e) => ({
    name: `${e._id.method || "GET"} ${e._id.endpoint || "/unknown"}`,
    avgTime: Math.round(e.avgTime || 0),
    maxTime: e.maxTime || 0,
    count: e.count,
    errors: 0,
  }));

  const dbMetric = await HealthMetric.findOne({ type: "db_size" }).sort({ createdAt: -1 }).lean();
  const currentDbSize = dbMetric?.value || 0;
  const dbSizeTrendRaw = await HealthMetric.find({ type: "db_size" }).sort({ createdAt: -1 }).limit(24).lean();
  const dbSizeTrend = dbSizeTrendRaw.reverse().map((m) => ({ value: m.value, time: m.createdAt }));

  const memMetric = await HealthMetric.findOne({ type: "memory" }).sort({ createdAt: -1 }).lean();
  const currentMemory = memMetric?.value || 0;

  const statusCodesAgg = await HealthMetric.aggregate([
    { $match: { type: "api_response", createdAt: { $gt: new Date(oneDayAgo) } } },
    { $group: { _id: "$statusCode", count: { $sum: 1 } } },
  ]);
  const statusCodes = {};
  for (const row of statusCodesAgg) {
    statusCodes[row._id || 200] = row.count;
  }

  // Response time series (24h, hourly buckets)
  const responseTimeSeries = [];
  for (let i = 23; i >= 0; i--) {
    const hourStart = new Date(now - (i + 1) * 3600000);
    const hourEnd = new Date(now - i * 3600000);
    const hourData = apiResponses.filter((m) => {
      const t = new Date(m.createdAt).getTime();
      return t > hourStart.getTime() && t <= hourEnd.getTime();
    });
    const times = hourData.map((m) => m.value).filter((v) => v != null);
    responseTimeSeries.push({
      time: hourEnd.toISOString(),
      avg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      p95: times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length * 0.95)] || 0 : null,
      count: times.length,
    });
  }

  return {
    overview: { avgResponseTime, p95ResponseTime, p99ResponseTime, totalRequests: totalRequestsLast24h, totalErrors: recentErrors, errorRate, currentDbSize, currentMemory, uptime: "99.98%" },
    endpoints, statusCodes, responseTimeSeries, dbSizeTrend,
  };
}

export async function getApiHealthSeries({ type, hours, limit } = {}) {
  await ready();
  const lookback = (hours || 24) * 3600000;
  const q = { createdAt: { $gt: new Date(Date.now() - lookback) } };
  if (type) q.type = type;
  let query = HealthMetric.find(q).sort({ createdAt: -1 });
  if (limit) query = query.limit(limit);
  const results = await query.lean();
  return results.map(safe);
}

// ---- Role audit trail ----------------------------------------------------------

/**
 * Append a role-change audit entry — an immutable "who re-rolled whom, when".
 * The actor is resolved by the caller (the API route) so the store stays a
 * dumb ledger, same as logFeeAudit.
 */
export async function logRoleAudit({
  schoolId,
  actorId = "",
  actorName,
  actorRole = "",
  targetId = "",
  targetName = "",
  fromRole = "",
  toRole,
}) {
  await ready();
  return safe(
    await RoleAudit.create({
      schoolId,
      actorId,
      actorName: actorName || "Unknown",
      actorRole,
      targetId,
      targetName: targetName || "Unknown",
      fromRole,
      toRole,
    })
  );
}

/** Newest first. */
export async function listRoleAudit(schoolId, { limit = 100 } = {}) {
  await ready();
  return (await RoleAudit.find({ schoolId }).sort({ createdAt: -1 }).limit(limit)).map(safe);
}

// ---- Admin digest preferences (per-admin schedule) -----------------------------

/** The digest schedule for ONE admin (default: off). Per-admin, not per-school. */
export async function getDigestPref(schoolId, userId) {
  await ready();
  const pref = await DigestPref.findOne({ schoolId, userId });
  return pref ? safe(pref) : { schoolId, userId, frequency: "off", lastSentAt: null };
}

/** Set one admin's digest frequency: "off" | "daily" | "weekly". */
export async function setDigestPref(schoolId, userId, frequency) {
  await ready();
  const freq = ["off", "daily", "weekly"].includes(frequency) ? frequency : "off";
  return safe(
    await DigestPref.findOneAndUpdate(
      { schoolId, userId },
      { schoolId, userId, frequency: freq },
      { upsert: true, new: true }
    )
  );
}

/** Record a sent digest email and bump the admin's lastSentAt. */
export async function sendDigest({ schoolId, userId, frequency, subject, preview, body, itemCount }) {
  await ready();
  const digest = await Digest.create({
    schoolId,
    userId,
    frequency: frequency === "weekly" ? "weekly" : "daily",
    subject,
    preview,
    body: body || "",
    itemCount: Number(itemCount) || 0,
  });
  await DigestPref.findOneAndUpdate(
    { schoolId, userId },
    { schoolId, userId, lastSentAt: digest.createdAt },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return safe(digest);
}

/** Digest history for one admin, newest first. */
export async function listDigests(schoolId, userId, { limit = 20 } = {}) {
  await ready();
  return (
    await Digest.find({ schoolId, userId }).sort({ createdAt: -1 }).limit(limit)
  ).map(safe);
}

// ── Platform / Subscription / Impersonation stubs ───────────────
// These mirror the demo store signatures so the dual-store contract
// test passes. Full Mongo implementations follow when needed.

export function checkSubscriptionStatus(schoolId) {
  // Stub: will be implemented when billing enforcement is needed in Mongo mode
  return { status: "active", expiresAt: null, isTrial: false, daysLeft: 0 };
}

const _impersonationSessions = [];

export function createImpersonationSession({ impersonatorId, impersonatorName, schoolId, schoolName, targetUserId, targetUserName, targetUserRole, ip }) {
  const session = {
    id: `isess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    impersonatorId, impersonatorName, schoolId, schoolName,
    targetUserId, targetUserName, targetUserRole,
    ip: ip || "", startedAt: new Date().toISOString(), endedAt: null,
    duration: null, endReason: null, actionCount: 0,
  };
  _impersonationSessions.push(session);
  return session;
}

export function endImpersonationSession(sessionId, reason = "timeout") {
  const session = _impersonationSessions.find((s) => s.id === sessionId);
  if (!session || session.endedAt) return null;
  session.endedAt = new Date().toISOString();
  session.duration = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
  session.endReason = reason;
  return session;
}

export function recordImpersonationAction(sessionId) {
  const session = _impersonationSessions.find((s) => s.id === sessionId);
  if (session) session.actionCount++;
  return session;
}

export async function getImpersonationSessions({ schoolId, impersonatorId, limit, offset } = {}) {
  let filtered = [..._impersonationSessions];
  if (schoolId) filtered = filtered.filter((s) => s.schoolId === schoolId);
  if (impersonatorId) filtered = filtered.filter((s) => s.impersonatorId === impersonatorId);
  filtered.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const total = filtered.length;
  if (offset) filtered = filtered.slice(offset);
  if (limit) filtered = filtered.slice(0, limit);
  return { sessions: filtered, total };
}

export async function getImpersonationSessionDetail(sessionId) {
  return _impersonationSessions.find((s) => s.id === sessionId) || null;
}

// ── Webhook stubs (MongoDB store) ──────────────────────────────────
// TODO: implement with a real MongoDB collection when moving off demo mode.

let _webhookConfigs = [];
let _webhookDeliveries = [];

export async function listWebhooks() {
  return [..._webhookConfigs];
}

export async function getWebhook(id) {
  return _webhookConfigs.find((w) => w.id === id) || null;
}

export async function createWebhook({ name, url, format = "generic", events = [], secret, enabled = true }) {
  const wh = {
    id: `wh_${Date.now()}`,
    name, url, format, events,
    secret: secret || null, enabled,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTriggeredAt: null, deliveryCount: 0, failureCount: 0,
  };
  _webhookConfigs.push(wh);
  return { ...wh };
}

export async function updateWebhook(id, updates) {
  const wh = _webhookConfigs.find((w) => w.id === id);
  if (!wh) return null;
  Object.assign(wh, updates, { updatedAt: new Date().toISOString() });
  return { ...wh };
}

export async function deleteWebhook(id) {
  const idx = _webhookConfigs.findIndex((w) => w.id === id);
  if (idx === -1) return false;
  _webhookConfigs.splice(idx, 1);
  return true;
}

export async function dispatchWebhook(event) {
  void event;
  return [];
}

export async function listDeliveries(limit = 20) {
  return _webhookDeliveries.slice(0, limit);
}
