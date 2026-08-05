import { isDemoMode } from "@/lib/store";

/**
 * GET /api/health — public liveness probe for load balancers / uptime
 * monitors. Cheap and side-effect free: no database access, no auth.
 */
export async function GET() {
  return Response.json({
    status: "ok",
    service: "edutrack",
    isDemo: isDemoMode(),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
