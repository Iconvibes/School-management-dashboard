import { store } from "@/lib/store";
import { isDenied, requireAuth } from "@/lib/policy";

export async function GET() {
  const session = await requireAuth(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  const stats = await store.getDashboardStats(session.schoolId);
  return Response.json({ stats });
}
