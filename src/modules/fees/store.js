/**
 * Fees module — demo store implementation.
 * 
 * Functions: getFeeStructures, saveFeeStructure, getFeeLedger,
 *            recordFeePayment, confirmFeePayment, logFeeAudit, listFeeAudit
 */
import { feeStructures, feePayments, feeCarryovers, users, schools, feeAudit, nid, clone, nowIso, persist } from "@/modules/shared/store-state";

export async function getFeeStructures(schoolId) {
  return feeStructures
    .filter((f) => f.schoolId === schoolId)
    .sort((a, b) => a.classArm.localeCompare(b.classArm))
    .map(clone);
}

export async function saveFeeStructure(schoolId, { classArm, amount, session, term }) {
  let structure = feeStructures.find(
    (f) => f.schoolId === schoolId && f.classArm === classArm && f.session === session && f.term === term
  );
  if (!structure) {
    structure = { id: nid("fst"), schoolId, classArm, session, term, createdAt: nowIso() };
    feeStructures.push(structure);
  }
  structure.amount = Math.max(0, Number(amount) || 0);
  persist();
  return clone(structure);
}

export async function getFeeLedger(schoolId, { studentIds } = {}) {
  const students = users.filter(
    (u) => u.schoolId === schoolId && u.role === "STUDENT" && (!studentIds || studentIds.includes(u.id))
  );
  const school = schools.find((s) => s.id === schoolId);
  const currentSession = school?.currentSession || "2025/2026";
  const currentTerm = school?.currentTerm || "First Term";
  const structures = feeStructures.filter(
    (f) => f.schoolId === schoolId && f.session === currentSession && f.term === currentTerm
  );
  const carryovers = feeCarryovers.filter(
    (c) => c.schoolId === schoolId && c.session === currentSession && c.term === currentTerm && (!studentIds || studentIds.includes(c.studentId))
  );
  const scopedPayments = feePayments.filter(
    (p) => p.schoolId === schoolId && p.session === currentSession && p.term === currentTerm && (!studentIds || studentIds.includes(p.studentId))
  );
  return students.map((student) => {
    const structure = structures.find((f) => f.classArm === student.assignedClass);
    const carryover = carryovers.find((c) => c.studentId === student.id)?.amount || 0;
    const amount = (structure?.amount || 0) + carryover;
    const payments = scopedPayments.filter((p) => p.studentId === student.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const confirmed = payments.filter((p) => p.status !== "PENDING");
    const pending = payments.filter((p) => p.status === "PENDING");
    const paid = confirmed.reduce((acc, p) => acc + p.amount, 0);
    const pendingAmount = pending.reduce((acc, p) => acc + p.amount, 0);
    const balance = Math.max(0, amount - paid);
    return { studentId: student.id, name: student.name, email: student.email, assignedClass: student.assignedClass || "", amount, carryover, paid, pending: pendingAmount, balance, feePaid: amount > 0 ? balance <= 0 : !!student.feePaid, payments };
  });
}

export async function recordFeePayment({ schoolId, studentId, amount, method, note, status = "CONFIRMED" }) {
  const student = users.find((u) => u.id === studentId && u.schoolId === schoolId && u.role === "STUDENT");
  if (!student) return null;
  const school = schools.find((s) => s.id === schoolId);
  const amt = Math.max(0, Number(amount) || 0);
  const paymentStatus = status === "PENDING" ? "PENDING" : "CONFIRMED";
  const payment = {
    id: nid("fpay"), schoolId, studentId, amount: amt, method: method || "CASH",
    receiptNo: `RCT-${Date.now().toString(36).toUpperCase()}`,
    session: school?.currentSession || "2025/2026", term: school?.currentTerm || "First Term",
    note: note || "", status: paymentStatus, createdAt: nowIso(),
  };
  feePayments.push(payment);
  const ledger = await getFeeLedger(schoolId);
  const entry = ledger.find((l) => l.studentId === studentId);
  student.feePaid = entry ? entry.balance <= 0 : true;
  persist();
  return clone(payment);
}

export async function confirmFeePayment({ schoolId, paymentId }) {
  const payment = feePayments.find((p) => p.id === paymentId && p.schoolId === schoolId);
  if (!payment || payment.status !== "PENDING") return null;
  payment.status = "CONFIRMED";
  const student = users.find((u) => u.id === payment.studentId);
  if (student) {
    const ledger = await getFeeLedger(schoolId);
    const entry = ledger.find((l) => l.studentId === student.id);
    student.feePaid = entry ? entry.balance <= 0 : true;
  }
  persist();
  return clone(payment);
}

export async function logFeeAudit({ schoolId, action, actorId, actorName, actorRole, studentId, studentName, classArm, receiptNo, amount, method, note }) {
  const entry = { id: nid("faud"), schoolId, action, actorId, actorName, actorRole, studentId, studentName, classArm, receiptNo, amount, method, note, createdAt: nowIso() };
  feeAudit.push(entry);
  persist();
  return clone(entry);
}

export async function listFeeAudit(schoolId, { limit = 100 } = {}) {
  return feeAudit.filter((a) => a.schoolId === schoolId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit).map(clone);
}
