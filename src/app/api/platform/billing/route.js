import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { SAAS_PLANS, calculateSaaSPrice } from "@/lib/paystack";

/**
 * GET /api/platform/billing
 * Platform admin billing overview — all schools, plans, and revenue.
 */
export async function GET() {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.revenue");
  if (isDenied(session)) return session;

  const allSchools = await store.listSchoolSubscriptions();
  // Filter out platform internal school (not a real tenant)
  const schools = allSchools.filter((s) => !s.isPlatformSchool);

  let totalMRR = 0;
  let totalARR = 0;
  const enriched = [];

  for (const sub of schools) {
    const students = await store.listUsers({ schoolId: sub.id, role: "STUDENT" });
    const studentCount = students.length;
    const monthlyPrice = calculateSaaSPrice(sub.billingPlan, "monthly", studentCount);
    const annualPrice = calculateSaaSPrice(sub.billingPlan, "annual", studentCount);

    if (sub.subscriptionStatus === "active") {
      totalMRR += monthlyPrice;
      totalARR += annualPrice;
    }

    const now = new Date();
    const trialEnd = sub.trialEnd ? new Date(sub.trialEnd) : null;
    const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))) : 0;

    enriched.push({
      ...sub,
      studentCount,
      monthlyPrice,
      annualPrice,
      trialDaysLeft,
      isTrialExpired: trialEnd ? now > trialEnd : false,
    });
  }

  return Response.json({
    plans: SAAS_PLANS,
    schools: enriched,
    totals: {
      totalMRR,
      totalARR,
      activeSubscriptions: enriched.filter((s) => s.subscriptionStatus === "active").length,
      trialSchools: enriched.filter((s) => s.subscriptionStatus === "trial").length,
      cancelledSchools: enriched.filter((s) => s.subscriptionStatus === "cancelled").length,
    },
  });
}
