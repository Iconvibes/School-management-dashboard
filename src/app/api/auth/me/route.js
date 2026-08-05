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
      payrollStatus: user.payrollStatus,
      feePaid: user.feePaid,
    },
    school: {
      id: school?.id || session.schoolId,
      name: school?.name || "",
      logoUrl: school?.logoUrl || "",
      brandColor: school?.brandColor || "#2563EB",
      activeArms: school?.activeArms || [],
      currentSession: school?.currentSession || "",
      currentTerm: school?.currentTerm || "",
    },
    isDemo: isDemoMode(),
  });
}
