import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requireAuth, requireOwnChild } from "@/lib/policy";

/**
 * POST /api/fees/audit/receipt — record that a receipt was downloaded.
 * Body: { studentId, receiptNo, amount, method }
 *
 * Called (fire-and-forget) when a parent downloads a receipt PDF, so the
 * audit trail shows who pulled which receipt and when. The student must be
 * one of the caller's own linked children (requireOwnChild), and the entry
 * is tenant-scoped to the parent's school.
 */
export async function POST(request) {
  const session = await requireAuth(["PARENT"]);
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { studentId, receiptNo, amount, method } = body;
  if (!studentId || !receiptNo) {
    return jsonError("studentId and receiptNo are required");
  }

  const child = await requireOwnChild(
    session,
    studentId,
    "You can only download receipts for your own children"
  );
  if (isDenied(child)) return child;

  // Never trust the client's receipt facts — resolve the payment from the
  // ledger so the trail records the real receipt, amount and method. A
  // fabricated receipt number therefore 404s instead of polluting the trail.
  const ledger = await store.getFeeLedger(session.schoolId);
  const entry = ledger.find((l) => l.studentId === child.id);
  const payment = entry?.payments?.find(
    (p) => p.receiptNo === receiptNo && p.status !== "PENDING"
  );
  if (!payment) {
    return jsonError("Receipt not found for this student", 404);
  }

  const parent = await store.findUserById(session.userId);
  await store.logFeeAudit({
    schoolId: session.schoolId,
    action: "RECEIPT_DOWNLOADED",
    actorId: session.userId,
    actorName: parent?.name || "A parent",
    actorRole: "PARENT",
    studentId: child.id,
    studentName: child.name,
    classArm: child.assignedClass || "",
    receiptNo: payment.receiptNo,
    amount: payment.amount,
    method: payment.method,
    note: "Receipt PDF downloaded from the parent portal",
  });

  return Response.json({ ok: true });
}
