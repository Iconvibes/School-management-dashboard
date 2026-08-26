import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * PATCH /api/platform/alerts/read
 * Mark alerts as read.
 * Body: { ids?: string[] } — marks specific alerts. If ids is empty/missing, marks ALL as read.
 */
export async function PATCH(req) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.ids && body.ids.length > 0) {
    await store.markAlertsRead(body.ids);
  } else {
    await store.markAllAlertsRead();
  }

  const unreadCount = await store.getUnreadAlertCount();
  return Response.json({ success: true, unreadCount });
}
