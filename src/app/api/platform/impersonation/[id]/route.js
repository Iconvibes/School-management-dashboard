import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/impersonation/:id
 * Get detailed info for a specific impersonation session,
 * including all audit log entries that occurred during the session.
 */
export async function GET(req, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  const { id } = await params;
  const detail = await store.getImpersonationSessionDetail(id);

  if (!detail) {
    return Response.json({ error: "Impersonation session not found" }, { status: 404 });
  }

  return Response.json({ session: detail });
}
