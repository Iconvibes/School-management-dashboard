import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import School from "@/models/School";
import User from "@/models/User";
import Score from "@/models/Score";
import FeeStructure from "@/models/FeeStructure";
import FeePayment from "@/models/FeePayment";
import Attendance from "@/models/Attendance";
import Lead from "@/models/Lead";
import Notification from "@/models/Notification";
import FeeAudit from "@/models/FeeAudit";
import DigestPref from "@/models/DigestPref";
import Digest from "@/models/Digest";
import { computeGrade } from "@/lib/grading";

async function ready() {
  await connectDB();
}

const safe = (doc) => (doc ? doc.toJSON() : null);

// ---- Schools ---------------------------------------------------------------

export async function createSchoolAndAdmin({ schoolName, adminName, email, password }) {
  await ready();
  const school = await School.create({
    name: schoolName,
    activeArms: [],
    currentSession: "2025/2026",
    currentTerm: "First Term",
  });
  try {
    const user = await User.create({
      name: adminName,
      email,
      password,
      role: "SUPER_ADMIN",
      schoolId: school._id,
      payrollStatus: "PAID",
    });
    return { school: safe(school), user: safe(user) };
  } catch (err) {
    // Roll back the orphaned tenant so a failed admin create leaves no residue
    await School.findByIdAndDelete(school._id).catch(() => {});
    throw err;
  }
}

export async function findUserByEmail(email) {
  await ready();
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return null;
  return userToLoginShape(user);
}

/** Login lookup scoped to a tenant — this is the ONLY path login should use. */
export async function findUserByEmailInSchool(schoolId, email) {
  await ready();
  const user = await User.findOne({ schoolId, email: email.toLowerCase() });
  if (!user) return null;
  return userToLoginShape(user);
}

function userToLoginShape(user) {
  // Plain object INCLUDING password hash for login verification
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    password: user.password,
    role: user.role,
    schoolId: user.schoolId.toString(),
    assignedClass: user.assignedClass,
    payrollStatus: user.payrollStatus,
    feePaid: user.feePaid,
  };
}

export async function searchSchools(search, limit = 8) {
  await ready();
  const q = (search || "").trim();
  const query = q
    ? { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
    : {};
  const docs = await School.find(query).limit(limit);
  return docs.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    logoUrl: s.logoUrl || "",
    brandColor: s.brandColor || "#2563EB",
  }));
}

export async function findUserById(id) {
  await ready();
  const user = await User.findById(id);
  return user ? user.toJSON() : null;
}

export async function getSchoolById(id) {
  await ready();
  return safe(await School.findById(id));
}

export async function updateSchool(id, patch) {
  await ready();
  const allowed = ["name", "logoUrl", "brandColor", "activeArms", "currentSession", "currentTerm"];
  const update = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) update[k] = patch[k];
  });
  return safe(await School.findByIdAndUpdate(id, update, { new: true }));
}

// ---- Users -----------------------------------------------------------------

export async function listUsers({ schoolId, role, classArm }) {
  await ready();
  const query = { schoolId };
  if (role) query.role = role;
  if (classArm) query.assignedClass = classArm;
  return (await User.find(query).sort({ name: 1 })).map(safe);
}

export async function createUser({ schoolId, name, email, password, role, assignedClass = "", phone = "" }) {
  await ready();
  const user = await User.create({
    name,
    email,
    password,
    role,
    schoolId,
    assignedClass,
    phone,
    payrollStatus: role === "TEACHER" ? "PENDING" : "PAID",
  });
  return safe(user);
}

export async function updateUser(id, patch) {
  await ready();
  const allowed = ["name", "assignedClass", "payrollStatus", "feePaid", "parentId", "phone", "address", "password"];
  const update = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) update[k] = patch[k];
  });
  // findByIdAndUpdate bypasses the model's pre("save") bcrypt hook, so hash
  // explicitly here. Callers validate length before reaching the store.
  if (update.password !== undefined) {
    update.password = await bcrypt.hash(update.password, 10);
  }
  return safe(await User.findByIdAndUpdate(id, update, { new: true }));
}

/** List a parent's linked children (tenant-scoped to the parent's school). */
export async function getChildren(parentId) {
  await ready();
  const parent = await User.findById(parentId);
  if (!parent) return [];
  return (await User.find({ schoolId: parent.schoolId, parentId })).map(safe);
}

export async function deleteUser(id) {
  await ready();
  const res = await User.findByIdAndDelete(id);
  return !!res;
}

// ---- Scores ----------------------------------------------------------------

export async function saveScores({ schoolId, classArm, subject, rows }) {
  await ready();
  const saved = [];
  for (const row of rows) {
    const caScore = Math.min(40, Math.max(0, Number(row.caScore) || 0));
    const examScore = Math.min(60, Math.max(0, Number(row.examScore) || 0));
    const totalScore = caScore + examScore;
    const grade = computeGrade(totalScore);
    const score = await Score.findOneAndUpdate(
      { studentId: row.studentId, subject, classArm },
      { schoolId, caScore, examScore, totalScore, grade },
      { upsert: true, new: true }
    );
    saved.push(score.toJSON());
  }
  return saved;
}

export async function getScoresByClassSubject({ schoolId, classArm, subject }) {
  await ready();
  return (await Score.find({ schoolId, classArm, subject })).map((s) => s.toJSON());
}

export async function getScoresByStudent(studentId) {
  await ready();
  return (await Score.find({ studentId }).sort({ subject: 1 })).map((s) => s.toJSON());
}

export async function getScoresBySchool(schoolId) {
  await ready();
  return (await Score.find({ schoolId })).map((s) => s.toJSON());
}

export async function getDashboardStats(schoolId) {
  await ready();
  const [students, teachers, paidTeachers, feePaid, scoreRecords] = await Promise.all([
    User.countDocuments({ schoolId, role: "STUDENT" }),
    User.countDocuments({ schoolId, role: "TEACHER" }),
    User.countDocuments({ schoolId, role: "TEACHER", payrollStatus: "PAID" }),
    User.countDocuments({ schoolId, role: "STUDENT", feePaid: true }),
    Score.countDocuments({ schoolId }),
  ]);

  const studentUsers = await User.find({ schoolId, role: "STUDENT" }).select("assignedClass");
  const classDistribution = {};
  studentUsers.forEach((s) => {
    classDistribution[s.assignedClass || "Unassigned"] =
      (classDistribution[s.assignedClass || "Unassigned"] || 0) + 1;
  });

  const [structures, payments, studentList] = await Promise.all([
    FeeStructure.find({ schoolId }),
    FeePayment.find({ schoolId }),
    User.find({ schoolId, role: "STUDENT" }).select("assignedClass feePaid"),
  ]);
  const totalBilled = structures.reduce(
    (acc, f) => acc + f.amount * (classDistribution[f.classArm] || 0),
    0
  );
  // Only CONFIRMED payments count as collected; PENDING awaits the school.
  const totalCollected = payments
    .filter((p) => p.status !== "PENDING")
    .reduce((acc, p) => acc + p.amount, 0);
  const pendingPayments = payments.filter((p) => p.status === "PENDING");

  return {
    totalStudents: students,
    activeTeachers: teachers,
    payrollPaid: paidTeachers,
    payrollPending: teachers - paidTeachers,
    feeCollected: feePaid,
    feeRate: students ? Math.round((feePaid / students) * 100) : 0,
    feeCollectedAmount: totalCollected,
    feeOutstandingAmount: Math.max(0, totalBilled - totalCollected),
    pendingPayments: {
      count: pendingPayments.length,
      amount: pendingPayments.reduce((acc, p) => acc + p.amount, 0),
    },
    classDistribution,
    totalScoreRecords: scoreRecords,
  };
}

// ---- Fees -------------------------------------------------------------------

export async function getFeeStructures(schoolId) {
  await ready();
  return (await FeeStructure.find({ schoolId }).sort({ classArm: 1 })).map(safe);
}

export async function saveFeeStructure(schoolId, { classArm, amount, session, term }) {
  await ready();
  return safe(
    await FeeStructure.findOneAndUpdate(
      { schoolId, classArm, session, term },
      { schoolId, classArm, session, term, amount: Math.max(0, Number(amount) || 0) },
      { upsert: true, new: true }
    )
  );
}

export async function getFeeLedger(schoolId) {
  await ready();
  const [students, school, structures, payments] = await Promise.all([
    User.find({ schoolId, role: "STUDENT" }).sort({ name: 1 }),
    School.findById(schoolId),
    FeeStructure.find({ schoolId }),
    FeePayment.find({ schoolId }),
  ]);
  // Scope structures to the school's CURRENT session+term so a term rollover
  // never bills students with an old term's fee.
  const currentStructures = structures.filter(
    (f) =>
      f.session === (school?.currentSession || "2025/2026") &&
      f.term === (school?.currentTerm || "First Term")
  );
  return students.map((student) => {
    const structure = currentStructures.find((f) => f.classArm === student.assignedClass);
    const amount = structure?.amount || 0;
    const studentPayments = payments
      .filter((p) => p.studentId.toString() === student._id.toString())
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(safe);
    // Only CONFIRMED payments reduce the balance; PENDING is reported separately.
    const confirmed = studentPayments.filter((p) => p.status !== "PENDING");
    const pending = studentPayments.filter((p) => p.status === "PENDING");
    const paid = confirmed.reduce((acc, p) => acc + p.amount, 0);
    const pendingAmount = pending.reduce((acc, p) => acc + p.amount, 0);
    const balance = Math.max(0, amount - paid);
    return {
      studentId: student._id.toString(),
      name: student.name,
      email: student.email,
      assignedClass: student.assignedClass || "",
      amount,
      paid,
      pending: pendingAmount,
      balance,
      feePaid: amount > 0 ? balance <= 0 : !!student.feePaid,
      payments: studentPayments,
    };
  });
}

export async function recordFeePayment({ schoolId, studentId, amount, method, note, status = "CONFIRMED" }) {
  await ready();
  const student = await User.findOne({
    _id: studentId,
    schoolId,
    role: "STUDENT",
  });
  if (!student) return null;
  const amt = Math.max(0, Number(amount) || 0);
  // Derive the next receipt from the highest existing number, NOT from a count
  // — counts drop on deletion and would collide with the unique index.
  const last = await FeePayment.findOne({ schoolId })
    .sort({ receiptNo: -1 })
    .select("receiptNo");
  const lastNum = last ? parseInt(String(last.receiptNo).replace(/\D/g, ""), 10) || 0 : 0;
  const payment = await FeePayment.create({
    schoolId,
    studentId,
    amount: amt,
    method: method || "CASH",
    receiptNo: `RCT-${Math.max(1001, lastNum + 1)}`,
    session: "2025/2026",
    term: "First Term",
    note: note || "",
    status,
  });
  // Sync the legacy feePaid boolean. The ledger only counts CONFIRMED, so a
  // PENDING payment leaves feePaid untouched until the admin confirms it.
  const ledger = await getFeeLedger(schoolId);
  const entry = ledger.find((l) => l.studentId === studentId);
  await User.findByIdAndUpdate(studentId, { feePaid: entry ? entry.balance <= 0 : true });
  return safe(payment);
}

/** Mark a PENDING payment as CONFIRMED and re-sync the student's fee status. */
export async function confirmFeePayment({ schoolId, paymentId }) {
  await ready();
  const payment = await FeePayment.findOneAndUpdate(
    { _id: paymentId, schoolId, status: "PENDING" },
    { status: "CONFIRMED" },
    { new: true }
  );
  if (!payment) return null;
  const ledger = await getFeeLedger(schoolId);
  const entry = ledger.find((l) => l.studentId === payment.studentId.toString());
  await User.findByIdAndUpdate(payment.studentId, {
    feePaid: entry ? entry.balance <= 0 : true,
  });
  return safe(payment);
}

// ---- Attendance -------------------------------------------------------------

export async function getAttendance(schoolId, classArm, date) {
  await ready();
  return safe(
    await Attendance.findOne({ schoolId, classArm, date })
  );
}

export async function saveAttendance(schoolId, classArm, date, records) {
  await ready();
  return safe(
    await Attendance.findOneAndUpdate(
      { schoolId, classArm, date },
      {
        schoolId,
        classArm,
        date,
        session: "2025/2026",
        term: "First Term",
        records: records.map((r) => ({
          studentId: r.studentId,
          present: !!r.present,
        })),
      },
      { upsert: true, new: true }
    )
  );
}

export async function getStudentAttendanceSummary(schoolId, studentId) {
  await ready();
  const docs = await Attendance.find({
    schoolId,
    "records.studentId": studentId,
  });
  let present = 0;
  docs.forEach((a) => {
    const rec = a.records.find((r) => r.studentId.toString() === studentId);
    if (rec?.present) present += 1;
  });
  return { total: docs.length, present, absent: docs.length - present };
}

// ---- Marketing leads ---------------------------------------------------------

/** Create a lead (demo request or newsletter subscription). Returns null when
 *  the email already exists for that kind (the unique index enforces it). */
export async function createLead({ kind, name = "", school = "", email, phone = "", size = "", interest = "", message = "", ip = "", userAgent = "" }) {
  await ready();
  try {
    const lead = await Lead.create({
      kind,
      name,
      school,
      email,
      phone,
      size,
      interest,
      message,
      ip,
      userAgent,
    });
    return safe(lead);
  } catch (err) {
    // E11000 duplicate key → already subscribed / already requested
    if (err?.code === 11000) return null;
    throw err;
  }
}

/** Most recent leads first, optionally filtered by kind. */
export async function listLeads(kind) {
  await ready();
  const query = kind ? { kind } : {};
  return (await Lead.find(query).sort({ createdAt: -1 })).map(safe);
}

// ---- Notifications (admin inbox) ----------------------------------------------

export async function createNotification({ schoolId, kind, to, subject, preview, body, amount }) {
  await ready();
  const notification = await Notification.create({
    schoolId,
    kind: kind || "info",
    to: Array.isArray(to) ? to : [],
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
 */
export async function listNotifications(schoolId, userId) {
  await ready();
  const docs = await Notification.find({ schoolId }).sort({ createdAt: -1 });
  return docs.map((d) => {
    const json = d.toJSON();
    delete json.readBy;
    json.read = isReadBy(d, userId);
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
  const docs = await Notification.find({ schoolId });
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

// ---- Fee audit trail ------------------------------------------------------------

export async function logFeeAudit({
  schoolId,
  action,
  actorId = "",
  actorName,
  actorRole = "",
  studentId = "",
  studentName = "",
  classArm = "",
  receiptNo = "",
  amount = 0,
  method = "",
  note = "",
}) {
  await ready();
  return safe(
    await FeeAudit.create({
      schoolId,
      action,
      actorId,
      actorName: actorName || "Unknown",
      actorRole,
      studentId,
      studentName,
      classArm,
      receiptNo,
      amount: Number(amount) || 0,
      method,
      note: note || "",
    })
  );
}

/** Newest first. */
export async function listFeeAudit(schoolId, { limit = 100 } = {}) {
  await ready();
  return (await FeeAudit.find({ schoolId }).sort({ createdAt: -1 }).limit(limit)).map(safe);
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
