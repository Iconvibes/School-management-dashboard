import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/audit/heatmap
 * Returns daily audit activity counts for the last 90 days (for the heatmap).
 * Response: { days: [{ date: "2025-01-01", count: 5 }, ...], maxCount: 12 }
 */
export async function GET() {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  const data = await store.getAuditHeatmap();
  return Response.json(data);
}
