import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/alerts
 * List platform alerts with optional filters.
 * Query params: ?type=...&unread=true&limit=50
 */
export async function GET(req) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || undefined;
  const unreadOnly = url.searchParams.get("unread") === "true";
  const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")) : undefined;

  const alerts = await store.listPlatformAlerts({ type, unreadOnly, limit });
  const unreadCount = await store.getUnreadAlertCount();

  return Response.json({ alerts, unreadCount });
}

/**
 * POST /api/platform/alerts
 * Create a new platform alert (platform admin only).
 */
export async function POST(req) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { schoolId, schoolName, type, severity, title, message, meta } = body;
  if (!type || !title) {
    return Response.json({ error: "type and title are required" }, { status: 400 });
  }

  const alert = await store.createPlatformAlert({
    schoolId, schoolName, type, severity, title, message, meta,
  });

  return Response.json({ alert }, { status: 201 });
}
