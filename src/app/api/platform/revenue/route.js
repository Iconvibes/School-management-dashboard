import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/revenue
 * Platform-wide revenue metrics: fee collection across all schools.
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
      };
    })
  );

  // Filter out platform internal school (not a real tenant)
  const validSchools = schoolRevenue.filter((s) => s && !s.isPlatformSchool);
  
  // Calculate platform totals
  const totalBilled = validSchools.reduce((acc, s) => acc + s.totalBilled, 0);
  const totalCollected = validSchools.reduce((acc, s) => acc + s.totalCollected, 0);
  const totalOutstanding = validSchools.reduce((acc, s) => acc + s.totalOutstanding, 0);

  return Response.json({
    totalBilled,
    totalCollected,
    totalOutstanding,
    schools: validSchools,
  });
}
