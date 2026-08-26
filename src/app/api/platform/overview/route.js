import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/overview
 * Platform-wide overview: all schools with user counts, status breakdown.
 * PLATFORM_ADMIN only.
 */
export async function GET() {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  // Get all schools
  const schools = await store.listSchoolIds();
  
  // Get stats for each school
  const schoolDetails = await Promise.all(
    schools.map(async (schoolId) => {
      const school = await store.getSchoolById(schoolId);
      if (!school) return null;
      
      const users = await store.listUsers({ schoolId });
      const students = users.filter(u => u.role === "STUDENT");
      const teachers = users.filter(u => u.role === "TEACHER");
      const parents = users.filter(u => u.role === "PARENT");
      
      return {
        id: school.id,
        name: school.name,
        brandColor: school.brandColor || "#2563EB",
        status: school.status || "active",
        studentCount: students.length,
        teacherCount: teachers.length,
        parentCount: parents.length,
        createdAt: school.createdAt,
        currentSession: school.currentSession,
        currentTerm: school.currentTerm,
        billingPlan: school.billingPlan || "trial",
        subscriptionStatus: school.subscriptionStatus || "trial",
        isPlatformSchool: !!school.isPlatformSchool,
      };
    })
  );

  // Filter out platform internal school (not a real tenant)
  const validSchools = schoolDetails.filter((s) => s && !s.isPlatformSchool);
  const totalStudents = validSchools.reduce((acc, s) => acc + s.studentCount, 0);
  const totalTeachers = validSchools.reduce((acc, s) => acc + s.teacherCount, 0);
  const totalParents = validSchools.reduce((acc, s) => acc + s.parentCount, 0);

  return Response.json({
    totalSchools: validSchools.length,
    totalStudents,
    totalTeachers,
    totalParents,
    schools: validSchools,
  });
}
