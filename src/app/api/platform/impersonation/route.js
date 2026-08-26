import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/impersonation
 * List impersonation sessions with optional filters.
 * Query params: schoolId, impersonatorId, limit, offset
 */
export async function GET(req) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  const url = new URL(req.url);
  const schoolId = url.searchParams.get("schoolId") || undefined;
  const impersonatorId = url.searchParams.get("impersonatorId") || undefined;
  const limit = url.searchParams.has("limit") ? parseInt(url.searchParams.get("limit")) : 50;
  const offset = url.searchParams.has("offset") ? parseInt(url.searchParams.get("offset")) : 0;

  const result = await store.getImpersonationSessions({ schoolId, impersonatorId, limit, offset });

  // Compute summary stats
  const activeCount = result.sessions.filter(s => s.status === "active").length;
  const totalSessions = result.total;
  const totalDuration = result.sessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  const avgDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;

  return Response.json({
    ...result,
    stats: {
      totalSessions,
      activeSessions: activeCount,
      completedSessions: totalSessions - activeCount,
      avgDurationMs: avgDuration,
    }
  });
}
