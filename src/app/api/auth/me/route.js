import { jsonError } from "@/lib/auth";
import { store, isDemoMode } from "@/lib/store";
import { isDenied, requireAuth } from "@/lib/policy";

export async function GET() {
  const session = await requireAuth();
  if (isDenied(session)) return session;

  const [user, school] = await Promise.all([
    store.findUserById(session.userId),
    store.getSchoolById(session.schoolId),
  ]);

  if (!user) return jsonError("Account no longer exists", 401);

  return Response.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      assignedClass: user.assignedClass || "",
      // Subject-specialist teaching scope — the teacher dashboard renders its
      // arm/subject selectors from these (only what this teacher teaches).
      subjects: Array.isArray(user.subjects) ? user.subjects : [],
      assignedClasses: Array.isArray(user.assignedClasses) ? user.assignedClasses : [],
      payrollStatus: user.payrollStatus,
      feePaid: user.feePaid,
    },
    school: {
      id: school?.id || session.schoolId,
      name: school?.name || "",
      logoUrl: school?.logoUrl || "",
      sealUrl: school?.sealUrl || "",
      brandColor: school?.brandColor || "#2563EB",
      // "active" | "frozen" | "deleted" — drives the deactivated/restore
      // banners on the admin dashboard.
      status: school?.status || "active",
      // Start of the 30-day recovery window for a deleted school (the banner
      // shows it and the deadline).
      deletedAt: school?.deletedAt || null,
      activeArms: school?.activeArms || [],
      currentSession: school?.currentSession || "",
      currentTerm: school?.currentTerm || "",
      // Drives the /onboarding skip-if-complete redirect (page-level check).
      onboardingComplete: school?.onboardingComplete || false,
      // The bell schedule — periodTimes (teaching bells), breakTimes (the
      // mid-day break) and per-weekday overrides (dailySchedules, e.g. a
      // Friday that ends at period 6) so the dashboards' day timelines
      // render the real school day straight from the session.
      periodTimes: school?.periodTimes || [],
      breakTimes: school?.breakTimes || undefined,
      dailySchedules: school?.dailySchedules || undefined,
    },
    isDemo: isDemoMode(),
  });
}
