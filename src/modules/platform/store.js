/**
 * Platform module — demo store implementation.
 *
 * Functions: createPlatformAlert, listPlatformAlerts, markAlertsRead,
 *            getUnreadAlertCount, seedPlatformAlerts,
 *            createAuditLog, listAuditLogs, getAuditLogStats,
 *            createImpersonationSession, endImpersonationSession,
 *            getImpersonationSessions, getImpersonationSessionDetail,
 *            recordHealthMetric, getHealthDashboard, getApiHealthSeries
 */
import {
  schools,
  platformAlerts,
  auditLogs,
  impersonationSessions,
  healthMetrics,
  nid,
  clone,
  nowIso,
  persist,
} from "@/modules/shared/store-state";

/**
 * Create a platform-level alert.
 */
export async function createPlatformAlert({ schoolId, schoolName, type, severity, title, message, meta }) {
  const alert = {
    id: nid("alert"),
    schoolId: schoolId || null,
    schoolName: schoolName || "",
    type,
    severity: severity || "info",
    title,
    message: message || "",
    read: false,
    meta: meta || {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  platformAlerts.push(alert);
  persist();

  // Fire-and-forget webhook dispatch (don't block the caller)
  try {
    const { dispatchWebhook } = await import("@/modules/platform/webhooks");
    dispatchWebhook({
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      schoolId: alert.schoolId,
      schoolName: alert.schoolName,
      meta: alert.meta,
      createdAt: alert.createdAt,
    }).catch(() => {}); // swallow errors
  } catch {
    // Webhook module may not be available
  }

  return clone(alert);
}

/**
 * List platform alerts, newest first.
 * @param {Object} opts
 * @param {string} [opts.type] — filter by type
 * @param {boolean} [opts.unreadOnly] — only unread alerts
 * @param {number} [opts.limit] — max results
 */
export async function listPlatformAlerts({ type, unreadOnly, limit } = {}) {
  let filtered = [...platformAlerts];
  if (type) filtered = filtered.filter((a) => a.type === type);
  if (unreadOnly) filtered = filtered.filter((a) => !a.read);
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (limit) filtered = filtered.slice(0, limit);
  return filtered.map(clone);
}

/**
 * Mark alerts as read by ID.
 */
export async function markAlertsRead(alertIds) {
  const idSet = new Set(alertIds);
  for (const alert of platformAlerts) {
    if (idSet.has(alert.id)) {
      alert.read = true;
      alert.updatedAt = nowIso();
    }
  }
  persist();
}

/**
 * Mark ALL alerts as read.
 */
export async function markAllAlertsRead() {
  for (const alert of platformAlerts) {
    alert.read = true;
    alert.updatedAt = nowIso();
  }
  persist();
}

/**
 * Get unread alert count.
 */
export async function getUnreadAlertCount() {
  return platformAlerts.filter((a) => !a.read).length;
}

/**
 * Seed initial demo alerts to make the platform feel alive.
 */
export async function seedPlatformAlerts() {
  if (platformAlerts.length > 0) return; // already seeded

  const greenfield = schools.find((s) => s.name === "Greenfield International School");

  const demoAlerts = [
    {
      type: "school_signup",
      severity: "success",
      title: "New school registered",
      message: "Greenfield International School joined EduTrack.",
      schoolId: greenfield?.id || "",
      schoolName: "Greenfield International School",
      meta: { plan: "standard", students: 16 },
    },
    {
      type: "subscription_activated",
      severity: "success",
      title: "Subscription activated",
      message: "Greenfield International School upgraded to Standard plan.",
      schoolId: greenfield?.id || "",
      schoolName: "Greenfield International School",
      meta: { plan: "standard", cycle: "annual" },
    },
    {
      type: "system",
      severity: "info",
      title: "Platform deployed",
      message: "EduTrack v1.0 platform infrastructure is live and operational.",
      meta: {},
    },
  ];

  for (const alert of demoAlerts) {
    await createPlatformAlert(alert);
  }
}

// ── Audit Log ─────────────────────────────────────────────────────

/**
 * Create an audit log entry.
 * @param {Object} opts
 * @param {string} opts.action — e.g. "impersonate", "plan_change", "subscription_cancel"
 * @param {string} opts.actor — who performed the action
 * @param {string} [opts.schoolId] — affected school
 * @param {string} [opts.schoolName]
 * @param {string} [opts.description] — human-readable description
 * @param {Object} [opts.meta] — extra data (old/new values, etc.)
 * @param {string} [opts.ip] — IP address of the actor
 */
export async function createAuditLog({ action, actor, schoolId, schoolName, description, meta, ip }) {
  const entry = {
    id: nid("audit"),
    action,
    actor: actor || "Platform Admin",
    schoolId: schoolId || null,
    schoolName: schoolName || "",
    description: description || "",
    meta: meta || {},
    ip: ip || null,
    createdAt: nowIso(),
  };
  auditLogs.push(entry);
  persist();
  return clone(entry);
}

/**
 * List audit logs, newest first.
 * @param {Object} opts
 * @param {string} [opts.action] — filter by action type
 * @param {string} [opts.schoolId] — filter by school
 * @param {string} [opts.search] — search in description/actor
 * @param {number} [opts.limit] — max results
 * @param {number} [opts.offset] — pagination offset
 */
export async function listAuditLogs({ action, schoolId, search, from, to, limit, offset } = {}) {
  let filtered = [...auditLogs];
  if (action) filtered = filtered.filter((e) => e.action === action);
  if (schoolId) filtered = filtered.filter((e) => e.schoolId === schoolId);
  if (from) {
    const fromDate = new Date(from);
    filtered = filtered.filter((e) => new Date(e.createdAt) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    filtered = filtered.filter((e) => new Date(e.createdAt) <= toDate);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        (e.schoolName && e.schoolName.toLowerCase().includes(q))
    );
  }
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = filtered.length;
  if (offset) filtered = filtered.slice(offset);
  if (limit) filtered = filtered.slice(0, limit);
  return { logs: filtered.map(clone), total };
}

/**
 * Get audit log statistics — counts by action type.
 */
export async function getAuditLogStats() {
  const actionCounts = {};
  for (const entry of auditLogs) {
    actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
  }
  return {
    total: auditLogs.length,
    actionCounts,
  };
}

// ── Impersonation Sessions ────────────────────────────────────────

/**
 * Create a new impersonation session when a platform admin starts impersonating.
 * @returns {string} The session ID to pass to endImpersonationSession later.
 */
export function createImpersonationSession({ impersonatorId, impersonatorName, schoolId, schoolName, targetUserId, targetUserName, targetUserRole, ip }) {
  const session = {
    id: nid("imp"),
    impersonatorId: impersonatorId || null,
    impersonatorName: impersonatorName || "Platform Admin",
    schoolId: schoolId || null,
    schoolName: schoolName || "",
    targetUserId: targetUserId || null,
    targetUserName: targetUserName || "",
    targetUserRole: targetUserRole || "",
    ip: ip || null,
    status: "active",
    startedAt: nowIso(),
    endedAt: null,
    endedReason: null,
    durationMs: null,
    actionCount: 0,
  };
  impersonationSessions.push(session);
  persist();
  return session.id;
}

/**
 * End an impersonation session when it expires or is manually ended.
 * @param {string} sessionId
 * @param {string} reason - "timeout", "manual", or "logout"
 */
export function endImpersonationSession(sessionId, reason = "timeout") {
  const session = impersonationSessions.find((s) => s.id === sessionId);
  if (!session || session.status === "ended") return;
  const endedAt = new Date();
  session.status = "ended";
  session.endedAt = endedAt.toISOString();
  session.endedReason = reason;
  session.durationMs = endedAt.getTime() - new Date(session.startedAt).getTime();
  persist();
  return clone(session);
}

/**
 * Increment action count for an impersonation session.
 */
export function recordImpersonationAction(sessionId) {
  const session = impersonationSessions.find((s) => s.id === sessionId && s.status === "active");
  if (session) {
    session.actionCount = (session.actionCount || 0) + 1;
    persist();
  }
}

/**
 * Get impersonation sessions with optional filters.
 */
export async function getImpersonationSessions({ schoolId, impersonatorId, limit, offset } = {}) {
  let filtered = [...impersonationSessions];
  if (schoolId) filtered = filtered.filter((s) => s.schoolId === schoolId);
  if (impersonatorId) filtered = filtered.filter((s) => s.impersonatorId === impersonatorId);
  filtered.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const total = filtered.length;
  if (offset) filtered = filtered.slice(offset);
  if (limit) filtered = filtered.slice(0, limit);
  return { sessions: filtered.map(clone), total };
}

/**
 * Get detailed impersonation session info with related audit log entries.
 */
export async function getImpersonationSessionDetail(sessionId) {
  const session = impersonationSessions.find((s) => s.id === sessionId);
  if (!session) return null;

  // Get all audit log entries that happened during this impersonation session
  const startTime = new Date(session.startedAt).getTime();
  const endTime = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();

  const relatedLogs = auditLogs.filter((log) => {
    const logTime = new Date(log.createdAt).getTime();
    const isWithinSession = logTime >= startTime && logTime <= endTime;
    const isTargetUser = log.actor === session.targetUserName;
    const isImpersonatorAction = log.meta?.impersonatorId === session.impersonatorId;
    return isWithinSession && (isTargetUser || isImpersonatorAction || (log.schoolId === session.schoolId && log.action !== 'impersonate'));
  }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    ...clone(session),
    durationFormatted: formatDuration(session.durationMs || (Date.now() - startTime)),
    relatedLogs: relatedLogs.map(clone),
  };
}

/** Format milliseconds to human readable duration */
function formatDuration(ms) {
  if (!ms || ms < 0) return 'In progress';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ── Health Metrics ─────────────────────────────────────────────────

/**
 * Record a health metric data point.
 * @param {Object} opts
 * @param {string} opts.type — "api_response", "error", "db_size", "memory", "cpu"
 * @param {string} [opts.endpoint] — API endpoint path
 * @param {string} [opts.method] — HTTP method
 * @param {number} [opts.value] — metric value (ms for response time, bytes for DB size, % for CPU)
 * @param {number} [opts.statusCode] — HTTP status code
 * @param {string} [opts.errorMessage] — error details if applicable
 * @param {Object} [opts.meta] — extra context
 */
export async function recordHealthMetric({ type, endpoint, method, value, statusCode, errorMessage, meta }) {
  const entry = {
    id: nid("health"),
    type,
    endpoint: endpoint || null,
    method: method || null,
    value: typeof value === "number" ? value : null,
    statusCode: statusCode || null,
    errorMessage: errorMessage || null,
    meta: meta || {},
    createdAt: nowIso(),
  };
  healthMetrics.push(entry);
  persist();
  return clone(entry);
}

/**
 * Get aggregated health dashboard data.
 * Returns: response time stats, error rates, endpoint breakdown, DB size.
 */
export async function getHealthDashboard() {
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  const oneDayAgo = now - 86400000;

  // Response time metrics (last hour)
  const apiResponses = healthMetrics.filter(
    (m) => m.type === "api_response" && new Date(m.createdAt).getTime() > oneHourAgo
  );
  const responseTimes = apiResponses.map((m) => m.value).filter((v) => v != null);
  const avgResponseTime = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0;
  const p95ResponseTime = responseTimes.length
    ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)] || 0
    : 0;
  const p99ResponseTime = responseTimes.length
    ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.99)] || 0
    : 0;

  // Error metrics (last 24h)
  const recentErrors = healthMetrics.filter(
    (m) => m.type === "error" && new Date(m.createdAt).getTime() > oneDayAgo
  );
  const totalRequestsLast24h = healthMetrics.filter(
    (m) => m.type === "api_response" && new Date(m.createdAt).getTime() > oneDayAgo
  ).length;
  const errorRate = totalRequestsLast24h > 0
    ? Number(((recentErrors.length / totalRequestsLast24h) * 100).toFixed(1))
    : 0;

  // Endpoint breakdown (top 10 by request count, last 24h)
  const endpointMap = {};
  for (const m of apiResponses) {
    const key = `${m.method || "GET"} ${m.endpoint || "/unknown"}`;
    if (!endpointMap[key]) endpointMap[key] = { count: 0, totalTime: 0, errors: 0, maxTime: 0 };
    endpointMap[key].count++;
    endpointMap[key].totalTime += m.value || 0;
    endpointMap[key].maxTime = Math.max(endpointMap[key].maxTime, m.value || 0);
  }
  // Count errors per endpoint from the 24h window
  const errorsAll = healthMetrics.filter(
    (m) => m.type === "error" && new Date(m.createdAt).getTime() > oneDayAgo
  );
  for (const m of errorsAll) {
    const key = `${m.method || "GET"} ${m.endpoint || "/unknown"}`;
    if (endpointMap[key]) endpointMap[key].errors++;
  }
  const endpoints = Object.entries(endpointMap)
    .map(([name, data]) => ({
      name,
      avgTime: data.count ? Math.round(data.totalTime / data.count) : 0,
      maxTime: data.maxTime,
      count: data.count,
      errors: data.errors,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // DB size (latest)
  const dbMetrics = healthMetrics
    .filter((m) => m.type === "db_size")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const currentDbSize = dbMetrics.length > 0 ? dbMetrics[0].value : 0;
  const dbSizeTrend = dbMetrics.slice(0, 24).reverse().map((m) => ({
    value: m.value,
    time: m.createdAt,
  }));

  // Memory & CPU (latest)
  const memoryMetrics = healthMetrics
    .filter((m) => m.type === "memory")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const currentMemory = memoryMetrics.length > 0 ? memoryMetrics[0].value : 0;

  // Status code distribution (last 24h)
  const statusCodes = {};
  for (const m of apiResponses) {
    const code = m.statusCode || 200;
    statusCodes[code] = (statusCodes[code] || 0) + 1;
  }

  // Response time series (last 24h, bucketed by hour)
  const responseTimeSeries = [];
  for (let i = 23; i >= 0; i--) {
    const hourStart = now - (i + 1) * 3600000;
    const hourEnd = now - i * 3600000;
    const hourData = apiResponses.filter((m) => {
      const t = new Date(m.createdAt).getTime();
      return t > hourStart && t <= hourEnd;
    });
    const times = hourData.map((m) => m.value).filter((v) => v != null);
    responseTimeSeries.push({
      time: new Date(hourEnd).toISOString(),
      avg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      p95: times.length ? times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)] || 0 : null,
      count: times.length,
    });
  }

  return {
    overview: {
      avgResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      totalRequests: totalRequestsLast24h,
      totalErrors: recentErrors.length,
      errorRate,
      currentDbSize,
      currentMemory,
      uptime: "99.98%",
    },
    endpoints,
    statusCodes,
    responseTimeSeries,
    dbSizeTrend,
  };
}

// ── Audit Heatmap ──────────────────────────────────────────────

/**
 * Get daily action counts for the audit heatmap (last 90 days).
 * Returns an array of { date, count } objects and a maxCount for scaling.
 */
export async function getAuditHeatmap() {
  const now = Date.now();
  const ninetyDaysAgo = now - 90 * 86400000;
  const dailyCounts = {};

  // Initialize all 90 days with zero
  for (let i = 0; i < 90; i++) {
    const d = new Date(ninetyDaysAgo + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    dailyCounts[key] = 0;
  }

  // Count audit entries per day
  for (const entry of auditLogs) {
    const ts = new Date(entry.createdAt).getTime();
    if (ts < ninetyDaysAgo) continue;
    const key = new Date(ts).toISOString().slice(0, 10);
    if (dailyCounts[key] !== undefined) dailyCounts[key]++;
  }

  const days = Object.entries(dailyCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  return { days, maxCount };
}

/**
 * Get raw health metrics for charting.
 * @param {Object} opts
 * @param {string} opts.type — metric type filter
 * @param {number} [opts.hours] — lookback window in hours (default 24)
 * @param {number} [opts.limit] — max entries
 */
export async function getApiHealthSeries({ type, hours, limit } = {}) {
  const lookback = (hours || 24) * 3600000;
  const cutoff = Date.now() - lookback;
  let filtered = healthMetrics.filter((m) => new Date(m.createdAt).getTime() > cutoff);
  if (type) filtered = filtered.filter((m) => m.type === type);
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (limit) filtered = filtered.slice(0, limit);
  return filtered.map(clone);
}
