import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * EduTrack SaaS plan definitions (must match src/lib/paystack.js).
 * Prices in Naira; per student per cycle.
 */
const SAAS_PLANS = [
  { id: "trial", name: "Trial", monthlyPrice: 0, annualPrice: 0 },
  { id: "starter", name: "Starter", monthlyPrice: 150, annualPrice: 1000 },
  { id: "standard", name: "Standard", monthlyPrice: 350, annualPrice: 2500 },
  { id: "enterprise", name: "Enterprise", monthlyPrice: 0, annualPrice: 0 },
];

function getPlanPrice(planId, cycle, studentCount) {
  const plan = SAAS_PLANS.find((p) => p.id === planId);
  if (!plan || planId === "enterprise" || planId === "trial") return 0;
  const perStudent = cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
  return perStudent * studentCount;
}

/**
 * GET /api/platform/revenue
 * Platform-wide revenue metrics: SaaS subscription + fee collection across all schools.
 * PLATFORM_ADMIN only.
 */
export async function GET() {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.revenue");
  if (isDenied(session)) return session;

  // Get all schools
  const schoolIds = await store.listSchoolIds();
  
  // Get fee data for each school
  const schoolRevenue = await Promise.all(
    schoolIds.map(async (schoolId) => {
      const school = await store.getSchoolById(schoolId);
      if (!school) return null;

      // Get fee ledger for this school
      const ledger = await store.getFeeLedger(schoolId);
      
      const totalBilled = ledger.reduce((acc, entry) => acc + (entry.amount || 0), 0);
      const totalCollected = ledger.reduce((acc, entry) => acc + (entry.paid || 0), 0);
      const totalOutstanding = ledger.reduce((acc, entry) => acc + (entry.balance || 0), 0);
      
      // Count students
      const users = await store.listUsers({ schoolId, role: "STUDENT" });
      
      return {
        id: school.id,
        name: school.name,
        brandColor: school.brandColor || "#2563EB",
        status: school.status || "active",
        studentCount: users.length,
        totalBilled,
        totalCollected,
        totalOutstanding,
        isPlatformSchool: !!school.isPlatformSchool,
        billingPlan: school.billingPlan || "trial",
        billingCycle: school.billingCycle || "monthly",
        subscriptionStatus: school.subscriptionStatus || "trial",
        currentPeriodEnd: school.currentPeriodEnd || null,
        trialEnd: school.trialEnd || null,
      };
    })
  );

  // Filter out platform internal school (not a real tenant)
  const validSchools = schoolRevenue.filter((s) => s && !s.isPlatformSchool);
  
  // Calculate platform totals (fee collection)
  const totalBilled = validSchools.reduce((acc, s) => acc + s.totalBilled, 0);
  const totalCollected = validSchools.reduce((acc, s) => acc + s.totalCollected, 0);
  const totalOutstanding = validSchools.reduce((acc, s) => acc + s.totalOutstanding, 0);

  // ── SaaS Subscription Metrics ───────────────────────────────────
  const planCounts = {};
  let mrr = 0;
  let arr = 0;
  let activeSubscriptions = 0;
  let trialSchools = 0;
  let expiredSchools = 0;
  let cancelledSchools = 0;

  for (const school of validSchools) {
    const planId = school.billingPlan || "trial";
    const cycle = school.billingCycle || "monthly";
    const status = school.subscriptionStatus || "trial";
    const studentCount = school.studentCount || 0;

    // Count plans
    planCounts[planId] = (planCounts[planId] || 0) + 1;

    // Calculate MRR contribution
    if (status === "active" && planId !== "trial") {
      const monthlyRevenue = getPlanPrice(planId, "monthly", studentCount);
      mrr += monthlyRevenue;
      arr += getPlanPrice(planId, "annual", studentCount);
      activeSubscriptions++;
    } else if (status === "trial") {
      trialSchools++;
    } else if (status === "expired" || status === "cancelled") {
      expiredSchools++;
      if (status === "cancelled") cancelledSchools++;
    }
  }

  return Response.json({
    // Fee collection metrics
    totalBilled,
    totalCollected,
    totalOutstanding,
    schools: validSchools,
    // SaaS subscription metrics
    mrr,
    arr,
    activeSubscriptions,
    trialSchools,
    expiredSchools,
    cancelledSchools,
    planCounts,
  });
}
