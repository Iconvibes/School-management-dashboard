import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * POST /api/notifications/delete
 * Body: { ids: string[] } — SOFT-delete those notifications from the admin's
 * inbox (the cleanup for an inbox that would otherwise grow forever).
 * notifications.view (SUPER_ADMIN), scoped to the caller's school.
 *
 * Deletion is admin-inbox-only: the notification is stamped adminDeletedAt
 * and hidden from every staff view, but a parent's or student's own reminder
 * copy is never removed — clearing the admin inbox can't unsend a reminder.
 * Sending an empty array is a no-op (returns deleted: 0) — the UI sends the
 * full current id list for its "Clear all". Already-hidden ids count zero,
 * so retrying is harmless.
 *
 * Returns { deleted } — how many were newly hidden from the admin inbox.
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "notifications.view");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
  const deleted = await store.deleteNotifications(session.schoolId, ids);
  return Response.json({ deleted });
}
