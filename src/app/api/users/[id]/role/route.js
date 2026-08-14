import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import {
  assertSameTenant,
  invalidateAuthSnapshot,
  isDenied,
  requirePermission,
  ROLES,
} from "@/lib/policy";
import { evaluateRoleChange } from "@/lib/roles";

/**
 * PATCH /api/users/[id]/role — re-roll a staff account.
 *
 * SUPER_ADMIN only (roles.manage). The change takes effect immediately on the
 * target's NEXT request: sessions re-validate against the store (policy.js
 * requireAuth), so their old token stops working and they must sign in again.
 * Every change is written to the role audit trail.
 *
 * Deliberately a dedicated endpoint: the generic user PATCH route cannot
 * change roles (it does not accept a `role` field), so there is exactly one
 * way to re-roll an account and it always leaves a trail.
 */
export async function PATCH(request, { params }) {
  const session = await requirePermission([ROLES.SUPER_ADMIN], "roles.manage");
  if (isDenied(session)) return session;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const newRole = String(body.role || "").trim().toUpperCase();

  // Note: the last-super-admin count is checked here, before the update — a
  // TOCTOU race between two concurrent demotions could still clear the last
  // two admins in Mongo mode. Acceptable at this concurrency level; a proper
  // fix would re-check inside a transaction.
  const [target, actor, superAdmins] = await Promise.all([
    store.findUserById(id),
    store.findUserById(session.userId),
    store.listUsers({ schoolId: session.schoolId, role: ROLES.SUPER_ADMIN }),
  ]);
  if (!target) return jsonError("User not found", 404);
  const tenantErr = assertSameTenant(target, session);
  if (tenantErr) return tenantErr;

  const decision = evaluateRoleChange({
    actorId: session.userId,
    target,
    newRole,
    superAdminCount: superAdmins.length,
  });
  if (!decision.ok) return jsonError(decision.error, 400);

  const user = await store.updateRole(id, newRole);
  if (!user) return jsonError("User not found", 404);

  // Drop the target's cached auth snapshot: the role is part of it, and the
  // new role must gate the target's very next request (a re-rolled account's
  // old token stops working immediately — requireAuth sees the fresh role and
  // the claim mismatch, and forces a re-login).
  await invalidateAuthSnapshot(id);

  await store.logRoleAudit({
    schoolId: session.schoolId,
    actorId: session.userId,
    actorName: actor?.name || "Unknown",
    actorRole: session.role,
    targetId: target.id,
    targetName: target.name,
    fromRole: target.role,
    toRole: newRole,
  });

  return Response.json({ success: true, user });
}
