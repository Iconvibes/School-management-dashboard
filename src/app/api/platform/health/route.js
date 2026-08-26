import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/health
 * Get platform health dashboard data (platform admin only).
 * Returns: response time stats, error rates, endpoint breakdown, DB size.
 */
export async function GET(req) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  const dashboard = await store.getHealthDashboard();
  return Response.json(dashboard);
}

/**
 * POST /api/platform/health
 * Record a health metric (platform admin or system).
 * Body: { type, endpoint, method, value, statusCode, errorMessage, meta }
 */
export async function POST(req) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { type, endpoint, method, value, statusCode, errorMessage, meta } = body;

  if (!type) {
    return Response.json({ error: "type is required" }, { status: 400 });
  }

  const entry = await store.recordHealthMetric({
    type,
    endpoint,
    method,
    value,
    statusCode,
    errorMessage,
    meta,
  });

  return Response.json({ success: true, entry });
}
