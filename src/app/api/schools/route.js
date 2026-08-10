import { store } from "@/lib/store";

/**
 * Public directory of registered schools — used by the universal login page
 * so a teacher/student can find THEIR school and sign into its tenant only.
 * Only minimal public metadata (id + name + branding + status) is exposed.
 *
 * ?id=<schoolId> returns just that school (fresh status check when the login
 * page restores a previously-used school or re-validates a picked one).
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const limit = Math.min(20, Number(searchParams.get("limit")) || 8);

  const id = searchParams.get("id") || "";
  if (id) {
    const school = await store.getSchoolById(id);
    return Response.json({
      schools: school
        ? [
            {
              id: school.id,
              name: school.name || "",
              logoUrl: school.logoUrl || "",
              brandColor: school.brandColor || "#2563EB",
              status: school.status || "active",
            },
          ]
        : [],
    });
  }

  const schools = await store.searchSchools(search, limit);
  return Response.json({ schools });
}
