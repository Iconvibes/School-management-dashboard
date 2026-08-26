import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { SAAS_PLANS, calculateSaaSPrice } from "@/lib/paystack";
import { createPlatformAlert } from "@/modules/platform/store";

/**
 * GET /api/platform/billing/[schoolId]
 * Get subscription details for a specific school.
 */
export async function GET(req, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.revenue");
  if (isDenied(session)) return session;

  const { schoolId } = await params;
  const school = await store.getSchoolById(schoolId);
  if (!school) {
    return Response.json({ error: "School not found" }, { status: 404 });
  }

  const users = await store.listUsers({ schoolId, role: "STUDENT" });
  const studentCount = users.length;
  const monthlyPrice = calculateSaaSPrice(school.billingPlan || "trial", "monthly", studentCount);
  const annualPrice = calculateSaaSPrice(school.billingPlan || "trial", "annual", studentCount);

  // Check trial status
  const now = new Date();
  const trialEnd = school.trialEnd ? new Date(school.trialEnd) : null;
  const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))) : 0;

  return Response.json({
    school: {
      id: school.id,
      name: school.name,
      brandColor: school.brandColor,
    },
    subscription: {
      billingPlan: school.billingPlan || "trial",
      billingCycle: school.billingCycle || "monthly",
      subscriptionStatus: school.subscriptionStatus || "trial",
      currentPeriodEnd: school.currentPeriodEnd || null,
      trialStart: school.trialStart || null,
      trialEnd: school.trialEnd || null,
      trialDaysLeft,
      isTrialExpired: trialEnd ? now > trialEnd : false,
      paystackCustomerCode: school.paystackCustomerCode || "",
      paystackSubscriptionCode: school.paystackSubscriptionCode || "",
    },
    pricing: {
      studentCount,
      monthlyPrice,
      annualPrice,
      plans: SAAS_PLANS,
    },
  });
}

/**
 * PATCH /api/platform/billing/[schoolId]
 * Update a school's subscription (activate, cancel, change plan).
 *
 * Body: { action: "activate" | "cancel" | "change_plan", plan?, cycle? }
 */
export async function PATCH(req, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.revenue");
  if (isDenied(session)) return session;

  const { schoolId } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { action, plan, cycle } = body;

  const school = await store.getSchoolById(schoolId);
  if (!school) {
    return Response.json({ error: "School not found" }, { status: 404 });
  }

  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
  const actorName = session.user?.name || session.user?.email || "Platform Admin";

  switch (action) {
    case "activate": {
      // Set subscription to active with a chosen plan
      const planId = plan || "standard";
      const billingCycle = cycle || "monthly";
      const validPlan = SAAS_PLANS.find((p) => p.id === planId);
      if (!validPlan) {
        return Response.json({ error: "Invalid plan" }, { status: 400 });
      }

      const now = new Date();
      const periodEnd = new Date(now);
      if (billingCycle === "annual") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      const updated = await store.updateSchoolSubscription(schoolId, {
        billingPlan: planId,
        billingCycle,
        subscriptionStatus: "active",
        currentPeriodEnd: periodEnd.toISOString(),
      });

      await store.createAuditLog({
        action: "subscription_activate",
        actor: actorName,
        schoolId,
        schoolName: school.name,
        description: `Activated ${validPlan.name} plan (${billingCycle}) for ${school.name}`,
        meta: { plan: planId, cycle: billingCycle, previousPlan: school.billingPlan },
        ip,
      });
      await createPlatformAlert({
        schoolId,
        schoolName: school.name,
        type: 'subscription_activated',
        severity: 'success',
        title: `${school.name} subscribed to ${validPlan.name}`,
        message: `${validPlan.name} plan activated (${billingCycle}) for ${school.name}.`,
        meta: { plan: planId, cycle: billingCycle },
      });

      return Response.json({ success: true, school: updated });
    }

    case "cancel": {
      const updated = await store.updateSchoolSubscription(schoolId, {
        subscriptionStatus: "cancelled",
      });

      await store.createAuditLog({
        action: "subscription_cancel",
        actor: actorName,
        schoolId,
        schoolName: school.name,
        description: `Cancelled subscription for ${school.name} (was ${school.billingPlan || 'trial'})`,
        meta: { previousPlan: school.billingPlan, previousStatus: school.subscriptionStatus },
        ip,
      });
      await createPlatformAlert({
        schoolId,
        schoolName: school.name,
        type: 'subscription_cancelled',
        severity: 'warning',
        title: `${school.name} subscription cancelled`,
        message: `${school.name} has cancelled their ${school.billingPlan || 'trial'} plan.`,
        meta: { previousPlan: school.billingPlan },
      });

      return Response.json({ success: true, school: updated });
    }

    case "change_plan": {
      const planId = plan || "standard";
      const validPlan = SAAS_PLANS.find((p) => p.id === planId);
      if (!validPlan) {
        return Response.json({ error: "Invalid plan" }, { status: 400 });
      }

      const updated = await store.updateSchoolSubscription(schoolId, {
        billingPlan: planId,
        billingCycle: cycle || school.billingCycle || "monthly",
      });

      await store.createAuditLog({
        action: "plan_change",
        actor: actorName,
        schoolId,
        schoolName: school.name,
        description: `Changed ${school.name} from ${school.billingPlan || "trial"} to ${planId}`,
        meta: { previousPlan: school.billingPlan, newPlan: planId, cycle: cycle || school.billingCycle },
        ip,
      });
      await createPlatformAlert({
        schoolId,
        schoolName: school.name,
        type: 'plan_change',
        severity: 'info',
        title: `${school.name} plan changed to ${validPlan.name}`,
        message: `${school.name} moved from ${school.billingPlan || 'trial'} to ${validPlan.name}.`,
        meta: { previousPlan: school.billingPlan, newPlan: planId },
      });

      return Response.json({ success: true, school: updated });
    }

    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}
