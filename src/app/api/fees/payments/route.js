import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requireAuth } from "@/lib/policy";

/** POST /api/fees/payments — record a payment { studentId, amount, method, note } */
export async function POST(request) {
  const session = await requireAuth(["SUPER_ADMIN"]);
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

  return Response.json({ payment }, { status: 201 });
}

/**
 * PATCH /api/fees/payments — confirm a parent-initiated payment.
 * Body: { id }
 * Only the school admin may confirm, and only payments within their school.
 * The student's balance then updates everywhere (ledger, parent portal, stats).
 */
export async function PATCH(request) {
  const session = await requireAuth(["SUPER_ADMIN"]);
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

  return Response.json({ payment });
}
