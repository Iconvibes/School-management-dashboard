import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/** POST /api/fees/payments — record a payment { studentId, amount, method, note } */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.record");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { studentId, amount, method, note } = body;
  if (!studentId) return jsonError("studentId is required");
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) return jsonError("A valid amount is required");

  // Tenant isolation — payment must target a student of this school
  const student = await store.findUserById(studentId);
  if (!student || student.schoolId !== session.schoolId || student.role !== "STUDENT") {
    return jsonError("Student not found in your school", 404);
  }

  const payment = await store.recordFeePayment({
    schoolId: session.schoolId,
    studentId,
    amount: amt,
    method,
    note,
  });

  // Audit: who recorded the payment, and when. Never blocks the response.
  // actorRole comes from the session so the trail shows whether a bursar or
  // the super admin did it.
  try {
    const admin = await store.findUserById(session.userId);
    await store.logFeeAudit({
      schoolId: session.schoolId,
      action: "PAYMENT_RECORDED",
      actorId: session.userId,
      actorName: admin?.name || "Super Admin",
      actorRole: session.role,
      studentId,
      studentName: student.name,
      classArm: student.assignedClass || "",
      receiptNo: payment.receiptNo,
      amount: amt,
      method,
      note: note || "Recorded by school admin",
    });
  } catch {
    // A failed audit entry must never fail the payment itself.
  }

  return Response.json({ payment }, { status: 201 });
}

/**
 * PATCH /api/fees/payments — confirm a parent-initiated payment.
 * Body: { id }
 * Only the SUPER_ADMIN may confirm (money-clearing is the admin's sign-off;
 * a bursar can record payments but not release them). Payments must belong
 * to the caller's school. The student's balance then updates everywhere
 * (ledger, parent portal, stats).
 */
export async function PATCH(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "fees.confirm");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { id } = body;
  if (!id) return jsonError("id is required");

  const payment = await store.confirmFeePayment({
    schoolId: session.schoolId,
    paymentId: id,
  });
  if (!payment) {
    return jsonError("Payment not found or already confirmed", 404);
  }

  // Audit: the confirmation is the money-clearing event — log who confirmed it.
  try {
    const admin = await store.findUserById(session.userId);
    const student = await store.findUserById(payment.studentId);
    await store.logFeeAudit({
      schoolId: session.schoolId,
      action: "PAYMENT_CONFIRMED",
      actorId: session.userId,
      actorName: admin?.name || "Super Admin",
      actorRole: session.role,
      studentId: payment.studentId,
      studentName: student?.name || "",
      classArm: student?.assignedClass || "",
      receiptNo: payment.receiptNo,
      amount: payment.amount,
      method: payment.method,
      note: "Parent payment confirmed — balance updated",
    });
  } catch {
    // Never block the confirmation on the audit write.
  }

  return Response.json({ payment });
}
