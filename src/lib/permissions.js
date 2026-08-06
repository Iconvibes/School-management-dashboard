/**
 * Role permission matrix — pure data + a tiny `can()` helper with NO imports,
 * so both server guards (policy.js) and client components (Sidebar, dashboard)
 * can share one source of truth without pulling Next.js server bits in.
 *
 * Add a role here AND to: (1) src/models/User.js enum, (2) ROLE_HOME in the
 * login route, (3) the login page's ROLES list, (4) the demo seed if the demo
 * should ship a sample account.
 */

/** Canonical roles (mirrors the User model's role enum). */
export const ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  BURSAR: "BURSAR",
  REGISTRAR: "REGISTRAR",
  TEACHER: "TEACHER",
  PARENT: "PARENT",
  STUDENT: "STUDENT",
});

/** Every role that opens the staff admin console (in dashboard-gate order). */
export const STAFF_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.BURSAR,
  ROLES.REGISTRAR,
]);

/**
 * Action-based permission map. Roles may also be checked positionally via
 * requireAuth([...roles]); this map lets a route split one endpoint into
 * finer-grained gates — e.g. BURSAR may RECORD a payment but only
 * SUPER_ADMIN may CONFIRM one.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: Object.freeze([
    "fees.view",
    "fees.record",
    "fees.confirm",
    "fees.remind",
    "fees.structures.edit",
    "fees.audit.view",
    "students.manage",
    "users.manage",
    "reports.view",
    "stats.view",
  ]),
  [ROLES.BURSAR]: Object.freeze([
    // Fee ledger, record payments, send reminders, read the audit trail.
    // Deliberately EXCLUDES: fees.confirm, fees.structures.edit (money-
    // clearing and termly pricing stay with the Super Admin), users.manage,
    // students.manage, reports.view.
    "fees.view",
    "fees.record",
    "fees.remind",
    "fees.audit.view",
    "stats.view",
  ]),
  [ROLES.REGISTRAR]: Object.freeze([
    // Student roster: create/manage students, bulk tools, view report cards.
    // Deliberately EXCLUDES every fees.* action — money stays with the
    // bursar/admin — and users.manage for staff/teacher accounts.
    "students.manage",
    "reports.view",
    "stats.view",
  ]),
  [ROLES.TEACHER]: Object.freeze([]),
  [ROLES.PARENT]: Object.freeze([]),
  [ROLES.STUDENT]: Object.freeze([]),
});

/** True when `role` may perform `action`. SUPER_ADMIN is always allowed. */
export function can(role, action) {
  if (!action) return true;
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(action);
}

/**
 * Field-level edit guard for the user PATCH endpoint.
 *
 * A REGISTRAR may maintain the student roster (students + parents) but must
 * never touch staff accounts, payroll flags or fee flags — those are money
 * and stay with the SUPER_ADMIN (and BURSAR's fee routes). Every other role
 * passes through untouched.
 *
 * @param {string} role    the acting session's role
 * @param {Object} target  the user being edited (needs .role)
 * @param {Object} body    the PATCH body
 * @returns {boolean} true when the edit is allowed
 */
export function mayEditUser(role, target, body = {}) {
  if (role !== ROLES.REGISTRAR) return true;
  if (!target) return false;
  if (!["STUDENT", "PARENT"].includes(target.role)) return false;
  if (body.payrollStatus !== undefined || body.feePaid !== undefined) return false;
  return true;
}

/**
 * A REGISTRAR may hand out logins for students/parents, never staff.
 * @param {string} role    the acting session's role
 * @param {string} targetRole  the target user's role
 */
export function mayResetPassword(role, targetRole) {
  if (role !== ROLES.REGISTRAR) return true;
  return ["STUDENT", "PARENT"].includes(targetRole);
}
