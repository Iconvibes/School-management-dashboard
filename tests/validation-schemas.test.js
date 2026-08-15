/**
 * Unit tests for the zod schemas now wired across the authenticated API
 * routes. Each schema must preserve the route's historical message and field
 * order — these tests pin that, so a future schema edit can't silently
 * change what a user sees (or skip a guard).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  firstValidationMessage,
  changePasswordSchema,
  digestSchema,
  attendanceSchema,
  scoresSchema,
  feeStructureSchema,
  feePaymentSchema,
  confirmPaymentSchema,
  receiptSchema,
  reminderMessageSchema,
  schoolStatusSchema,
  reminderTemplatesSchema,
  timetableEntrySchema,
  classAlertSchema,
  userIdentitySchema,
  userRoleSchema,
  userEmailSchema,
  userPatchArraysSchema,
  resetPasswordSchema,
  mergeParentsSchema,
  quickAddClassArmSchema,
  quickAddPasswordSchema,
  importSchema,
  placeholdersSchema,
  leadIdentitySchema,
  leadNameSchema,
  leadEmailSchema,
  newsletterSchema,
} from "../src/lib/validation.js";

const v = (schema, data) => firstValidationMessage(schema, data);

describe("changePasswordSchema", () => {
  it("both passwords required (single combined message)", () => {
    assert.equal(v(changePasswordSchema, {}), "Current password and new password are required");
    assert.equal(v(changePasswordSchema, { currentPassword: "x" }), "Current password and new password are required");
  });
  it("new password length check", () => {
    assert.equal(
      v(changePasswordSchema, { currentPassword: "x", newPassword: "abc" }),
      "New password must be at least 6 characters"
    );
    assert.equal(v(changePasswordSchema, { currentPassword: "x", newPassword: "longenough" }), null);
  });
});

describe("digestSchema", () => {
  it("accepts off/daily/weekly, rejects anything else", () => {
    assert.equal(v(digestSchema, { frequency: "off" }), null);
    assert.equal(v(digestSchema, { frequency: "hourly" }), "frequency must be one of: off, daily, weekly");
    assert.equal(v(digestSchema, {}), "frequency must be one of: off, daily, weekly");
  });
});

describe("attendanceSchema", () => {
  it("requires classArm, date and a non-empty rows[]", () => {
    assert.equal(v(attendanceSchema, {}), "classArm, date and rows[] are required");
    assert.equal(v(attendanceSchema, { classArm: "JSS1", date: "2026-08-14", rows: [] }), "classArm, date and rows[] are required");
    assert.equal(v(attendanceSchema, { classArm: "JSS1", date: "2026-08-14", rows: [{}] }), null);
  });
});

describe("scoresSchema — per-row bounds preserved", () => {
  const ok = { classArm: "JSS1", subject: "Maths", rows: [{ studentId: "u1", caScore: 20, examScore: 30 }] };
  it("requires the top-level fields", () => {
    assert.equal(v(scoresSchema, {}), "classArm, subject and rows[] are required");
  });
  it("requires a studentId per row", () => {
    assert.equal(
      v(scoresSchema, { ...ok, rows: [{ caScore: 20, examScore: 30 }] }),
      "Each row requires a studentId"
    );
  });
  it("rejects CA > 40 and exam > 60 (first row wins, in row order)", () => {
    assert.equal(v(scoresSchema, { ...ok, rows: [{ studentId: "u1", caScore: 41, examScore: 30 }] }), "CA scores must be between 0 and 40");
    assert.equal(v(scoresSchema, { ...ok, rows: [{ studentId: "u1", caScore: 20, examScore: 61 }] }), "Exam scores must be between 0 and 60");
    assert.equal(v(scoresSchema, { ...ok, rows: [{ studentId: "u1", caScore: -1, examScore: 30 }] }), "CA scores must be between 0 and 40");
  });
  it("accepts string scores (historical Number() coercion)", () => {
    assert.equal(v(scoresSchema, { ...ok, rows: [{ studentId: "u1", caScore: "25", examScore: "40" }] }), null);
  });
});

describe("fee schemas", () => {
  it("structure: classArm + non-negative amount", () => {
    assert.equal(v(feeStructureSchema, {}), "classArm is required");
    assert.equal(v(feeStructureSchema, { classArm: "JSS1", amount: "abc" }), "A valid amount is required");
    assert.equal(v(feeStructureSchema, { classArm: "JSS1", amount: -5 }), "A valid amount is required");
    assert.equal(v(feeStructureSchema, { classArm: "JSS1", amount: 0 }), null); // 0 is legal for a structure
  });
  it("payment: studentId + amount > 0", () => {
    assert.equal(v(feePaymentSchema, {}), "studentId is required");
    assert.equal(v(feePaymentSchema, { studentId: "u1", amount: 0 }), "A valid amount is required");
    assert.equal(v(feePaymentSchema, { studentId: "u1", amount: "5000" }), null);
    assert.equal(v(confirmPaymentSchema, {}), "id is required");
    assert.equal(v(receiptSchema, { studentId: "u1" }), "studentId and receiptNo are required");
  });
  it("reminder messages capped at 4000 (non-strings tolerated like the route)", () => {
    assert.equal(v(reminderMessageSchema, { message: "x".repeat(4001) }), "Reminder message is too long (max 4000 characters)");
    assert.equal(v(reminderMessageSchema, { messageStudent: "x".repeat(4001) }), "Reminder message is too long (max 4000 characters)");
    assert.equal(v(reminderMessageSchema, { message: 123 }), null);
  });
});

describe("school schemas", () => {
  it("status action enum", () => {
    assert.equal(v(schoolStatusSchema, { action: "deactivate" }), null);
    assert.equal(
      v(schoolStatusSchema, { action: "banana" }),
      'action must be "deactivate", "reactivate" or "restore"'
    );
  });
  it("reminder templates capped at 4000 each", () => {
    assert.equal(
      v(reminderTemplatesSchema, { parent: "x".repeat(4001) }),
      "Reminder messages are too long (max 4000 characters each)"
    );
    assert.equal(v(reminderTemplatesSchema, { student: "x".repeat(4001) }), "Reminder messages are too long (max 4000 characters each)");
    assert.equal(v(reminderTemplatesSchema, {}), null);
  });
});

describe("timetable schemas", () => {
  const entry = { classArm: "JSS1", day: "Monday", period: 3, subject: "Maths", teacherId: "t1" };
  it("requires the five fields with the combined message", () => {
    assert.equal(v(timetableEntrySchema, {}), "classArm, day, period, subject and teacherId are required");
    assert.equal(v(timetableEntrySchema, { ...entry, day: "Blursday" }), "classArm, day, period, subject and teacherId are required");
    assert.equal(v(timetableEntrySchema, { ...entry, period: 99 }), "classArm, day, period, subject and teacherId are required");
  });
  it("accepts a valid entry (period as string, like the UI)", () => {
    assert.equal(v(timetableEntrySchema, { ...entry, period: "3" }), null);
  });
  it("class-alert lead minutes enum", () => {
    assert.equal(v(classAlertSchema, { leadMinutes: 5 }), null);
    assert.equal(v(classAlertSchema, { leadMinutes: 7 }), "leadMinutes must be one of 0, 5, 10, 15 or 30");
    assert.equal(v(classAlertSchema, {}), null);
  });
});

describe("user create schemas (sequential order preserved)", () => {
  const base = { name: "Ada", role: "STUDENT", email: "ada@test.app" };
  it("name + role required together", () => {
    assert.equal(v(userIdentitySchema, {}), "Name and role are required");
    assert.equal(v(userIdentitySchema, { name: "Ada" }), "Name and role are required");
  });
  it("email required for non-name-only roles (STUDENT), not for PARENT/TEACHER", () => {
    assert.equal(v(userIdentitySchema, { name: "Ada", role: "STUDENT" }), "Email is required for this role");
    assert.equal(v(userIdentitySchema, { name: "Ada", role: "STUDENT", email: "ada@test.app" }), null);
    assert.equal(v(userIdentitySchema, { name: "Mum", role: "PARENT" }), null);
  });
  it("role enum", () => {
    assert.equal(v(userRoleSchema, { role: "STUDENT" }), null);
    assert.equal(v(userRoleSchema, { role: "admin" }), "Role must be STUDENT, TEACHER, PARENT, BURSAR or REGISTRAR");
  });
  it("email format (when present)", () => {
    assert.equal(v(userEmailSchema, { email: "nope" }), "Please provide a valid email address");
    assert.equal(v(userEmailSchema, { email: "ok@test.app" }), null);
    assert.equal(v(userEmailSchema, {}), null);
  });
  it("patch arrays: subjects/assignedClasses must be arrays of strings", () => {
    assert.equal(v(userPatchArraysSchema, { subjects: [1, 2] }), "subjects must be an array of strings");
    assert.equal(v(userPatchArraysSchema, { assignedClasses: [1] }), "assignedClasses must be an array of strings");
    assert.equal(v(userPatchArraysSchema, { subjects: ["Maths"] }), null);
    assert.equal(v(userPatchArraysSchema, {}), null);
  });
});

describe("reset password + merge + quick-add + import", () => {
  it("reset password: empty ok (auto-generate), min/max enforced on trimmed", () => {
    assert.equal(v(resetPasswordSchema, {}), null);
    assert.equal(v(resetPasswordSchema, { password: "" }), null);
    assert.equal(v(resetPasswordSchema, { password: "abc" }), "Password must be at least 6 characters");
    assert.equal(v(resetPasswordSchema, { password: "   abc   " }), "Password must be at least 6 characters");
    assert.equal(v(resetPasswordSchema, { password: "x".repeat(80) }), "Password must be at most 72 characters");
    assert.equal(v(resetPasswordSchema, { password: "longenough" }), null);
  });
  it("merge parents: required + self-merge", () => {
    assert.equal(v(mergeParentsSchema, {}), "keepId and removeId are required");
    assert.equal(v(mergeParentsSchema, { keepId: "a", removeId: "a" }), "Cannot merge an account into itself");
    assert.equal(v(mergeParentsSchema, { keepId: "a", removeId: "b" }), null);
  });
  it("quick add: class arm + default password", () => {
    assert.equal(v(quickAddClassArmSchema, {}), "Choose a class arm first");
    assert.equal(v(quickAddPasswordSchema, { defaultPassword: "abc" }), "Default password must be at least 6 characters");
    assert.equal(v(quickAddPasswordSchema, { defaultPassword: "longenough" }), null);
    assert.equal(v(quickAddPasswordSchema, {}), null);
  });
  it("import: role enum + csv required + size + default password", () => {
    assert.equal(v(importSchema, { role: "admin" }), "Role must be STUDENT or TEACHER");
    assert.equal(v(importSchema, { role: "STUDENT", csv: "   " }), "CSV content is required");
    assert.equal(v(importSchema, { role: "STUDENT", csv: "x".repeat(2_000_001) }), "File is too large (max 2 MB)");
    assert.equal(v(importSchema, { role: "STUDENT", csv: "name", options: { defaultPassword: "abc" } }), "Default password must be at least 6 characters");
    assert.equal(v(importSchema, { role: "teacher", csv: "name" }), null);
  });
  it("placeholders: csv required + size + default password", () => {
    assert.equal(v(placeholdersSchema, {}), "CSV content is required");
    assert.equal(v(placeholdersSchema, { csv: "x".repeat(200_001) }), "File is too large");
    assert.equal(v(placeholdersSchema, { csv: "JSS1:40", defaultPassword: "short" }), "Default password must be at least 6 characters");
  });
});

describe("marketing schemas", () => {
  it("leads: identity → name-valid → email, in that order", () => {
    assert.equal(v(leadIdentitySchema, { name: "", school: "" }), "Please provide your name and school name");
    assert.equal(v(leadIdentitySchema, { name: "  ", school: "X" }), "Please provide your name and school name");
    assert.equal(v(leadNameSchema, { name: "!!!" }), "Please provide a valid name");
    assert.equal(v(leadEmailSchema, { email: "nope" }), "Please provide a valid email address");
    assert.equal(v(leadEmailSchema, { email: "" }), "Please provide a valid email address");
    assert.equal(v(leadEmailSchema, { email: "ok@test.app" }), null);
  });
  it("newsletter: email format", () => {
    assert.equal(v(newsletterSchema, { email: "nope" }), "Please provide a valid email address");
    assert.equal(v(newsletterSchema, { email: "OK@TEST.APP" }), null);
  });
});
