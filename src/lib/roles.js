/**
 * Role-management policy — pure data + validation, no imports beyond the
 * permission matrix, so both the API route and tests share one decision.
 *
 * Re-rolling is staff-to-staff only: a student or parent account becomes
 * staff through the normal account-creation flow, never through this path.
 */
import { ROLES } from "@/lib/permissions";

/**
 * The only roles role management may touch — exactly the staff set (the
 * roles who hold consequential power in a school: the three console roles
 * plus TEACHER). Students and parents are never re-rolled through this path.
 */
export const MANAGED_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.BURSAR,
  ROLES.REGISTRAR,
  ROLES.TEACHER,
]);

export const ROLE_LABELS = Object.freeze({
  SUPER_ADMIN: "Super Admin",
  BURSAR: "Bursar",
  REGISTRAR: "Registrar",
  TEACHER: "Teacher",
});

/**
 * Decide whether a role change may proceed.
 *
 * @param {Object} input
 * @param {string} input.actorId       the signed-in user's id
 * @param {Object} input.target        the user being re-rolled ({ id, role, name })
 * @param {string} input.newRole       the requested role (uppercase enum)
 * @param {number} input.superAdminCount  SUPER_ADMINs in the target's school
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function evaluateRoleChange({ actorId, target, newRole, superAdminCount }) {
  if (!target) return { ok: false, error: "User not found" };
  if (!MANAGED_ROLES.includes(target.role)) {
    return { ok: false, error: "Only staff accounts can be re-rolled" };
  }
  if (!MANAGED_ROLES.includes(newRole)) {
    return { ok: false, error: "New role must be a staff role" };
  }
  if (target.id === actorId) {
    return { ok: false, error: "You can't change your own role" };
  }
  if (target.role === newRole) {
    return { ok: false, error: "Role is already " + newRole };
  }
  // A school must always keep at least one account that can administer it.
  // Number() so an undefined/malformed count fails closed (never "<= 1").
  if (target.role === ROLES.SUPER_ADMIN && !(Number(superAdminCount) > 1)) {
    return { ok: false, error: "A school must keep at least one Super Admin" };
  }
  return { ok: true };
}
