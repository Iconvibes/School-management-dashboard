import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/notifications
 * The school admin's inbox — email-style notifications (e.g. "a parent paid").
 * notifications.view (SUPER_ADMIN), scoped to the caller's school.
 */
export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN"], "notifications.view");
  if (isDenied(session)) return session;

  // Read state is PER ADMIN — each SUPER_ADMIN sees their own unread count,
  // not the school's shared one.
  const notifications = await store.listNotifications(session.schoolId, session.userId);
  const unread = notifications.filter((n) => !n.read).length;

  return Response.json({ notifications, unread });
}
