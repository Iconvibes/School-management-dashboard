import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/fees — full fee ledger for the school (admin).
 * Returns per-student billed / paid / balance + payment history.
 * ?classArm= filters; ?defaulters=1 returns only students with a balance.
 */
export async function GET(request) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.view");
  if (isDenied(session)) return session;

  const { searchParams } = new URL(request.url);
  const classArm = searchParams.get("classArm") || "";
  const defaultersOnly = searchParams.get("defaulters") === "1";

  const ledger = await store.getFeeLedger(session.schoolId);

  let rows = ledger.filter((l) => (classArm ? l.assignedClass === classArm : true));
  if (defaultersOnly) rows = rows.filter((l) => l.balance > 0);

  const totals = {
    billed: rows.reduce((a, l) => a + l.amount, 0),
    collected: rows.reduce((a, l) => a + l.paid, 0),
    outstanding: rows.reduce((a, l) => a + l.balance, 0),
    defaulters: rows.filter((l) => l.balance > 0).length,
    paid: rows.filter((l) => l.balance <= 0).length,
    // From the FULL ledger so it always matches the pendingPayments list below.
    pending: ledger.reduce((a, l) => a + (l.pending || 0), 0),
  };

  // Payments awaiting the admin's confirmation, newest first — powers the
  // dashboard notification + confirm action. Computed from the FULL ledger so
  // class-arm/defaulters filters never hide pending payments.
  const pendingPayments = ledger
    .flatMap((l) =>
      (l.payments || [])
        .filter((p) => p.status === "PENDING")
        .map((p) => ({
          id: p.id,
          receiptNo: p.receiptNo,
          studentId: l.studentId,
          studentName: l.name,
          assignedClass: l.assignedClass,
          amount: p.amount,
          method: p.method,
          createdAt: p.createdAt,
        }))
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return Response.json({ ledger: rows, totals, pendingPayments });
}
