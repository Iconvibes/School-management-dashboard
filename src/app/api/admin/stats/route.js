import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR"], "stats.view");
  if (isDenied(session)) return session;

  const stats = await store.getDashboardStats(session.schoolId);
  return Response.json({ stats });
}
