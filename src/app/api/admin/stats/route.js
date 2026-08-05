import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

  const stats = await store.getDashboardStats(session.schoolId);
  return Response.json({ stats });
}
