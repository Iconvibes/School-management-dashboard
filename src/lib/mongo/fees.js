/**
 * Mongo store — fees domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  mongoose,
  School,
  User,
  FeeStructure,
  FeePayment,
  FeeCarryover,
  FeeAudit,
  bypassTenantScope,
  decryptField,
  ready,
  safe,
} from "./shared.js";

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

export async function getFeeLedger(schoolId, { studentIds } = {}) {
  await ready();
  // Optional `{ studentIds }` scopes both queries to a subset (the parent
  // portal only needs its own children, not the whole school). Strings from
  // the API are normalized to ObjectIds so $in matches the ObjectId fields.
  const normalizeIds = (ids) =>
    (ids || []).map((id) =>
      mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id
    );
  const studentQuery = { schoolId, role: "STUDENT" };
  const paymentQuery = { schoolId };
  if (studentIds) {
    studentQuery._id = { $in: normalizeIds(studentIds) };
    paymentQuery.studentId = { $in: normalizeIds(studentIds) };
  }
  const [students, school, structures] = await Promise.all([
    User.find(studentQuery).sort({ name: 1 }),
    School.findById(schoolId),
    FeeStructure.find({ schoolId }),
  ]);
  // Scope payments to the school's CURRENT session+term too, so an old term's
  // payments never satisfy the new term's balance after a rollover.
  const currentSession = school?.currentSession || "2025/2026";
  const currentTerm = school?.currentTerm || "First Term";
  paymentQuery.session = currentSession;
  paymentQuery.term = currentTerm;
  const scopedPayments = await FeePayment.find(paymentQuery);
  // Scope structures to the school's CURRENT session+term so a term rollover
  // never bills students with an old term's fee.
  const currentStructures = structures.filter(
    (f) => f.session === currentSession && f.term === currentTerm
  );
  // Unpaid balances carried from the previous term (created at rollover) ride
  // into this term's billing — the student owes new fee + carried debt.
  const carryovers = await FeeCarryover.find({ schoolId, session: currentSession, term: currentTerm });
  return students.map((student) => {
    const structure = currentStructures.find((f) => f.classArm === student.assignedClass);
    const carryover =
      carryovers.find((c) => c.studentId.toString() === student._id.toString())?.amount || 0;
    const amount = (structure?.amount || 0) + carryover;
    const studentPayments = scopedPayments
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
      email: decryptField(student.email) || "",
      assignedClass: student.assignedClass || "",
      amount,
      // The portion of `amount` carried over from the previous term's unpaid
      // balance (0 when nothing was carried).
      carryover,
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
  const school = await School.findById(schoolId);
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
    // Stamp the payment with the school's CURRENT term so a term rollover
    // archives the right rows and old-term payments never satisfy the new
    // term's ledger.
    session: school?.currentSession || "2025/2026",
    term: school?.currentTerm || "First Term",
    note: note || "",
    status,
  });
  // Sync the legacy feePaid boolean. The ledger only counts CONFIRMED, so a
  // PENDING payment leaves feePaid untouched until the admin confirms it.
  const ledger = await getFeeLedger(schoolId);
  const entry = ledger.find((l) => l.studentId === studentId);
  // By-_id: recordFeePayment is schoolId-scoped and the student came from the
  // school's ledger above.
  await bypassTenantScope(
    User.findByIdAndUpdate(studentId, { feePaid: entry ? entry.balance <= 0 : true })
  );
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
  // By-_id: the payment was matched with schoolId in the filter above.
  await bypassTenantScope(
    User.findByIdAndUpdate(payment.studentId, {
      feePaid: entry ? entry.balance <= 0 : true,
    })
  );
  return safe(payment);
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
