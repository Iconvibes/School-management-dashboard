/**
 * Compliance module — GDPR erasure requests, data access audit, consent tracking.
 *
 * These functions support GDPR Articles 5, 6, 15, 17, 30 and NDPR compliance.
 */
import {
  erasureRequests,
  dataAccessLog,
  users,
  schools,
  scores,
  attendance,
  feePayments,
  feeCarryovers,
  timetable,
  nid,
  clone,
  nowIso,
  persist,
} from "@/modules/shared/store-state";

// ── Erasure Requests (GDPR Art. 17) ────────────────────────────────

/**
 * Create a new data erasure request. The request must be approved by a
 * school admin before the actual deletion occurs.
 */
export async function createErasureRequest({ schoolId, userId, userName, reason }) {
  const request = {
    id: nid("erm"),
    schoolId,
    userId,
    userName: userName || "Unknown",
    reason: reason || "",
    status: "PENDING", // PENDING → APPROVED → EXECUTED | REJECTED
    requestedAt: nowIso(),
    reviewedAt: null,
    reviewedBy: null,
    executedAt: null,
  };
  erasureRequests.push(request);
  persist();
  return clone(request);
}

/**
 * Get a user's erasure request (if any).
 */
export async function getErasureRequest(schoolId, userId) {
  const request = erasureRequests.find(
    (r) => r.schoolId === schoolId && r.userId === userId && r.status !== "REJECTED"
  );
  return request ? clone(request) : null;
}

/**
 * List all erasure requests for a school (admin view).
 */
export async function listErasureRequests(schoolId, { status } = {}) {
  return erasureRequests
    .filter(
      (r) =>
        r.schoolId === schoolId &&
        (!status || r.status === status)
    )
    .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
    .map(clone);
}

/**
 * Approve or reject an erasure request. When approved, the admin must then
 * call executeErasureRequest to actually delete the data.
 */
export async function reviewErasureRequest(requestId, { approved, reviewedBy }) {
  const request = erasureRequests.find((r) => r.id === requestId);
  if (!request) return null;
  if (request.status !== "PENDING") return request;

  request.status = approved ? "APPROVED" : "REJECTED";
  request.reviewedAt = nowIso();
  request.reviewedBy = reviewedBy || "system";
  persist();
  return clone(request);
}

/**
 * Execute an approved erasure request — permanently delete the user's data.
 * Returns a summary of what was deleted.
 */
export async function executeErasureRequest(requestId, { executedBy } = {}) {
  const request = erasureRequests.find((r) => r.id === requestId);
  if (!request || request.status !== "APPROVED") return null;

  const userId = request.userId;
  const user = users.find((u) => u.id === userId);
  const deleted = {
    user: false,
    scores: 0,
    attendance: 0,
    feePayments: 0,
    feeCarryovers: 0,
    timetable: 0,
  };

  if (user) {
    // Remove user
    const idx = users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      users.splice(idx, 1);
      deleted.user = true;
    }

    // Cascade: delete student-related data
    const drop = (arr, key) => {
      let count = 0;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i][key] === userId) {
          arr.splice(i, 1);
          count++;
        }
      }
      return count;
    };

    deleted.scores = drop(scores, "studentId");
    deleted.attendance = drop(attendance, "studentId");
    deleted.feePayments = drop(feePayments, "studentId");
    deleted.feeCarryovers = drop(feeCarryovers, "studentId");
    deleted.timetable = drop(timetable, "teacherId");
  }

  request.status = "EXECUTED";
  request.executedAt = nowIso();
  persist();

  // Log the execution
  await logDataAccess({
    schoolId: request.schoolId,
    actorId: executedBy || "system",
    actorName: "System",
    actorRole: "SYSTEM",
    action: "ERASURE_EXECUTED",
    targetType: "USER",
    targetId: userId,
    detail: `Erasure request ${requestId} executed. Deleted: user=${deleted.user}, scores=${deleted.scores}, attendance=${deleted.attendance}, payments=${deleted.feePayments}`,
  });

  return { request: clone(request), deleted };
}

// ── Data Access Audit Log (GDPR Art. 30) ────────────────────────────

/**
 * Log a data access event — who accessed what data and when.
 * Used for GDPR Article 30 (records of processing activities).
 */
export async function logDataAccess({ schoolId, actorId, actorName, actorRole, action, targetType, targetId, detail }) {
  const entry = {
    id: nid("dal"),
    schoolId,
    actorId,
    actorName: actorName || "Unknown",
    actorRole: actorRole || "",
    action,
    targetType: targetType || "",
    targetId: targetId || "",
    detail: detail || "",
    timestamp: nowIso(),
  };
  dataAccessLog.push(entry);
  persist();
  return clone(entry);
}

/**
 * List data access log entries for a school (admin view).
 * Supports filtering by actor, action type, and date range.
 */
export async function listDataAccessLog(schoolId, { actorId, action, limit = 100 } = {}) {
  return dataAccessLog
    .filter((e) => {
      if (e.schoolId !== schoolId) return false;
      if (actorId && e.actorId !== actorId) return false;
      if (action && e.action !== action) return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit)
    .map(clone);
}

// ── Consent Tracking (GDPR Art. 6, 7) ──────────────────────────────
// Consent is tracked implicitly: when a school registers (consent to
// process data), when a parent enrols a child (consent for child's
// data), and when a teacher accepts an invitation. The registration
// timestamp and the school's settings serve as the consent record.

/**
 * Record an explicit consent event. The consent record is immutable —
 * once created it cannot be modified, only superseded by a new consent
 * (e.g. consent withdrawal).
 */
export async function recordConsent({ schoolId, userId, consentType, detail }) {
  // We store consent in the dataAccessLog with a special action type
  return logDataAccess({
    schoolId,
    actorId: userId || "system",
    actorName: detail || "Consent recorded",
    actorRole: "CONSENT",
    action: `CONSENT_${consentType}`,
    targetType: "CONSENT",
    targetId: userId || schoolId,
    detail: detail || `Consent type: ${consentType}`,
  });
}

/**
 * Record consent withdrawal.
 */
export async function withdrawConsent({ schoolId, userId, consentType, reason }) {
  return logDataAccess({
    schoolId,
    actorId: userId,
    actorName: reason || "Consent withdrawn",
    actorRole: "CONSENT",
    action: `CONSENT_WITHDRAWN_${consentType}`,
    targetType: "CONSENT",
    targetId: userId,
    detail: reason || `Consent type: ${consentType} withdrawn`,
  });
}
