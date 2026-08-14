import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/notifications
 * The school admin's inbox — email-style notifications (e.g. "a parent paid").
 * notifications.view (SUPER_ADMIN), scoped to the caller's school.
 *
 * Auto-archive keeps the inbox lean: anything older than the school's
 * notificationRetentionDays is hidden from the inbox (it stays in history,
 * visible via ?view=archived). The `unread` count ALWAYS reflects the inbox
 * view, so the sidebar badge stays correct whichever tab is open.
 */
export async function GET(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "notifications.view");
  if (isDenied(session)) return session;

  const view = new URL(request.url).searchParams.get("view") === "archived" ? "archived" : "inbox";

  // Read state is PER ADMIN — each SUPER_ADMIN sees their own unread count,
  // not the school's shared one.
  const [inbox, archived] = await Promise.all([
    store.listNotifications(session.schoolId, session.userId),
    store.listNotifications(session.schoolId, session.userId, { view: "archived" }),
  ]);
  const unread = inbox.filter((n) => !n.read).length;
  const notifications = view === "archived" ? archived : inbox;

  return Response.json({ notifications, unread });
}
