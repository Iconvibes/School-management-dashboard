import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * POST /api/notifications/read
 * Body: { ids: string[] } — mark those notifications read for the school.
 * notifications.view (SUPER_ADMIN). Returns the remaining unread count.
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

  const ids = Array.isArray(body?.ids) ? body.ids : [];
  // Read state is per admin: the caller's id joins each notification's readBy,
  // so the returned unread count is only theirs.
  const unread = await store.markNotificationsRead(session.schoolId, session.userId, ids);
  return Response.json({ unread });
}
