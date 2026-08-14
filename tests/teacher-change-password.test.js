/**
 * Teacher self-service password change.
 *
 * Teachers bootstrap with the school name as their password (the admin types
 * only their name — the school name is the first-login credential). After the
 * teacher sets their own password, the school-name fallback MUST stop
 * working, so the school name can't be used to get back in. An admin reset
 * returns the teacher to the school-name bootstrap.
 *
 * These tests drive the REAL login, change-password, users POST and
 * reset-password routes against the REAL demo store.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as demoStore from "../src/lib/demo-store.js";
import { signToken } from "../src/lib/token.js";
import { __setSessionToken } from "./helpers/headers-mock.js";

const MOCK_URL = pathToFileURL(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "helpers",
    "headers-mock.js"
  )
).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers.js") return nextResolve(MOCK_URL);
    return nextResolve(specifier, context);
  },
});

// Force demo mode BEFORE importing the routes (they bind the store at import).
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { POST: loginPOST } = await import("../src/app/api/auth/login/route.js");
const { POST: changePasswordPOST } = await import("../src/app/api/auth/change-password/route.js");
const { POST: usersPOST } = await import("../src/app/api/users/route.js");
const { POST: resetPasswordPOST } = await import("../src/app/api/users/[id]/reset-password/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-teacher-change-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  __setSessionToken("");
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

async function schoolAndAdmin() {
  const [school] = await demoStore.searchSchools("Greenfield");
  const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
  return { school, admin };
}

const SCHOOL_NAME = "Greenfield International School";

function login(body) {
  return loginPOST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function teacherLogin(name, password) {
  const { school } = await schoolAndAdmin();
  const res = await login({ name, password, role: "TEACHER", schoolId: school.id });
  return res;
}

function changePassword(currentPassword, newPassword) {
  return changePasswordPOST(
    new Request("http://localhost/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
  );
}

function resetPassword(id, password) {
  return resetPasswordPOST(
    new Request(`http://localhost/api/users/${id}/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(password ? { password } : {}),
    }),
    { params: { id } }
  );
}

function signInAs(user, tokenVersion = 0) {
  __setSessionToken(
    signToken({ userId: user.id, role: user.role, schoolId: user.schoolId, tokenVersion })
  );
}

describe("teacher self-service password change", () => {
  it("school name works at bootstrap, then stops after the teacher sets their own password", async () => {
    const { school } = await schoolAndAdmin();
    const teacher = await demoStore.findTeacherByNameInSchool(school.id, "Mrs. Adaeze Okafor");

    // Bootstrap: school name is the first-login password.
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", SCHOOL_NAME)).status, 200);

    // Teacher changes their password using the school name as CURRENT.
    signInAs(teacher);
    const changed = await changePassword(SCHOOL_NAME, "Sunshine2026");
    assert.equal(changed.status, 200);

    // The school name no longer works — the fallback is off.
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", SCHOOL_NAME)).status, 401);
    // Their new password does.
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", "Sunshine2026")).status, 200);
  });

  it("a second change requires the NEW password as current (school name is rejected)", async () => {
    const { school } = await schoolAndAdmin();
    const teacher = await demoStore.findTeacherByNameInSchool(school.id, "Mrs. Adaeze Okafor");

    signInAs(teacher);
    assert.equal((await changePassword(SCHOOL_NAME, "Sunshine2026")).status, 200);

    // The session was re-issued with tokenVersion 1 — sign a fresh token.
    signInAs(teacher, 1);
    // School name as CURRENT is now rejected (passwordSet is true).
    assert.equal((await changePassword(SCHOOL_NAME, "Another2026")).status, 403);
    // The new password as CURRENT works.
    assert.equal((await changePassword("Sunshine2026", "Another2026")).status, 200);
  });

  it("a freshly-created name-only teacher follows the same journey", async () => {
    const { school, admin } = await schoolAndAdmin();
    signInAs(admin);
    const created = await usersPOST(
      new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Mr. Brand New Teacher", role: "TEACHER" }),
      })
    );
    assert.equal(created.status, 201);

    // Bootstrap: school name works.
    assert.equal((await teacherLogin("Mr. Brand New Teacher", SCHOOL_NAME)).status, 200);

    const teacher = await demoStore.findTeacherByNameInSchool(school.id, "Mr. Brand New Teacher");
    signInAs(teacher);
    assert.equal((await changePassword(SCHOOL_NAME, "MyOwnPass123")).status, 200);

    assert.equal((await teacherLogin("Mr. Brand New Teacher", SCHOOL_NAME)).status, 401);
    assert.equal((await teacherLogin("Mr. Brand New Teacher", "MyOwnPass123")).status, 200);
  });

  it("an admin reset returns the teacher to the school-name bootstrap", async () => {
    const { school, admin } = await schoolAndAdmin();
    const teacher = await demoStore.findTeacherByNameInSchool(school.id, "Mrs. Adaeze Okafor");

    // Teacher sets their own password.
    signInAs(teacher);
    assert.equal((await changePassword(SCHOOL_NAME, "Sunshine2026")).status, 200);
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", "Sunshine2026")).status, 200);
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", SCHOOL_NAME)).status, 401);

    // Admin resets (no password given → auto-generated temp).
    signInAs(admin);
    assert.equal((await resetPassword(teacher.id)).status, 200);

    // Back to bootstrap: the school name works again, the old self-chosen
    // password does not.
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", SCHOOL_NAME)).status, 200);
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", "Sunshine2026")).status, 401);
  });

  it("a legacy teacher (stored hash) changes with their hash password, then the school name stops working", async () => {
    const { school } = await schoolAndAdmin();
    const teacher = await demoStore.findTeacherByNameInSchool(school.id, "Mrs. Adaeze Okafor");

    // Legacy seed: teacher123 is the stored hash, school name also works.
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", "teacher123")).status, 200);
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", SCHOOL_NAME)).status, 200);

    signInAs(teacher);
    // Current = teacher123 (the stored hash), not the school name.
    assert.equal((await changePassword("teacher123", "LegacyPass1")).status, 200);

    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", SCHOOL_NAME)).status, 401);
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", "teacher123")).status, 401);
    assert.equal((await teacherLogin("Mrs. Adaeze Okafor", "LegacyPass1")).status, 200);
  });

  it("student change-password is unaffected by the school-name fallback", async () => {
    const { school } = await schoolAndAdmin();
    const student = await demoStore.findUserByEmailInSchool(school.id, "k.adebayo@edutrack.app");

    signInAs(student);
    // A student's CURRENT password is never the school name — 403.
    assert.equal((await changePassword(SCHOOL_NAME, "NewStudent1")).status, 403);

    // The real current password works and the new one takes over.
    assert.equal((await changePassword("student123", "NewStudent1")).status, 200);
    const oldLogin = await login({
      email: "k.adebayo@edutrack.app",
      password: "student123",
      role: "STUDENT",
      schoolId: school.id,
    });
    assert.equal(oldLogin.status, 401);
    const newLogin = await login({
      email: "k.adebayo@edutrack.app",
      password: "NewStudent1",
      role: "STUDENT",
      schoolId: school.id,
    });
    assert.equal(newLogin.status, 200);
  });
});
