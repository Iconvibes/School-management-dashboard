import { jsonError } from "@/lib/auth";
import { isDenied, requirePermission } from "@/lib/policy";
import { store } from "@/lib/store";
import { verifyTransaction, isPaystackConfigured } from "@/lib/paystack";

/**
 * GET /api/billing/verify?ref=SUB-xxx&sid=sch_xxx
 * Verify a Paystack payment and activate the school's subscription.
 *
 * This is the Paystack callback_url target: the payer's browser lands here
 * right after checkout, so the SUPER_ADMIN session cookie is present and the
 * gate below passes for the admin who started the flow.
 *
 * TENANT ISOLATION: the school whose subscription is activated is derived
 * from the SERVER-VALIDATED session, never from the `sid` query parameter.
 * A mismatch between `sid` and the session's school is a 403 — the query
 * param is only a consistency check, not an authority. (Without this, any
 * unauthenticated caller could activate ANY school's subscription by hitting
 * the URL with an arbitrary `sid`.)
 *
 * In demo mode (no PAYSTACK_SECRET_KEY), activation already happened in
 * POST /api/billing/checkout — this endpoint just bounces back to the
 * dashboard after the gate.
 */
export async function GET(req) {
  // Same gate as the checkout that created this flow — the browser arriving
  // here is the admin who paid, so the session cookie is present.
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("ref");
  const schoolIdParam = searchParams.get("sid");

  if (!reference || !schoolIdParam) {
    return jsonError("Missing reference or school ID");
  }

  // The query param must AGREE with the session — it never authorizes on
  // its own. A mismatch is someone replaying another school's callback.
  if (String(schoolIdParam) !== String(session.schoolId)) {
    return jsonError("Forbidden", 403);
  }
  const schoolId = session.schoolId;

  // Demo mode — activation happened at checkout; just bounce back.
  if (!isPaystackConfigured()) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/dashboard?tab=settings&billing=success" },
    });
  }

  // Production — verify with Paystack
  const result = await verifyTransaction(reference);

  if (!result.success) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/dashboard?tab=settings&billing=failed" },
    });
  }

  // Defense in depth: the transaction must carry THIS school's id in its
  // metadata (stamped server-side at checkout), not just any successful
  // reference the caller pasted into the URL.
  const meta = result.metadata || {};
  if (meta.school_id && String(meta.school_id) !== String(schoolId)) {
    return jsonError("Payment reference does not belong to this school", 403);
  }

  // Extract subscription details from metadata
  const planId = meta.plan_id || "standard";
  const cycle = meta.cycle || "monthly";

  // Calculate period end
  const now = new Date();
  const periodEnd = new Date(now);
  if (cycle === "annual") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  // Activate subscription
  const school = await store.getSchoolById(schoolId);
  await store.updateSchoolSubscription(schoolId, {
    billingPlan: planId,
    billingCycle: cycle,
    subscriptionStatus: "active",
    currentPeriodEnd: periodEnd.toISOString(),
  });

  // Log audit entry
  await store.createAuditLog({
    action: "subscription_activate",
    actor: school?.name || "School Admin",
    schoolId,
    schoolName: school?.name || "",
    description: `Activated ${planId} plan (${cycle}) — ₦${(result.amount || 0).toLocaleString()}`,
    meta: {
      plan: planId,
      cycle,
      amount: result.amount,
      reference,
      channel: result.channel,
    },
  });

  return new Response(null, {
    status: 302,
    headers: { Location: "/admin/dashboard?tab=settings&billing=success" },
  });
}
