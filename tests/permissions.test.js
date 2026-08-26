import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_LABELS,
  can,
  mayEditUser,
  mayResetPassword,
  permissionDomain,
  ROLES,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  summarizeRolePermissions,
} from "../src/lib/permissions.js";

test("ROLES includes the staff roles below SUPER_ADMIN", () => {
  assert.equal(ROLES.BURSAR, "BURSAR");
  assert.equal(ROLES.REGISTRAR, "REGISTRAR");
  assert.deepEqual([...STAFF_ROLES], ["PLATFORM_ADMIN", "SUPER_ADMIN", "BURSAR", "REGISTRAR"]);
});

test("SUPER_ADMIN can do everything", () => {
  for (const action of [
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
  ]) {
    assert.equal(can("SUPER_ADMIN", action), true, `SUPER_ADMIN should ${action}`);
  }
});

test("BURSAR can record but NOT confirm payments (the core confirm-vs-record split)", () => {
  assert.equal(can("BURSAR", "fees.view"), true);
  assert.equal(can("BURSAR", "fees.record"), true);
  assert.equal(can("BURSAR", "fees.remind"), true);
  assert.equal(can("BURSAR", "fees.audit.view"), true);
  // Money-clearing + termly pricing stay with the Super Admin.
  assert.equal(can("BURSAR", "fees.confirm"), false);
  assert.equal(can("BURSAR", "fees.structures.edit"), false);
  // No roster or report-card power.
  assert.equal(can("BURSAR", "students.manage"), false);
  assert.equal(can("BURSAR", "reports.view"), false);
  // The overview dashboard is fine for staff.
  assert.equal(can("BURSAR", "stats.view"), true);
});

test("REGISTRAR manages the roster but has no fee access", () => {
  assert.equal(can("REGISTRAR", "students.manage"), true);
  assert.equal(can("REGISTRAR", "students.add"), true);
  assert.equal(can("REGISTRAR", "roster.view"), true);
  assert.equal(can("REGISTRAR", "reports.view"), true);
  assert.equal(can("REGISTRAR", "stats.view"), true);
  // Edit + reset student/parent accounts (in-route guards scope those), but
  // never staff-account management, money, school settings or the inbox.
  assert.equal(can("REGISTRAR", "users.edit"), true);
  assert.equal(can("REGISTRAR", "users.password.reset"), true);
  assert.equal(can("REGISTRAR", "users.manage"), false);
  assert.equal(can("REGISTRAR", "school.edit"), false);
  assert.equal(can("REGISTRAR", "notifications.view"), false);
  assert.equal(can("REGISTRAR", "digest.manage"), false);
  assert.equal(can("REGISTRAR", "leads.view"), false);
  // No money at all.
  assert.equal(can("REGISTRAR", "fees.view"), false);
  assert.equal(can("REGISTRAR", "fees.record"), false);
  assert.equal(can("REGISTRAR", "fees.confirm"), false);
  assert.equal(can("REGISTRAR", "fees.remind"), false);
  assert.equal(can("REGISTRAR", "fees.structures.edit"), false);
  assert.equal(can("REGISTRAR", "fees.audit.view"), false);
});

test("fees, roster-management, role-management and stats stay off-limits for non-staff", () => {
  for (const role of ["TEACHER", "PARENT", "STUDENT", "UNKNOWN"]) {
    assert.equal(can(role, "fees.record"), false);
    assert.equal(can(role, "fees.confirm"), false);
    assert.equal(can(role, "students.manage"), false);
    assert.equal(can(role, "roles.manage"), false);
    assert.equal(can(role, "stats.view"), false);
  }
});

test("TEACHER can run their classroom day-to-day and nothing else", () => {
  for (const action of [
    "scores.enter",
    "scores.view",
    "attendance.mark",
    "attendance.view",
    "reports.view",
    "roster.view",
    "students.add",
  ]) {
    assert.equal(can("TEACHER", action), true, `TEACHER should ${action}`);
  }
  // No fees, no roster management, no payroll, no school stats, no admin ops.
  assert.equal(can("TEACHER", "fees.view"), false);
  assert.equal(can("TEACHER", "fees.record"), false);
  assert.equal(can("TEACHER", "students.manage"), false);
  assert.equal(can("TEACHER", "users.manage"), false);
  assert.equal(can("TEACHER", "users.edit"), false);
  assert.equal(can("TEACHER", "users.password.reset"), false);
  assert.equal(can("TEACHER", "school.edit"), false);
  assert.equal(can("TEACHER", "notifications.view"), false);
  assert.equal(can("TEACHER", "digest.manage"), false);
  assert.equal(can("TEACHER", "leads.view"), false);
  assert.equal(can("TEACHER", "stats.view"), false);
});

test("STUDENT can only view their own scores (scoped to session.userId)", () => {
  assert.equal(can("STUDENT", "scores.own.view"), true);
  for (const action of [
    "scores.enter",
    "scores.view",
    "fees.view",
    "reports.view",
    "students.manage",
    "stats.view",
    "users.edit",
    "school.edit",
  ]) {
    assert.equal(can("STUDENT", action), false, `STUDENT should not ${action}`);
  }
});

test("PARENT can only view reports (their own children, scoped by requireOwnChild)", () => {
  assert.equal(can("PARENT", "reports.view"), true);
  for (const action of [
    "fees.view",
    "fees.record",
    "students.manage",
    "stats.view",
    "scores.enter",
    "attendance.mark",
    "roster.view",
  ]) {
    assert.equal(can("PARENT", action), false, `PARENT should not ${action}`);
  }
});

test("BURSAR may read the roster but never manage it; no classroom or admin actions", () => {
  assert.equal(can("BURSAR", "roster.view"), true);
  assert.equal(can("BURSAR", "students.manage"), false);
  assert.equal(can("BURSAR", "students.add"), false);
  assert.equal(can("BURSAR", "scores.enter"), false);
  assert.equal(can("BURSAR", "attendance.mark"), false);
  assert.equal(can("BURSAR", "users.edit"), false);
  assert.equal(can("BURSAR", "users.password.reset"), false);
  assert.equal(can("BURSAR", "school.edit"), false);
  assert.equal(can("BURSAR", "notifications.view"), false);
  assert.equal(can("BURSAR", "digest.manage"), false);
  assert.equal(can("BURSAR", "leads.view"), false);
});

test("can() with no action is always true", () => {
  assert.equal(can("PARENT", undefined), true);
  assert.equal(can("STUDENT", null), true);
});

test("every role maps to a frozen permission list", () => {
  for (const role of Object.values(ROLES)) {
    assert.ok(Array.isArray(ROLE_PERMISSIONS[role]), `${role} has a permission list`);
    assert.ok(Object.isFrozen(ROLE_PERMISSIONS[role]), `${role} list is frozen`);
  }
});

test("every matrix action has a human-readable label (the summary never shows raw actions)", () => {
  for (const role of Object.values(ROLES)) {
    for (const action of ROLE_PERMISSIONS[role]) {
      assert.ok(
        typeof ACTION_LABELS[action] === "string" && ACTION_LABELS[action].length > 0,
        `${action} (${role}) needs an ACTION_LABELS entry`
      );
    }
  }
});

test("summarizeRolePermissions returns exactly the matrix, grouped in domain order", () => {
  const summary = summarizeRolePermissions("BURSAR");
  assert.equal(summary.role, "BURSAR");
  assert.equal(summary.count, ROLE_PERMISSIONS.BURSAR.length);
  // No actions added, dropped or reordered vs the matrix.
  assert.deepEqual(
    summary.domains.flatMap((d) => d.actions.map((a) => a.action)),
    ROLE_PERMISSIONS.BURSAR
  );
  // Grouped under the documented domains, in the documented order.
  assert.deepEqual(
    summary.domains.map((d) => d.key),
    ["fees", "roster", "stats"]
  );
  for (const d of summary.domains) {
    for (const a of d.actions) assert.equal(a.label, ACTION_LABELS[a.action]);
  }
});

test("the summary covers the full SUPER_ADMIN matrix and the self-service domain", () => {
  const admin = summarizeRolePermissions("SUPER_ADMIN");
  assert.equal(admin.count, ROLE_PERMISSIONS.SUPER_ADMIN.length);
  assert.equal(
    admin.domains.flatMap((d) => d.actions.map((a) => a.action)).length,
    ROLE_PERMISSIONS.SUPER_ADMIN.length
  );
  // scores.own.view lives in the self-service domain, not Scores & grading.
  assert.equal(permissionDomain("scores.own.view"), "own");
  const student = summarizeRolePermissions("STUDENT");
  // STUDENT also gained timetable.view (their own class's schedule) — the
  // self-service domain is no longer the first one, so locate it by key.
  const ownDomain = student.domains.find((d) => d.key === "own");
  assert.ok(ownDomain, "STUDENT keeps the self-service domain");
  assert.equal(ownDomain.actions[0].action, "scores.own.view");
  assert.equal(ownDomain.actions[0].label, ACTION_LABELS["scores.own.view"]);
});

test("mayEditUser: registrar edits students/parents but never money fields or staff", () => {
  const registrar = { role: "REGISTRAR" };
  // Students/parents: fine for names, class, parent link, phone.
  assert.equal(mayEditUser("REGISTRAR", { role: "STUDENT" }, { name: "X" }), true);
  assert.equal(mayEditUser("REGISTRAR", { role: "PARENT" }, { phone: "080" }), true);
  // Money fields are blocked even on a student.
  assert.equal(mayEditUser("REGISTRAR", { role: "STUDENT" }, { feePaid: true }), false);
  assert.equal(mayEditUser("REGISTRAR", { role: "STUDENT" }, { payrollStatus: "PAID" }), false);
  // Staff accounts are off-limits entirely.
  assert.equal(mayEditUser("REGISTRAR", { role: "TEACHER" }, { name: "X" }), false);
  assert.equal(mayEditUser("REGISTRAR", { role: "SUPER_ADMIN" }, {}), false);
  // Every other role passes through.
  assert.equal(mayEditUser("SUPER_ADMIN", { role: "STUDENT" }, { feePaid: true }), true);
  assert.equal(mayEditUser("BURSAR", { role: "STUDENT" }, {}), true);
});

test("mayResetPassword: registrar only for students/parents", () => {
  assert.equal(mayResetPassword("REGISTRAR", "STUDENT"), true);
  assert.equal(mayResetPassword("REGISTRAR", "PARENT"), true);
  assert.equal(mayResetPassword("REGISTRAR", "TEACHER"), false);
  assert.equal(mayResetPassword("REGISTRAR", "SUPER_ADMIN"), false);
  assert.equal(mayResetPassword("SUPER_ADMIN", "TEACHER"), true);
});

test("every admin-console action maps to exactly the roles that hold it", () => {
  // users.edit / users.password.reset: SUPER_ADMIN + REGISTRAR only.
  for (const action of ["users.edit", "users.password.reset"]) {
    assert.equal(can("SUPER_ADMIN", action), true);
    assert.equal(can("REGISTRAR", action), true);
    for (const role of ["BURSAR", "TEACHER", "PARENT", "STUDENT"]) {
      assert.equal(can(role, action), false, `${role} should not ${action}`);
    }
  }
  // Single-role admin actions: SUPER_ADMIN only, nobody else. The timetable
  // is built by the SUPER_ADMIN (timetable.manage) and read by everyone who
  // has a class (timetable.view), so only the WRITE side is super-only.
  for (const action of ["timetable.manage"]) {
    assert.equal(can("SUPER_ADMIN", action), true);
    for (const role of ["BURSAR", "REGISTRAR", "TEACHER", "PARENT", "STUDENT"]) {
      assert.equal(can(role, action), false, `${role} should not ${action}`);
    }
  }
  for (const action of ["users.manage", "school.edit", "notifications.view", "digest.manage", "leads.view"]) {
    assert.equal(can("SUPER_ADMIN", action), true);
    for (const role of ["BURSAR", "REGISTRAR", "TEACHER", "PARENT", "STUDENT"]) {
      assert.equal(can(role, action), false, `${role} should not ${action}`);
    }
  }
});
