/**
 * Name-only teacher accounts.
 *
 * Teachers now mirror parents: the admin types JUST the teacher's name (plus
 * subjects/arms) — no email, no password. The teacher signs in with their
 * FULL NAME and the SCHOOL NAME as the password (slugged — case/spacing-
 * insensitive), so a school rename doesn't lock anyone out. Legacy email
 * logins keep working. Name-based login makes the teacher's name a login
 * identifier, so duplicates within a school are rejected (create + rename).
 * These tests drive the REAL login + users routes against the REAL demo store.
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
const { POST: usersPOST } = await import("../src/app/api/users/route.js");
const { PATCH: usersPATCH } = await import("../src/app/api/users/[id]/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-teacher-login-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

function login(body) {
  return loginPOST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function createTeacher(schoolId, name) {
  return usersPOST(
    new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, role: "TEACHER" }),
    })
  );
}

function renameTeacher(token, id, name) {
  return usersPATCH(
    new Request(`http://localhost/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    { params: { id } }
  );
}

describe("store — findTeacherByNameInSchool", () => {
  it("finds a teacher by full name, case/whitespace-insensitive, tenant-scoped", async () => {
    const { school } = await schoolAndAdmin();
    const found = await demoStore.findTeacherByNameInSchool(school.id, "  mrs. ADAEZE okafor ");
    assert.ok(found);
    assert.equal(found.role, "TEACHER");
    assert.equal(found.email, "a.okafor@edutrack.app");
  });

  it("returns null for a PARENT's name (role-filtered) and for another school", async () => {
    const { school } = await schoolAndAdmin();
    assert.equal(await demoStore.findTeacherByNameInSchool(school.id, "Mrs. Folake Adebayo"), null);
    assert.equal(await demoStore.findTeacherByNameInSchool("sch_other", "Mrs. Adaeze Okafor"), null);
  });
});

describe("POST /api/users — name-only teachers", () => {
  it("creates a teacher with no email and no password", async () => {
    const { school, admin } = await schoolAndAdmin();
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await createTeacher(school.id, "Mr. New Teacher");
    const data = await res.json();

    assert.equal(res.status, 201);
    assert.equal(data.user.role, "TEACHER");
    assert.equal(data.user.email, "");
    assert.equal(data.generatedPassword, undefined); // placeholder never recorded
  });

  it("rejects a teacher whose exact name already exists in the school", async () => {
    const { school, admin } = await schoolAndAdmin();
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await createTeacher(school.id, "Mrs. Adaeze Okafor"); // seeded teacher
    assert.equal(res.status, 409);
  });

  it("matches case- and whitespace-insensitively", async () => {
    const { school, admin } = await schoolAndAdmin();
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await createTeacher(school.id, "  mrs. adaeze OKAFOR ");
    assert.equal(res.status, 409);
  });

  it("allows the same teacher name in a DIFFERENT school (tenant-scoped)", async () => {
    const other = await demoStore.createSchoolAndAdmin({
      schoolName: "Teacher Academy",
      adminName: "Ms. Boss",
      email: "boss@teacher.app",
      password: "boss12345",
    });
    __setSessionToken(
      signToken({ userId: other.user.id, role: other.user.role, schoolId: other.school.id })
    );
    const res = await createTeacher(other.school.id, "Mrs. Adaeze Okafor");
    assert.equal(res.status, 201);
  });

  it("allows a STUDENT to share a teacher's name (only TEACHER accounts count)", async () => {
    const { school, admin } = await schoolAndAdmin();
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await usersPOST(
      new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Mrs. Adaeze Okafor",
          email: "student.adaeze@test.app",
          role: "STUDENT",
          assignedClass: "JSS1",
        }),
      })
    );
    assert.equal(res.status, 201);
  });
});

describe("POST /api/auth/login — teachers sign in with name + school name", () => {
  it("signs a teacher in with their name and the school name as the password", async () => {
    const { school } = await schoolAndAdmin();
    const res = await login({
      name: "Mrs. Adaeze Okafor",
      password: "Greenfield International School",
      role: "TEACHER",
      schoolId: school.id,
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.user.role, "TEACHER");
  });

  it("matches the school name case- and spacing-insensitively", async () => {
    const { school } = await schoolAndAdmin();
    const res = await login({
      name: "Mrs. Adaeze Okafor",
      password: "  greenfieldINTERNATIONALschool ",
      role: "TEACHER",
      schoolId: school.id,
    });
    assert.equal(res.status, 200);
  });

  it("rejects a wrong password — warmly worded, without leaking whether the account exists", async () => {
    const { school } = await schoolAndAdmin();
    const res = await login({
      name: "Mrs. Adaeze Okafor",
      password: "not-the-school-name",
      role: "TEACHER",
      schoolId: school.id,
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /^Sorry/i);
    assert.match(data.error, /didn't match/i);
  });

  it("uses the same warm wording for email logins with a wrong password", async () => {
    const { school } = await schoolAndAdmin();
    const res = await login({
      email: "a.okafor@edutrack.app",
      password: "wrong-password",
      role: "TEACHER",
      schoolId: school.id,
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /^Sorry/i);
    assert.match(data.error, /didn't match/i);
  });

  it("tells a teacher whose name is not in the school to contact the admin", async () => {
    const { school } = await schoolAndAdmin();
    const res = await login({
      name: "Mrs. Nobody Here",
      password: "Greenfield International School",
      role: "TEACHER",
      schoolId: school.id,
    });
    const data = await res.json();
    assert.equal(res.status, 401);
    assert.match(data.error, /^Sorry/i);
    assert.match(data.error, /doesn't exist/i);
    assert.match(data.error, /administrator|admin/i);
  });

  it("legacy email login for a teacher still works", async () => {
    const { school } = await schoolAndAdmin();
    const res = await login({
      email: "a.okafor@edutrack.app",
      password: "teacher123",
      role: "TEACHER",
      schoolId: school.id,
    });
    assert.equal(res.status, 200);
  });

  it("a teacher's name does not resolve a PARENT account", async () => {
    const { school } = await schoolAndAdmin();
    const res = await login({
      name: "Mrs. Adaeze Okafor",
      password: "Greenfield International School",
      role: "PARENT",
      schoolId: school.id,
    });
    assert.equal(res.status, 401);
  });

  it("a freshly created name-only teacher can sign in with name + school name", async () => {
    const { school, admin } = await schoolAndAdmin();
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));
    const created = await createTeacher(school.id, "Mr. Brand New");
    assert.equal(created.status, 201);

    const res = await login({
      name: "Mr. Brand New",
      password: "Greenfield International School",
      role: "TEACHER",
      schoolId: school.id,
    });
    assert.equal(res.status, 200);
  });
});

describe("PATCH /api/users — teacher renames are duplicate-guarded too", () => {
  it("rejects renaming a teacher to another teacher's name in the school", async () => {
    const { school, admin } = await schoolAndAdmin();
    const token = signToken({ userId: admin.id, role: admin.role, schoolId: school.id });
    __setSessionToken(token);
    const created = await createTeacher(school.id, "Mr. Fresh Teacher");
    const teacherId = (await created.json()).user.id;

    __setSessionToken(token);
    const res = await renameTeacher(token, teacherId, "Mrs. Adaeze Okafor"); // seeded teacher
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /already exists/i);
  });

  it("allows a rename to the teacher's own current name (self-match excluded)", async () => {
    const { school, admin } = await schoolAndAdmin();
    const token = signToken({ userId: admin.id, role: admin.role, schoolId: school.id });
    __setSessionToken(token);
    const created = await createTeacher(school.id, "Mr. Fresh Teacher");
    const teacherId = (await created.json()).user.id;

    __setSessionToken(token);
    const res = await renameTeacher(token, teacherId, "Mr. Fresh Teacher");
    assert.equal(res.status, 200);
  });
});
