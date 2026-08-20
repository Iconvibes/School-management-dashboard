import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requireAuth, requireOwnChild } from "@/lib/policy";
import { sendEmail } from "@/lib/mailer";
import { paymentNotification } from "@/lib/email-templates";
import { buildPaymentNotification } from "@/lib/notifications";
import { feePaymentSchema, firstValidationMessage } from "@/lib/validation";

/**
 * POST /api/parent/pay — one-click "Pay Now" for a linked child's fee balance.
 * Body: { studentId, amount, method }
 * The parent may ONLY pay for children linked to their account, within their
 * own school. Records the payment via the fee ledger and returns the receipt.
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

  const invalid = firstValidationMessage(feePaymentSchema, body);
  if (invalid) return jsonError(invalid);
  const { studentId, amount, method } = feePaymentSchema.parse(body);
  const amt = Number(amount);
  const bankReference = body.bankReference || "";
  const datePaid = body.datePaid || new Date().toISOString().slice(0, 10);
  const noteText = body.note || "";

  // Tenant + relationship check: the child must be linked to this parent
  const child = await requireOwnChild(session, studentId, "You can only pay fees for your own children");
  if (isDenied(child)) return child;

  // Anti-fraud guard: only ONE payment per child may await confirmation at a
  // time — a parent can't stack duplicate payments the admin might
  // double-confirm.
  const ledger = await store.getFeeLedger(session.schoolId);
  const entry = ledger.find((l) => l.studentId === child.id);
  if (entry && entry.pending > 0) {
    return jsonError(
      "You already have a payment awaiting school confirmation for this child",
      409
    );
  }

  // Parent payments are created PENDING: they never reduce the balance until
  // the school confirms it actually received the money.
  const payment = await store.recordFeePayment({
    schoolId: session.schoolId,
    studentId,
    amount: amt,
    method: method || "TRANSFER",
    note: noteText || `Reported by parent — ${method || "TRANSFER"}${bankReference ? ` · Ref: ${bankReference}` : ""}`,
    status: "PENDING",
    bankReference: bankReference || undefined,
    datePaid: datePaid || undefined,
  });

  // Audit: a parent payment is a money event even before it clears — the
  // trail records who submitted it, and the admin's confirm later closes it.
  try {
    const parent = await store.findUserById(session.userId);
    await store.logFeeAudit({
      schoolId: session.schoolId,
      action: "PARENT_PAYMENT_SUBMITTED",
      actorId: session.userId,
      actorName: parent?.name || "A parent",
      actorRole: "PARENT",
      studentId: child.id,
      studentName: child.name,
      classArm: child.assignedClass || "",
      receiptNo: payment.receiptNo,
      amount: amt,
      method: method || "CARD",
      note: `Reported by parent — ${method || "TRANSFER"}${bankReference ? ` · Ref: ${bankReference}` : ""} — awaiting confirmation`,
    });
  } catch {
    // An audit failure must never fail a successful payment.
  }

  // Email-style notification for the school's admins — visible in the inbox
  // bell on every admin page, not just the fee tab. Never blocks the payment.
  try {
    const [parent, admins] = await Promise.all([
      store.findUserById(session.userId),
      store.listUsers({ schoolId: session.schoolId, role: "SUPER_ADMIN" }),
    ]);
    const note = buildPaymentNotification({
      payment,
      student: child,
      parent: { name: parent?.name || "A parent" },
    });
    await store.createNotification({
      schoolId: session.schoolId,
      ...note,
      to: admins.map((a) => a.email),
    });

    // Send real email to each admin if SMTP is configured (fire-and-forget)
    for (const admin of admins) {
      sendEmail({
        to: admin.email,
        ...paymentNotification({
          studentName: child.name,
          className: child.assignedClass,
          parentName: parent?.name || "A parent",
          amount: amt,
          receiptNo: payment.receiptNo,
          method: payment.method,
          schoolName: school?.name,
          brandColor: school?.brandColor,
        }),
      }).catch(() => {});
    }
  } catch {
    // A notification failure must never fail a successful payment.
  }

  return Response.json({ payment }, { status: 201 });
}
