/**
 * Route-level integration tests — the REGISTRAR / BURSAR / SUPER_ADMIN gate
 * matrix, locked in as code.
 *
 * This is the automated version of the live HTTP verification that confirmed
 * "PATCH users / reset-password work for REGISTRAR on students but 403 on
 * teachers and on school PATCH, and BURSAR gets 403 on all of them." Instead
 * of a running server, it drives the REAL route handlers end to end:
 *
 *   src/app/api/users/[id]/route.js          (PATCH — users.edit + mayEditUser)
 *   src/app/api/users/[id]/reset-password/route.js (POST — users.password.reset
 *                                                   + mayResetPassword)
 *   src/app/api/school/route.js              (PATCH — school.edit)
 *
 * The routes read the session cookie through next/headers, so a node:module
 * resolve hook maps `next/headers.js` to tests/helpers/headers-mock.js, which
 * serves a REAL signed JWT (src/lib/token.js signToken) for the acting user.
 * Every branch of the chain runs: cookie read → signature/expiry check →
 * store re-validation (deleted accounts die at the route boundary) → role
 * gate → matrix action → tenant scope → field guard → store mutation.
 *
 * The matrix cells asserted here (status + exact 403 copy where the copy is
 * load-bearing):
 *
 *   users PATCH            student teacher parent  BURSAR→any  cross-tenant
 *     SUPER_ADMIN             200     200     200      —            403
 *     REGISTRAR               200     403     200      —            403
 *     BURSAR                  403     403      —       —             —
 *   reset-password POST      student teacher parent
 *     SUPER_ADMIN             200     200     200
 *     REGISTRAR               200     403     200
 *     BURSAR                  403     403      —
 *   school PATCH               SUPER_ADMIN 200 | REGISTRAR 403 | BURSAR 403
 *
 * Secondary error paths are pinned too: non-JSON bodies → 400, parent-link
 * validation → 400 (wrong role or other tenant), password-length 400,
 * missing targets → 404, no session → 401 (PATCH and school GET), and a
 * deleted account's token dying with 401 at the route boundary (P1).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import * as demoStore from "../src/lib/demo-store.js";
import { signToken } from "../src/lib/token.js";
import { __setSessionToken } from "./helpers/headers-mock.js";

// Intercept next/headers BEFORE any app module that imports it is evaluated.
// Everything else (including next/server.js — NextResponse, used by jsonError)
// falls through to the real packages, exactly like the other suites.
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

// store.js binds its store from MONGODB_URI at module-evaluation time — force
// demo mode (same pattern as tests/policy.test.js; node --test isolates each
// file in its own process, so this cannot affect other suites).
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { PATCH: userPATCH } = await import("../src/app/api/users/[id]/route.js");
const { POST: resetPasswordPOST } = await import(
  "../src/app/api/users/[id]/reset-password/route.js"
);
const { GET: schoolGET, PATCH: schoolPATCH } = await import(
  "../src/app/api/school/route.js"
);
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-route-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;

beforeEach(() => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
  __setSessionToken("");
});

/** First seeded user of a role in the Greenfield demo school. */
async function seededUser(role) {
  const [match] = await demoStore.searchSchools("Greenfield");
  const [user] = await demoStore.listUsers({ schoolId: match.id, role });
  return user;
}

/** Sign a real session token for `user` and put it in the mock cookie jar. */
function signInAs(user) {
  __setSessionToken(
    signToken({ userId: user.id, role: user.role, schoolId: user.schoolId })
  );
}

const jsonOf = (r) => r.json().catch(() => null);

async function patchUser(id, body) {
  const res = await userPATCH(
    new Request("http://localhost/api/users/u", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
  return { status: res.status, body: await jsonOf(res) };
}

async function resetPassword(id) {
  const res = await resetPasswordPOST(
    new Request("http://localhost/api/users/u/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ id }) }
  );
  return { status: res.status, body: await jsonOf(res) };
}

async function patchSchool(body) {
  const res = await schoolPATCH(
    new Request("http://localhost/api/school", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || { name: "Renamed School" }),
    })
  );
  return { status: res.status, body: await jsonOf(res) };
}

async function getSchool() {
  const res = await schoolGET();
  return { status: res.status, body: await jsonOf(res) };
}

describe("users/[id] PATCH — users.edit + mayEditUser", () => {
  it("SUPER_ADMIN may edit students, teachers and parents", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    signInAs(admin);
    for (const role of ["STUDENT", "TEACHER", "PARENT"]) {
      const target = await seededUser(role);
      const { status, body } = await patchUser(target.id, { name: "Renamed" });
      assert.equal(status, 200, `${role} should be editable`);
      assert.equal(body.user.name, "Renamed");
    }
  });

  it("REGISTRAR may edit students and parents but NEVER staff/teachers", async () => {
    const registrar = await seededUser("REGISTRAR");
    signInAs(registrar);

    const student = await seededUser("STUDENT");
    const studentPatch = await patchUser(student.id, { name: "Renamed Kid" });
    assert.equal(studentPatch.status, 200);
    assert.equal(studentPatch.body.user.name, "Renamed Kid");

    const parent = await seededUser("PARENT");
    assert.equal((await patchUser(parent.id, { name: "Renamed Parent" })).status, 200);

    const teacher = await seededUser("TEACHER");
    const blocked = await patchUser(teacher.id, { name: "Renamed Teacher" });
    assert.equal(blocked.status, 403);
    assert.equal(
      blocked.body.error,
      "Registrars can only edit student and parent records",
      "the exact registrar-scope copy is load-bearing"
    );
  });

  it("REGISTRAR cannot touch money flags (payrollStatus, feePaid) even on a student", async () => {
    const registrar = await seededUser("REGISTRAR");
    const student = await seededUser("STUDENT");
    signInAs(registrar);
    for (const [flag, value] of [["payrollStatus", "PAID"], ["feePaid", true]]) {
      const { status } = await patchUser(student.id, { name: "x", [flag]: value });
      assert.equal(status, 403, `${flag} must stay with the SUPER_ADMIN`);
    }
  });

  it("BURSAR is denied entirely — no users.edit action", async () => {
    // Either the role gate (BURSAR not in the route's role list) or the
    // action gate (no users.edit) produces this 403 — both are the same
    // outcome by design, and the route returns the same "Forbidden".
    const bursar = await seededUser("BURSAR");
    const student = await seededUser("STUDENT");
    signInAs(bursar);
    const { status, body } = await patchUser(student.id, { name: "x" });
    assert.equal(status, 403);
    assert.equal(body.error, "Forbidden");
  });

  it("a non-JSON body is a 400, after the gate but before any mutation", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const student = await seededUser("STUDENT");
    signInAs(admin);
    const res = await userPATCH(
      new Request("http://localhost/api/users/u", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{ this is not json",
      }),
      { params: Promise.resolve({ id: student.id }) }
    );
    assert.equal(res.status, 400);
    assert.equal((await jsonOf(res)).error, "Invalid request body");
  });

  it("linking a parent is validated: must be a parent account in THIS school", async () => {
    const registrar = await seededUser("REGISTRAR");
    const student = await seededUser("STUDENT");
    signInAs(registrar);

    // Happy path: the seeded parent account links cleanly.
    const parent = await seededUser("PARENT");
    const linked = await patchUser(student.id, { parentId: parent.id });
    assert.equal(linked.status, 200);
    assert.equal(linked.body.user.parentId, parent.id);

    // A teacher is not a parent account → 400.
    const teacher = await seededUser("TEACHER");
    const wrongRole = await patchUser(student.id, { parentId: teacher.id });
    assert.equal(wrongRole.status, 400);
    assert.equal(wrongRole.body.error, "Parent must be a parent account in your school");

    // A parent of ANOTHER school → 400 (no cross-tenant linking).
    const { school: other } = await demoStore.createSchoolAndAdmin({
      schoolName: "Other Academy",
      adminName: "Other Admin",
      email: "other@edutrack.app",
      password: "other123",
    });
    const foreignParent = await demoStore.createUser({
      schoolId: other.id,
      name: "Foreign Parent",
      email: "fp@other.app",
      password: "fp123456",
      role: "PARENT",
    });
    const crossTenant = await patchUser(student.id, { parentId: foreignParent.id });
    assert.equal(crossTenant.status, 400);
  });

  it("cross-tenant edits are rejected for EVERYONE, even SUPER_ADMIN", async () => {
    const { school: other } = await demoStore.createSchoolAndAdmin({
      schoolName: "Other Academy",
      adminName: "Other Admin",
      email: "other@edutrack.app",
      password: "other123",
    });
    const otherAdmin = await demoStore.findUserByEmailInSchool(
      other.id,
      "other@edutrack.app"
    );
    assert.ok(otherAdmin, "second tenant exists");

    const admin = await seededUser("SUPER_ADMIN");
    const registrar = await seededUser("REGISTRAR");
    for (const actor of [admin, registrar]) {
      signInAs(actor);
      const { status, body } = await patchUser(otherAdmin.id, { name: "x" });
      assert.equal(status, 403, `${actor.role} cannot touch another school's users`);
      assert.equal(body.error, "Forbidden");
    }
  });

  it("a missing target stays a 404, distinct from Forbidden", async () => {
    const registrar = await seededUser("REGISTRAR");
    signInAs(registrar);
    const { status } = await patchUser("usr_does_not_exist", { name: "x" });
    assert.equal(status, 404);
  });
});

describe("reset-password POST — users.password.reset + mayResetPassword", () => {
  it("SUPER_ADMIN may reset any account", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    signInAs(admin);
    for (const role of ["STUDENT", "TEACHER", "PARENT"]) {
      const target = await seededUser(role);
      const { status, body } = await resetPassword(target.id);
      assert.equal(status, 200, `${role} reset should succeed`);
      assert.ok(
        typeof body.newPassword === "string" && body.newPassword.length >= 6,
        "returns a usable temporary password"
      );
    }
  });

  it("REGISTRAR may hand out student/parent logins but never staff/teacher ones", async () => {
    const registrar = await seededUser("REGISTRAR");
    signInAs(registrar);

    const student = await seededUser("STUDENT");
    assert.equal((await resetPassword(student.id)).status, 200);
    const parent = await seededUser("PARENT");
    assert.equal((await resetPassword(parent.id)).status, 200);

    const teacher = await seededUser("TEACHER");
    const blocked = await resetPassword(teacher.id);
    assert.equal(blocked.status, 403);
    assert.equal(
      blocked.body.error,
      "Registrars can only reset student and parent passwords"
    );
  });

  it("BURSAR can never reset a password", async () => {
    const bursar = await seededUser("BURSAR");
    const student = await seededUser("STUDENT");
    signInAs(bursar);
    const { status } = await resetPassword(student.id);
    assert.equal(status, 403);
  });

  it("an explicitly provided password is honored, and a too-short one is a 400", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const student = await seededUser("STUDENT");
    signInAs(admin);

    const provided = await resetPasswordPOST(
      new Request("http://localhost/api/users/u/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "freshpass9" }),
      }),
      { params: Promise.resolve({ id: student.id }) }
    );
    assert.equal(provided.status, 200);
    assert.equal((await jsonOf(provided)).newPassword, "freshpass9");

    const tooShort = await resetPasswordPOST(
      new Request("http://localhost/api/users/u/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "abc" }),
      }),
      { params: Promise.resolve({ id: student.id }) }
    );
    assert.equal(tooShort.status, 400);
    assert.match((await jsonOf(tooShort)).error, /at least/);
  });

  it("reset-password on a missing target is a 404, and a non-JSON body is a 400", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const student = await seededUser("STUDENT");
    signInAs(admin);

    const missing = await resetPassword("usr_does_not_exist");
    assert.equal(missing.status, 404);

    const badBody = await resetPasswordPOST(
      new Request("http://localhost/api/users/u/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ nope",
      }),
      { params: Promise.resolve({ id: student.id }) }
    );
    assert.equal(badBody.status, 400);
    assert.equal((await jsonOf(badBody)).error, "Invalid request body");
  });

  it("cross-tenant resets are rejected", async () => {
    const { school: other } = await demoStore.createSchoolAndAdmin({
      schoolName: "Other Academy",
      adminName: "Other Admin",
      email: "other@edutrack.app",
      password: "other123",
    });
    const otherAdmin = await demoStore.findUserByEmailInSchool(
      other.id,
      "other@edutrack.app"
    );
    const registrar = await seededUser("REGISTRAR");
    signInAs(registrar);
    assert.equal((await resetPassword(otherAdmin.id)).status, 403);
  });
});

describe("school PATCH — school.edit is SUPER_ADMIN-only", () => {
  it("SUPER_ADMIN may rename the school", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    signInAs(admin);
    const { status, body } = await patchSchool({ name: "Renamed School" });
    assert.equal(status, 200);
    assert.equal(body.school.name, "Renamed School");
  });

  it("REGISTRAR and BURSAR get 403 on school PATCH but may still GET it", async () => {
    for (const role of ["REGISTRAR", "BURSAR"]) {
      const actor = await seededUser(role);
      signInAs(actor);
      const { status, body } = await patchSchool({ name: "Hijack" });
      assert.equal(status, 403, `${role} cannot edit school settings`);
      assert.equal(body.error, "Forbidden");
      const read = await getSchool();
      assert.equal(read.status, 200, `${role} may still read the school`);
      assert.equal(read.body.school.name, "Greenfield International School");
    }
  });
});

describe("the session boundary at the route level", () => {
  it("no cookie at all → 401 before any gate runs", async () => {
    const student = await seededUser("STUDENT");
    const { status, body } = await patchUser(student.id, { name: "x" });
    assert.equal(status, 401);
    assert.equal(body.error, "Not authenticated");
  });

  it("school GET without a session is a 401 (open requireAuth gate)", async () => {
    const { status, body } = await getSchool();
    assert.equal(status, 401);
    assert.equal(body.error, "Not authenticated");
  });

  it("a deleted account's token dies at the route boundary (P1 re-validation)", async () => {
    const schoolId = (await seededUser("SUPER_ADMIN")).schoolId;
    const doomed = await demoStore.createUser({
      schoolId,
      name: "Doomed Admin",
      email: "doomed@edutrack.app",
      password: "doom123",
      role: "SUPER_ADMIN",
    });
    const student = await seededUser("STUDENT");
    signInAs(doomed);
    await demoStore.deleteUser(doomed.id);
    const { status, body } = await patchUser(student.id, { name: "x" });
    assert.equal(status, 401);
    assert.equal(body.error, "Session no longer valid. Please sign in again.");
  });
});
