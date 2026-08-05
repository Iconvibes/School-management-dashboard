/**
 * Authorization policy — the single seam for "who may do what" in the API.
 *
 * Route handlers previously re-typed three things: the 401/403 role gate
 * (in ~20 handlers), the teacher class-arm policy (in 6 handlers, with four
 * drifted error messages), and the parent/tenant scope checks. All of it now
 * lives here, so a policy change has one edit site instead of many.
 *
 * Convention: every guard returns either the thing you asked for, or a
 * `Response` the route should return immediately — test with `isDenied()`:
 *
 *   const session = await requireAuth(["SUPER_ADMIN", "TEACHER"]);
 *   if (isDenied(session)) return session;
 */

import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";

/** Canonical roles (mirrors the User model's role enum). */
export const ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  TEACHER: "TEACHER",
  PARENT: "PARENT",
  STUDENT: "STUDENT",
});

/** Shared policy copy — one message instead of the four that drifted apart. */
const MSG = Object.freeze({
  unassigned: "You have not been assigned a class arm yet. Contact your school admin.",
  teachersScope: "Teachers can only access their assigned class",
});

/** True when a guard returned a Response the route should return. */
export function isDenied(result) {
  return result instanceof Response;
}

/**
 * Session + optional role gate in one call.
 *
 * @param {string[]} [roles]  allowed roles; omit for "any authenticated user"
 * @returns {Promise<Object|Response>} the session, or a 401/403 Response
 */
export async function requireAuth(roles) {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (roles && !roles.includes(session.role)) return jsonError("Forbidden", 403);
  return session;
}

/**
 * Teacher class-arm policy. SUPER_ADMIN and other non-teachers pass through
 * untouched; the acting TEACHER account is loaded and scoped.
 *
 * @param {Object} session
 * @param {Object} opts
 * @param {string} [opts.classArm]  the arm the request asks to operate on
 * @param {"validate"|"resolve"|"force"} [opts.mode="validate"]
 *   - "validate": the target must be THIS exact arm. An assigned teacher must
 *     match it (including `undefined` — a student with no arm never matches);
 *     an unassigned teacher is denied. Used where the arm is the request's own
 *     claim (attendance registers) or the target's own attribute (report cards).
 *   - "resolve": compute the effective arm. An assigned teacher is locked to
 *     their own arm (a different requested arm is denied); the unassigned
 *     outcome depends on `unassigned`. Used where the route needs the arm back.
 *   - "force": an assigned teacher's own arm always wins, whatever was
 *     requested. Used when the request's arm is untrusted (creating users).
 * @param {"deny"|"require-arm"|"allow"} [opts.unassigned="deny"]
 *   What an unassigned teacher may do:
 *   - "deny":        no class access until assigned.
 *   - "require-arm": may proceed, but only when an explicit arm was given.
 *   - "allow":       may proceed with whatever arm (or none) was given.
 * @returns {Promise<{classArm?: string, teacher: Object|null}|Response>}
 */
export async function requireClassScope(session, { classArm, mode = "validate", unassigned = "deny" } = {}) {
  if (session.role !== ROLES.TEACHER) return { classArm, teacher: null };

  const teacher = await store.findUserById(session.userId);
  if (!teacher) return jsonError("Account no longer exists", 401);

  if (teacher.assignedClass) {
    if (mode === "force") return { classArm: teacher.assignedClass, teacher };
    if (mode === "validate" && classArm !== teacher.assignedClass) {
      return jsonError(MSG.teachersScope, 403);
    }
    if (mode === "resolve" && classArm !== undefined && classArm !== teacher.assignedClass) {
      return jsonError(MSG.teachersScope, 403);
    }
    return { classArm: teacher.assignedClass, teacher };
  }

  if (unassigned === "deny") return jsonError(MSG.unassigned, 403);
  if (unassigned === "require-arm" && !classArm) return jsonError(MSG.unassigned, 403);
  return { classArm, teacher };
}

/**
 * Parent scope: 403 unless `studentId` is one of this parent's linked children.
 * Returns the child on success (routes often need it), or a Response. For any
 * non-PARENT session (admin, teacher) it returns null — the rule simply does
 * not apply to them, so callers may invoke it without a role check.
 *
 * @param {string} [message]  custom 403 copy for the specific screen
 */
export async function requireOwnChild(session, studentId, message) {
  if (session.role !== ROLES.PARENT) return null;
  const children = await store.getChildren(session.userId);
  const child = children.find((c) => c.id === studentId);
  if (!child) return jsonError(message || "You can only access your own children's records", 403);
  return child;
}

/**
 * Tenant isolation: 403 unless the target user belongs to the caller's school.
 * Returns null on success, or a Response. (Callers keep their own 404 handling
 * for a missing target, so "not found" stays distinct from "forbidden".)
 */
export function assertSameTenant(target, session) {
  if (!target || target.schoolId !== session.schoolId) return jsonError("Forbidden", 403);
  return null;
}
