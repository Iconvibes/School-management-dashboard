import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import {
  initializeTransaction,
  createCustomer,
  createPlan,
  generateReference,
  isPaystackConfigured,
  SAAS_PLANS,
} from "@/lib/paystack";

/**
 * POST /api/billing/checkout
 * Initialize a Paystack checkout for SaaS subscription upgrade.
 *
 * Body: { planId: "starter"|"standard"|"enterprise", cycle: "monthly"|"annual" }
 *
 * Flow:
 * 1. Find the school's admin user (to get email for Paystack customer)
 * 2. Create or retrieve Paystack customer
 * 3. Create or retrieve Paystack plan (if needed)
 * 4. Initialize a transaction with the correct amount
 * 5. Return the authorization URL for redirect
 *
 * In demo mode (no PAYSTACK_SECRET_KEY), simulates the checkout
 * and immediately activates the subscription.
 */
export async function POST(req) {
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (isDenied(session)) return session;

  const { planId, cycle } = await req.json();

  if (!planId || !cycle) {
    return Response.json({ error: "planId and cycle are required" }, { status: 400 });
  }

  const plan = SAAS_PLANS.find((p) => p.id === planId);
  if (!plan) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const schoolId = session.schoolId;
  const school = await store.getSchoolById(schoolId);
  if (!school) {
    return Response.json({ error: "School not found" }, { status: 404 });
  }

  // Enterprise is custom — contact sales
  if (planId === "enterprise") {
    return Response.json({
      error: "Enterprise plan requires a custom quote. Please contact sales@edutrack.app.",
      requiresContact: true,
    }, { status: 400 });
  }

  // Get the student count for pricing
  const stats = await store.getDashboardStats(schoolId);
  const studentCount = stats?.totalStudents || 0;

  if (studentCount === 0) {
    return Response.json({ error: "Add students before subscribing" }, { status: 400 });
  }

  // Calculate price
  const perStudent = cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
  const totalAmount = perStudent * studentCount;

  // Demo mode — simulate checkout
  if (!isPaystackConfigured()) {
    // Immediately activate the subscription
    const now = new Date();
    const periodEnd = new Date(now);
    if (cycle === "annual") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await store.updateSchoolSubscription(schoolId, {
      billingPlan: planId,
      billingCycle: cycle,
      subscriptionStatus: "active",
      currentPeriodEnd: periodEnd.toISOString(),
      paystackCustomerCode: `demo_${schoolId}`,
      paystackSubscriptionCode: `demo_sub_${schoolId}`,
      paystackPlanCode: `demo_plan_${planId}_${cycle}`,
    });

    // Log audit entry
    await store.createAuditLog({
      action: "subscription_activate",
      actor: session.user?.name || "School Admin",
      schoolId,
      schoolName: school.name,
      description: `Activated ${plan.name} plan (${cycle}) for ${school.name} — ₦${totalAmount.toLocaleString()}`,
      meta: { plan: planId, cycle, amount: totalAmount, studentCount, demo: true },
    });

    return Response.json({
      success: true,
      demo: true,
      message: `Subscription activated! ${plan.name} plan (${cycle}) — ₦${totalAmount.toLocaleString()}`,
      subscription: {
        plan: planId,
        cycle,
        status: "active",
        amount: totalAmount,
        currentPeriodEnd: periodEnd.toISOString(),
      },
    });
  }

  // Production mode — initialize real Paystack checkout
  const { users: adminUsers } = await store.listUsers({ schoolId, role: "SUPER_ADMIN", limit: 1 });
  const admin = adminUsers?.[0];
  if (!admin) {
    return Response.json({ error: "No admin found for school" }, { status: 400 });
  }

  // Create or retrieve Paystack customer
  const customer = await createCustomer({
    email: admin.email,
    name: school.name,
    code: school.paystackCustomerCode || undefined,
  });
  if (!customer.success) {
    return Response.json({ error: customer.error }, { status: 500 });
  }

  // Update customer code on school
  if (customer.customerCode !== school.paystackCustomerCode) {
    await store.updateSchoolSubscription(schoolId, {
      paystackCustomerCode: customer.customerCode,
    });
  }

  // Create Paystack plan
  const planName = `EduTrack ${plan.name} (${cycle})`;
  const paystackPlan = await createPlan({
    name: planName,
    amount: totalAmount,
    interval: cycle,
  });
  if (!paystackPlan.success) {
    return Response.json({ error: paystackPlan.error }, { status: 500 });
  }

  // Save plan code
  await store.updateSchoolSubscription(schoolId, {
    paystackPlanCode: paystackPlan.planCode,
    billingPlan: planId,
    billingCycle: cycle,
  });

  // Initialize transaction
  const reference = generateReference("SUB");
  const callbackUrl = `${new URL(req.url).origin}/api/billing/verify?ref=${reference}&sid=${schoolId}`;

  const tx = await initializeTransaction({
    amount: totalAmount,
    email: admin.email,
    reference,
    callbackUrl,
    metadata: {
      school_id: schoolId,
      school_name: school.name,
      plan_id: planId,
      plan_name: plan.name,
      cycle,
      student_count: studentCount,
      purpose: "saas_subscription",
    },
  });

  if (!tx.success) {
    return Response.json({ error: tx.error }, { status: 500 });
  }

  return Response.json({
    success: true,
    authorizationUrl: tx.authorizationUrl,
    accessCode: tx.accessCode,
    reference: tx.reference,
    amount: totalAmount,
    plan: plan.name,
    cycle,
  });
}
