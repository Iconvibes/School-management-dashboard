import { store } from "@/lib/store";

/**
 * Public directory of registered schools — used by the universal login page
 * so a teacher/student can find THEIR school and sign into its tenant only.
 * Only minimal public metadata (id + name + branding) is exposed.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const limit = Math.min(20, Number(searchParams.get("limit")) || 8);

  const schools = await store.searchSchools(search, limit);
  return Response.json({ schools });
}
