/**
 * Mongo store — compliance domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  User,
  Score,
  FeePayment,
  FeeCarryover,
  Attendance,
  TimetableEntry,
} from "./shared.js";

// ── GDPR Compliance (erasure requests, data access audit, consent) ──

export async function createErasureRequest({ schoolId, userId, userName, reason }) {
  const request = await ErasureRequest.create({
    schoolId, userId, userName: userName || "Unknown", reason: reason || "",
    status: "PENDING", requestedAt: new Date(),
  });
  return request.toJSON();
}

export async function getErasureRequest(schoolId, userId) {
  const r = await ErasureRequest.findOne({ schoolId, userId, status: { $ne: "REJECTED" } }).lean();
  return r ? { ...r, id: r._id.toString(), _id: undefined, __v: undefined } : null;
}

export async function listErasureRequests(schoolId, { status } = {}) {
  const query = { schoolId };
  if (status) query.status = status;
  const results = await ErasureRequest.find(query).sort({ requestedAt: -1 }).lean();
  return results.map((r) => ({ ...r, id: r._id.toString(), _id: undefined, __v: undefined }));
}

export async function reviewErasureRequest(requestId, { approved, reviewedBy }) {
  const r = await ErasureRequest.findById(requestId);
  if (!r || r.status !== "PENDING") return r ? r.toJSON() : null;
  r.status = approved ? "APPROVED" : "REJECTED";
  r.reviewedAt = new Date();
  r.reviewedBy = reviewedBy || "system";
  await r.save();
  return r.toJSON();
}

export async function executeErasureRequest(requestId, { executedBy } = {}) {
  const r = await ErasureRequest.findById(requestId);
  if (!r || r.status !== "APPROVED") return null;
  const userId = r.userId;

  // Cascade: delete user data
  const drop = async (Model, filter) => {
    const result = await Model.deleteMany(filter);
    return result.deletedCount || 0;
  };

  const deleted = {
    user: false, scores: 0, attendance: 0, feePayments: 0, feeCarryovers: 0, timetable: 0,
  };

  // Delete user and cascade-related data
  const user = await User.findByIdAndDelete(userId);
  deleted.user = !!user;
  deleted.scores = await drop(Score, { studentId: userId });
  deleted.attendance = await drop(Attendance, { "records.studentId": userId });
  deleted.feePayments = await drop(FeePayment, { studentId: userId });
  deleted.feeCarryovers = await drop(FeeCarryover, { studentId: userId });
  deleted.timetable = await drop(TimetableEntry, { teacherId: userId });

  r.status = "EXECUTED";
  r.executedAt = new Date();
  await r.save();

  // Log the execution
  await logDataAccess({
    schoolId: r.schoolId,
    actorId: executedBy || "system",
    actorName: "System",
    actorRole: "SYSTEM",
    action: "ERASURE_EXECUTED",
    targetType: "USER",
    targetId: userId.toString(),
    detail: `Erasure request ${requestId} executed. Deleted: user=${deleted.user}, scores=${deleted.scores}, attendance=${deleted.attendance}, payments=${deleted.feePayments}`,
  });

  return { request: r.toJSON(), deleted };
}

export async function logDataAccess({ schoolId, actorId, actorName, actorRole, action, targetType, targetId, detail }) {
  const entry = await DataAccessLog.create({
    schoolId, actorId, actorName: actorName || "Unknown", actorRole: actorRole || "",
    action, targetType: targetType || "", targetId: targetId || "", detail: detail || "",
    timestamp: new Date(),
  });
  return entry.toJSON();
}

export async function listDataAccessLog(schoolId, { actorId, action, limit = 100 } = {}) {
  const query = { schoolId };
  if (actorId) query.actorId = actorId;
  if (action) query.action = action;
  const results = await DataAccessLog.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
  return results.map((e) => ({ ...e, id: e._id.toString(), _id: undefined, __v: undefined }));
}

export async function recordConsent({ schoolId, userId, consentType, detail }) {
  return logDataAccess({ schoolId, actorId: userId || "system", actorName: detail || "Consent recorded", actorRole: "CONSENT", action: `CONSENT_${consentType}`, targetType: "CONSENT", targetId: userId || schoolId, detail: detail || `Consent type: ${consentType}` });
}

export async function withdrawConsent({ schoolId, userId, consentType, reason }) {
  return logDataAccess({ schoolId, actorId: userId, actorName: reason || "Consent withdrawn", actorRole: "CONSENT", action: `CONSENT_WITHDRAWN_${consentType}`, targetType: "CONSENT", targetId: userId, detail: reason || `Consent type: ${consentType} withdrawn` });
}
