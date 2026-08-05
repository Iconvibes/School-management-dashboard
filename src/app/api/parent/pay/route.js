import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";

/**
 * POST /api/parent/pay — one-click "Pay Now" for a linked child's fee balance.
 * Body: { studentId, amount, method }
 * The parent may ONLY pay for children linked to their account, within their
 * own school. Records the payment via the fee ledger and returns the receipt.
 */
export async function POST(request) {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "PARENT") return jsonError("Forbidden", 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { studentId, amount, method } = body;
  if (!studentId) return jsonError("studentId is required");
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) return jsonError("A valid amount is required");

  // Tenant + relationship check: the child must be linked to this parent
  const children = await store.getChildren(session.userId);
  const child = children.find((c) => c.id === studentId);
  if (!child) return jsonError("You can only pay fees for your own children", 403);

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
    method: method || "CARD",
    note: "Paid by parent via Pay Now",
    status: "PENDING",
  });

  return Response.json({ payment }, { status: 201 });
}
