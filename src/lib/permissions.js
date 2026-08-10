/**
 * Role permission matrix — pure data + a tiny `can()` helper with NO imports,
 * so both server guards (policy.js) and client components (Sidebar, dashboard)
 * can share one source of truth without pulling Next.js server bits in.
 *
 * Add a role here AND to: (1) src/models/User.js enum, (2) STAFF_ROLES when
 * it opens the admin console, (3) MANAGED_ROLES in src/lib/roles.js when it
 * is a staff role (role management may only re-roll that list),
 * (4) ROLE_HOME in src/lib/portal-guard.js, (5) ROLE_LABELS in
 * src/lib/roles.js, (6) the login page's ROLES list, (7) the demo seed if
 * the demo should ship a sample account. The full checklist lives in
 * README.md ("Adding a new role").
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
 *
 * Convention: an action answers "may this role do this AT ALL?"; row-level
 * scoping stays with the policy guards (requireClassScope locks a teacher
 * to their own arm, requireOwnChild locks a parent to their linked
 * children). Every multi-role API gate reads this matrix via requirePermission.
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
    "students.add",
    "users.manage",
    "users.edit",
    "users.password.reset",
    "roles.manage",
    "roster.view",
    "reports.view",
    "scores.enter",
    "scores.view",
    "scores.own.view",
    "attendance.mark",
    "attendance.view",
    "stats.view",
    "school.edit",
    "notifications.view",
    "digest.manage",
    "leads.view",
    "timetable.view",
    "timetable.manage",
  ]),
  [ROLES.BURSAR]: Object.freeze([
    // Fee ledger, record payments, send reminders, read the audit trail.
    // Deliberately EXCLUDES: fees.confirm, fees.structures.edit (money-
    // clearing and termly pricing stay with the Super Admin), users.manage,
    // students.manage, reports.view, and every classroom action.
    "fees.view",
    "fees.record",
    "fees.remind",
    "fees.audit.view",
    // Roster READ (names/emails for reconciliation) — never roster tools.
    "roster.view",
    "stats.view",
  ]),
  [ROLES.REGISTRAR]: Object.freeze([
    // Student roster: create/manage students, bulk tools, view report cards.
    // Deliberately EXCLUDES every fees.* action — money stays with the
    // bursar/admin — and users.manage/users.resetPassword for staff/teacher
    // accounts (the in-route mayEditUser/mayResetPassword guards then scope
    // registrars to student & parent records only).
    "students.manage",
    "students.add",
    "users.edit",
    "users.password.reset",
    "roster.view",
    "reports.view",
    "stats.view",
  ]),
  [ROLES.TEACHER]: Object.freeze([
    // The classroom day-to-day, ALWAYS scoped to the teacher's own class arm
    // by requireClassScope — the matrix says "may do at all", the scope says
    // "only in my arm". No fees, no roster tools, no payroll, no stats.
    "students.add",
    "roster.view",
    "reports.view",
    "scores.enter",
    "scores.view",
    "attendance.mark",
    "attendance.view",
    "timetable.view",
  ]),
  [ROLES.PARENT]: Object.freeze([
    // Own children only — requireOwnChild scopes every read.
    "reports.view",
    "timetable.view",
  ]),
  [ROLES.STUDENT]: Object.freeze([
    // Own report-card data only — the route keys off session.userId, so this
    // can never address another student's record.
    "scores.own.view",
    "timetable.view",
  ]),
});

/** True when `role` may perform `action`. SUPER_ADMIN is always allowed. */
export function can(role, action) {
  if (!action) return true;
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(action);
}

// ---------------------------------------------------------------------------
// Human-readable permission summary — the admin dashboard's "what each role
// can do" panel renders these so a promotion shows exactly what it grants.
// Pure data; a missing label falls back to the raw action string (the tests
// pin that none are missing).

/** One human label per matrix action — keep in sync with ROLE_PERMISSIONS. */
export const ACTION_LABELS = Object.freeze({
  "fees.view": "View the fee ledger & balances",
  "fees.record": "Record fee payments",
  "fees.confirm": "Confirm parent-portal payments",
  "fees.remind": "Send fee reminders",
  "fees.structures.edit": "Edit termly fee structures",
  "fees.audit.view": "View the fee audit trail",
  "students.manage": "Manage student records",
  "students.add": "Add students",
  // users.manage is also the isSuper gate for the whole admin console (roles
  // tab, payroll, payment confirmation) — the label says so.
  "users.manage": "Manage the admin console & delete accounts",
  "users.edit": "Edit user records",
  "users.password.reset": "Reset passwords",
  "roles.manage": "Change staff roles",
  "roster.view": "View the class roster",
  "reports.view": "View report cards",
  "scores.enter": "Enter scores & grades",
  "scores.view": "View scores",
  "scores.own.view": "View your own report card",
  "attendance.mark": "Mark attendance",
  "attendance.view": "View attendance records",
  "timetable.view": "View class timetables",
  "timetable.manage": "Build & edit the school timetable",
  "stats.view": "View school stats & overview",
  "school.edit": "Edit school settings",
  "notifications.view": "View the notification inbox",
  "digest.manage": "Manage the digest schedule",
  "leads.view": "View marketing leads",
});

/** Domain key → display name, in the order the summary renders them. */
export const PERMISSION_DOMAINS = Object.freeze([
  ["fees", "Fees & payments"],
  ["students", "Students"],
  ["users", "User accounts"],
  ["roles", "Role management"],
  ["roster", "Class roster"],
  ["scores", "Scores & grading"],
  ["attendance", "Attendance"],
  ["timetable", "Timetables & schedules"],
  ["reports", "Report cards"],
  ["stats", "Stats & overview"],
  ["school", "School settings"],
  ["notifications", "Notifications"],
  ["digest", "Digest schedule"],
  ["leads", "Marketing leads"],
  ["own", "Self-service"],
]);

/** The summary domain an action belongs to ("scores.own.view" → "own"). */
export function permissionDomain(action) {
  if (action === "scores.own.view") return "own";
  return String(action).split(".")[0];
}

/**
 * Group one role's ROLE_PERMISSIONS list for display, in domain order.
 * Returns { role, count, domains: [{ key, label, actions: [{ action, label }] }] }
 * with empty domains omitted. Unknown actions fall back to their raw string,
 * and an action prefix not yet in PERMISSION_DOMAINS still renders (last).
 */
export function summarizeRolePermissions(role) {
  const byDomain = new Map();
  for (const action of ROLE_PERMISSIONS[role] || []) {
    const key = permissionDomain(action);
    if (!byDomain.has(key)) byDomain.set(key, []);
    byDomain.get(key).push(action);
  }
  const domains = [];
  for (const [key, label] of PERMISSION_DOMAINS) {
    const actions = byDomain.get(key);
    if (!actions || actions.length === 0) continue;
    domains.push({
      key,
      label,
      actions: actions.map((a) => ({ action: a, label: ACTION_LABELS[a] || a })),
    });
  }
  for (const [key, actions] of byDomain) {
    if (PERMISSION_DOMAINS.some(([k]) => k === key)) continue;
    domains.push({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      actions: actions.map((a) => ({ action: a, label: ACTION_LABELS[a] || a })),
    });
  }
  return { role, count: (ROLE_PERMISSIONS[role] || []).length, domains };
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
