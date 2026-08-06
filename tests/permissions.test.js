import { test } from "node:test";
import assert from "node:assert/strict";
import {
  can,
  mayEditUser,
  mayResetPassword,
  ROLES,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
} from "../src/lib/permissions.js";

test("ROLES includes the staff roles below SUPER_ADMIN", () => {
  assert.equal(ROLES.BURSAR, "BURSAR");
  assert.equal(ROLES.REGISTRAR, "REGISTRAR");
  assert.deepEqual([...STAFF_ROLES], ["SUPER_ADMIN", "BURSAR", "REGISTRAR"]);
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
    "reports.view",
    "stats.view",
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
  assert.equal(can("REGISTRAR", "reports.view"), true);
  assert.equal(can("REGISTRAR", "stats.view"), true);
  // No money at all.
  assert.equal(can("REGISTRAR", "fees.view"), false);
  assert.equal(can("REGISTRAR", "fees.record"), false);
  assert.equal(can("REGISTRAR", "fees.confirm"), false);
  assert.equal(can("REGISTRAR", "fees.remind"), false);
  assert.equal(can("REGISTRAR", "fees.structures.edit"), false);
  assert.equal(can("REGISTRAR", "fees.audit.view"), false);
});

test("non-staff roles have no permissions", () => {
  for (const role of ["TEACHER", "PARENT", "STUDENT", "UNKNOWN"]) {
    assert.equal(can(role, "fees.record"), false);
    assert.equal(can(role, "fees.confirm"), false);
    assert.equal(can(role, "students.manage"), false);
    assert.equal(can(role, "stats.view"), false);
  }
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
