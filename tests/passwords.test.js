/**
 * Reset-password tests (Phase 3 — "lost the credentials sheet").
 *
 * Covers:
 *   1. generatePassword  — length, charset (no ambiguous characters), randomness
 *   2. updateUser in the demo store — passwords are stored HASHED, never plaintext
 *   3. End-to-end — reset a seeded user's password and verify they can log in
 *                    with the new one (the same bcrypt.compare the login route uses)
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { generatePassword, PASSWORD_MIN_LENGTH } from "../src/lib/passwords.js";
import * as demoStore from "../src/lib/demo-store.js";

// ---- generatePassword ---------------------------------------------------------

describe("generatePassword", () => {
  it("returns a password of the requested length (default 10)", () => {
    assert.equal(generatePassword().length, 10);
    assert.equal(generatePassword(6).length, 6);
    assert.equal(generatePassword(14).length, 14);
    assert.ok(generatePassword().length >= PASSWORD_MIN_LENGTH);
  });

  it("never contains ambiguous characters (0/O, 1/l/I)", () => {
    const AMBIGUOUS = /[0O1lI]/;
    for (let i = 0; i < 50; i++) {
      assert.ok(!AMBIGUOUS.test(generatePassword()), "must avoid ambiguous chars");
    }
  });

  it("contains only the safe alphabet", () => {
    const SAFE = /^[a-km-zA-HJ-NP-Z2-9]+$/;
    for (let i = 0; i < 20; i++) {
      assert.ok(SAFE.test(generatePassword()), "only safe characters allowed");
    }
  });

  it("produces varied passwords (not constant)", () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(generatePassword());
    assert.ok(seen.size > 50, "passwords should vary");
  });
});

// ---- demo-store updateUser hashing ---------------------------------------------

describe("updateUser password hashing (demo store)", () => {
  let school;
  let seeded;

  beforeEach(async () => {
    demoStore.__resetDemoStore();
    const schools = await demoStore.searchSchools("Greenfield");
    school = await demoStore.getSchoolById(schools[0].id);
    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    seeded = students[0]; // a real seeded student with a known password
  });

  it("stores the reset password hashed, never in plaintext", async () => {
    const updated = await demoStore.updateUser(seeded.id, { password: "B3tterPass" });
    assert.equal(updated.name, seeded.name);
    assert.notEqual(updated.password, "B3tterPass");
    assert.ok(bcrypt.compareSync("B3tterPass", updated.password), "hash must verify");
  });

  it("keeps other fields when resetting the password", async () => {
    const updated = await demoStore.updateUser(seeded.id, { password: "Another42" });
    assert.equal(updated.email, seeded.email);
    assert.equal(updated.assignedClass, seeded.assignedClass);
  });
});

// ---- end-to-end reset + login ---------------------------------------------------

describe("reset-password end-to-end (demo store)", () => {
  let school;
  let seeded;

  beforeEach(async () => {
    demoStore.__resetDemoStore();
    const schools = await demoStore.searchSchools("Greenfield");
    school = await demoStore.getSchoolById(schools[0].id);
    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    seeded = students[0];
  });

  it("old password stops working, new one logs in — mirroring the login route", async () => {
    // Before the reset, the seeded password works.
    const before = await demoStore.findUserByEmailInSchool(school.id, seeded.email);
    assert.ok(bcrypt.compareSync("student123", before.password));

    // The reset flow: generate a new password, store it via updateUser.
    const fresh = generatePassword();
    const updated = await demoStore.updateUser(seeded.id, { password: fresh });

    // Old password must now fail against the stored hash.
    assert.ok(!bcrypt.compareSync("student123", updated.password));

    // New password must verify exactly as the login route does (bcrypt.compare).
    const after = await demoStore.findUserByEmailInSchool(school.id, seeded.email);
    assert.ok(await bcrypt.compare(fresh, after.password), "new password logs in");
    assert.ok(!(await bcrypt.compare("student123", after.password)), "old password rejected");
  });

  it("reset works for a teacher too", async () => {
    const teachers = await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" });
    const teacher = teachers[0];
    const fresh = generatePassword();
    const updated = await demoStore.updateUser(teacher.id, { password: fresh });
    // findUserById strips the hash; fetch the raw record for verification.
    const fetched = await demoStore.findUserByEmailInSchool(school.id, teacher.email);
    assert.ok(await bcrypt.compare(fresh, fetched.password), "teacher's new password verifies");
    assert.ok(!(await bcrypt.compare("student123", fetched.password)), "old password rejected");
    assert.equal(updated.role, "TEACHER");
  });
});
