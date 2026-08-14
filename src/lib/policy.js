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
import { cacheDel, cacheDelMany, cacheGet, cacheSet } from "@/lib/cache";
import {
  can,
  mayEditUser,
  mayResetPassword,
  ROLES,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
} from "@/lib/permissions";

export { can, mayEditUser, mayResetPassword, ROLES, ROLE_PERMISSIONS, STAFF_ROLES };

/** Shared policy copy — one message instead of the four that drifted apart. */
const MSG = Object.freeze({
  unassigned: "You have not been assigned a class arm yet. Contact your school admin.",
  teachersScope: "Teachers can only access their assigned class",
  sessionInvalid: "Session no longer valid. Please sign in again.",
});

/** True when a guard returned a Response the route should return. */
export function isDenied(result) {
  return result instanceof Response;
}

// ---- Auth-snapshot cache (traffic audit §6.2) -------------------------------
//
// The per-request revalidation is the hottest read in the app at 08:00 — the
// same user's /api/auth/me hits again and again — so the lean snapshot is
// cached for 60s. The cache is tokenVersion-aware: a snapshot is only served
// when its version matches the token's claim, so ANY version bump forces a
// fresh fetch even if the matching cacheDel was missed. The explicit DELs
// below make password changes, role re-rolls and school freezes take effect
// instantly; the version check + TTL are the safety net.
const AUTH_SNAPSHOT_TTL_SECONDS = 60;
const authSnapshotKey = (userId) => `auth:${userId}`;

/**
 * The user row for the auth guard, cached when a cache driver is active.
 * Returns the lean snapshot (no PII — findAuthSnapshot already selects only
 * role/schoolId/arms/tokenVersion and the school status is re-read by the
 * store call itself), or null when the account is gone.
 */
async function loadAuthSnapshot(userId, tokenVersion) {
  const key = authSnapshotKey(userId);
  const cached = await cacheGet(key);
  if (cached && (cached.tokenVersion || 0) === (tokenVersion || 0)) {
    return cached;
  }
  const user = await store.findAuthSnapshot(userId);
  if (user) await cacheSet(key, user, AUTH_SNAPSHOT_TTL_SECONDS);
  return user;
}

/**
 * Drop one account's cached snapshot — call after any change that alters
 * what the snapshot carries (password change, role re-roll, scope edits).
 */
export async function invalidateAuthSnapshot(userId) {
  await cacheDel(authSnapshotKey(userId));
}

/**
 * Drop every cached snapshot in a school — a freeze, restore or deletion
 * changes schoolStatus for ALL users, so a cached "active" snapshot must
 * never outlive the flip. Runs on the rare admin status route, so the
 * per-user id list is a one-off cost.
 */
export async function invalidateSchoolAuthSnapshots(schoolId) {
  const ids = await store.getSchoolUserIds(schoolId);
  if (ids.length) await cacheDelMany(ids.map(authSnapshotKey));
}

/**
 * Session + optional role gate, re-validated against the store on EVERY call.
 *
 * The JWT is only a ticket — the database is the truth. Before honoring a
 * session we re-check that the account still exists and that the token's
 * role/schoolId claims still match the live record, so demotions, school
 * moves and deleted accounts take effect immediately instead of at the
 * 7-day token expiry. A mismatch invalidates the session (401) and the user
 * must sign in again.
 *
 * @param {string[]} [roles]  allowed roles; omit for "any authenticated user"
 * @param {Object} [session]  session to validate. Normally read from the
 *   cookie via getSession(); tests inject a fake one to skip cookie plumbing.
 * @returns {Promise<Object|Response>} the session, or a 401/403 Response
 */
export async function requireAuth(roles, session) {
  // Only read the cookie when the caller didn't supply a session. A cookie
  // read that fails (e.g. outside a request scope) means "not authenticated"
  // and must never become a 500.
  if (session === undefined) {
    session = await getSession().catch(() => null);
  }
  if (!session) return jsonError("Not authenticated", 401);

  // P1: the store is the source of truth. String() normalizes Mongo ObjectIds
  // and demo string ids so both stores compare cleanly. A malformed userId
  // (e.g. a non-ObjectId in Mongo, which throws) must fail closed as 401,
  // never 500.
  //
  // findAuthSnapshot returns ONLY role/schoolId/assignedClass (select + lean
  // in Mongo, no PII decrypt) — this guard runs on EVERY authed request, so
  // at 10k concurrent users it must not pay for the full user shape.
  let user;
  try {
    user = await loadAuthSnapshot(session.userId, session.tokenVersion);
  } catch {
    return jsonError(MSG.sessionInvalid, 401);
  }
  if (!user) return jsonError(MSG.sessionInvalid, 401);
  if (String(user.schoolId) !== String(session.schoolId) || user.role !== session.role) {
    return jsonError(MSG.sessionInvalid, 401);
  }
  // Session revocation: a password change bumps the account's tokenVersion,
  // so every token signed before it (including a stolen one) fails here on
  // its very next use. Both sides normalize to 0, so legacy tokens (issued
  // without a version claim) stay valid while the account is at version 0.
  if ((user.tokenVersion || 0) !== (session.tokenVersion || 0)) {
    return jsonError(MSG.sessionInvalid, 401);
  }

  // Gate on the FRESH role from the store, never the token claim.
  if (roles && !roles.includes(user.role)) return jsonError("Forbidden", 403);

  // A frozen (soft-deactivated) or deleted (grace-period) school rejects
  // every request from non-super admins — already-issued sessions die on
  // their very next call. The SUPER_ADMIN is always allowed through so the
  // account can be reactivated or restored from the dashboard. (An expired
  // deleted school is purged, so its users no longer exist and this session
  // lookup fails closed with a 401.)
  if (user.schoolStatus !== "active" && user.role !== "SUPER_ADMIN") {
    return jsonError(
      user.schoolStatus === "frozen"
        ? "This school's account has been deactivated. Please contact your school administrator."
        : "This school's account has been deleted. Please contact your school administrator.",
      403
    );
  }
  return { ...session, role: user.role, schoolId: user.schoolId };
}

/**
 * Role list + action permission in one gate.
 *
 *   const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.record");
 *   if (isDenied(session)) return session;
 *
 * Keeps the positional requireAuth style while letting one endpoint be split
 * into finer gates (record vs. confirm vs. structure edits). Inherits the
 * session re-validation from requireAuth, so the action check always runs
 * against the fresh store role.
 *
 * @param {Object} [session]  optional injected session (tests)
 */
export async function requirePermission(roles, action, session) {
  session = await requireAuth(roles, session);
  if (isDenied(session)) return session;
  if (!can(session.role, action)) return jsonError("Forbidden", 403);
  return session;
}

/**
 * Teacher teaching-scope policy — the subject-specialist model. SUPER_ADMIN
 * and other non-teachers pass through untouched; the acting TEACHER account
 * is loaded and scoped to SUBJECTS × CLASS ARMS: one Mathematics teacher
 * covers all twelve classes (JSS1–JSS3 plain + every SS stream), an English
 * teacher spans every class, and the scope gate enforces it on every
 * classroom route.
 *
 * Legacy single-arm teachers (only `assignedClass`, no arrays) keep working
 * through a [assignedClass] fallback, so no existing deployment breaks.
 *
 * @param {Object} session
 * @param {Object} opts
 * @param {string} [opts.classArm]  the arm the request asks to operate on
 * @param {string} [opts.subject]   the subject the request asks to grade.
 *   Enforced ONLY when the teacher HAS subjects — a legacy teacher without
 *   subject assignments stays unrestricted (they were generalists).
 * @param {"validate"|"resolve"|"force"} [opts.mode="validate"]
 *   - "validate": the target arm must be IN the teacher's arms (including
 *     `undefined` — an arm-less student never matches). Used where the arm is
 *     the request's own claim (attendance registers) or the target's own
 *     attribute (report cards).
 *   - "resolve": compute the effective arm. A teacher with arms is locked to
 *     them (a requested arm outside the set is denied); the unassigned
 *     outcome depends on `unassigned`. Used where the route needs the arm back.
 *   - "force": the requested arm wins IF it is in the teacher's set, else the
 *     teacher's first arm. Used when the request's arm is untrusted (creating
 *     users).
 * @param {"deny"|"require-arm"|"allow"} [opts.unassigned="deny"]
 *   What an arm-less teacher may do (same semantics as before).
 * @returns {Promise<{classArm?: string, teacher: Object|null}|Response>}
 */
export async function requireClassScope(session, { classArm, subject, mode = "validate", unassigned = "deny" } = {}) {
  if (session.role !== ROLES.TEACHER) return { classArm, teacher: null };

  // Snapshot (not the full row): only the scope fields are needed here.
  const teacher = await loadAuthSnapshot(session.userId, session.tokenVersion);
  if (!teacher) return jsonError("Account no longer exists", 401);

  const arms = teacher.assignedClasses?.length ? teacher.assignedClasses : [];
  const subjects = teacher.subjects || [];

  // Subject gate — enforced only when the teacher HAS subject assignments
  // (legacy generalists without them are unrestricted, like before).
  if (subject && subjects.length && !subjects.includes(subject)) {
    return jsonError("You can only enter scores for the subjects you teach", 403);
  }

  if (arms.length) {
    if (mode === "force") {
      // Trusted request arm when it is in the set; otherwise default to the
      // first assigned arm (the teacher always teaches at least one).
      return { classArm: classArm && arms.includes(classArm) ? classArm : arms[0], teacher };
    }
    if (mode === "validate" && (classArm === undefined || !arms.includes(classArm))) {
      return jsonError(MSG.teachersScope, 403);
    }
    if (mode === "resolve" && classArm !== undefined && !arms.includes(classArm)) {
      return jsonError(MSG.teachersScope, 403);
    }
    return { classArm: classArm || arms[0], teacher };
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
  // String() like the requireAuth re-validation: Mongo returns ObjectIds (a
  // `!==` on two ObjectId references is always true), demo returns strings.
  if (!target || String(target.schoolId) !== String(session.schoolId)) {
    return jsonError("Forbidden", 403);
  }
  return null;
}
