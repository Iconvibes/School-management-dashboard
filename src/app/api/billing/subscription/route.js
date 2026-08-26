import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/billing/subscription
 * Get the current school's subscription details.
 */
export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (isDenied(session)) return session;

  const school = await store.getSchoolById(session.schoolId);
  if (!school) {
    return Response.json({ error: "School not found" }, { status: 404 });
  }

  return Response.json({
    billingPlan: school.billingPlan || "trial",
    billingCycle: school.billingCycle || "monthly",
    subscriptionStatus: school.subscriptionStatus || "trial",
    currentPeriodEnd: school.currentPeriodEnd || null,
    trialStart: school.trialStart || null,
    trialEnd: school.trialEnd || null,
  });
}
