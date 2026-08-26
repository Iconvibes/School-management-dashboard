import { store } from "@/lib/store";
import { verifyTransaction, isPaystackConfigured } from "@/lib/paystack";

/**
 * GET /api/billing/verify?ref=SUB-xxx&sid=sch_xxx
 * Verify a Paystack payment and activate the school's subscription.
 *
 * In demo mode (no PAYSTACK_SECRET_KEY), always succeeds.
 * Redirects to the admin dashboard billing tab after processing.
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("ref");
  const schoolId = searchParams.get("sid");

  if (!reference || !schoolId) {
    return new Response("Missing reference or school ID", { status: 400 });
  }

  // Demo mode — always succeed
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

  // Extract subscription details from metadata
  const meta = result.metadata || {};
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
