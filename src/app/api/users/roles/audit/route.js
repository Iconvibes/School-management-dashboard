import { store } from "@/lib/store";
import { isDenied, requirePermission, ROLES } from "@/lib/policy";

/**
 * GET /api/users/roles/audit — the role-change audit trail for this school,
 * newest first. SUPER_ADMIN only (roles.manage): who re-rolled whom, when.
 */
export async function GET() {
  const session = await requirePermission([ROLES.SUPER_ADMIN], "roles.manage");
  if (isDenied(session)) return session;

  const entries = await store.listRoleAudit(session.schoolId, { limit: 100 });
  return Response.json({ entries });
}
