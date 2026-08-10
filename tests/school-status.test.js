/**
 * Soft-deactivation (freeze) tests.
 *
 * A school can freeze its account from the dashboard danger zone: every
 * non-super-admin login is blocked (new sign-ins AND already-issued sessions)
 * while ALL data is kept, and the SUPER_ADMIN can always get back in to
 * reactivate. These tests cover the store flip, the requireAuth guard and the
 * login-route gate.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";
import { requireAuth, isDenied } from "../src/lib/policy.js";
import { POST as login } from "../src/app/api/auth/login/route.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-school-status-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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
});

async function seededSchool() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return demoStore.getSchoolById(match.id);
}

async function seededUsers() {
  const school = await seededSchool();
  const admin = await demoStore.createUser({
    schoolId: school.id,
    name: "Founder",
    email: "founder@greenfield.test",
    password: "adminpass",
    role: "SUPER_ADMIN",
  });
  const teacher = await demoStore.createUser({
    schoolId: school.id,
    name: "Mrs. Eze",
    email: "eze@greenfield.test",
    password: "teachpass",
    role: "TEACHER",
    assignedClass: "JSS1",
  });
  return { school, admin, teacher };
}

function fakeSession(user) {
  return { userId: user.id, schoolId: user.schoolId, role: user.role };
}

describe("setSchoolStatus", () => {
  it("returns null for a missing school", async () => {
    assert.equal(await demoStore.setSchoolStatus("sch_nope", "frozen"), null);
  });

  it("freezes and reactivates without touching data", async () => {
    const { school } = await seededUsers();
    const before = await demoStore.countUsers({ schoolId: school.id });
    assert.ok(before > 0);

    const frozen = await demoStore.setSchoolStatus(school.id, "frozen");
    assert.equal(frozen.status, "frozen");
    assert.equal((await demoStore.getSchoolById(school.id)).status, "frozen");
    // Data survives the freeze.
    assert.equal(await demoStore.countUsers({ schoolId: school.id }), before);

    const active = await demoStore.setSchoolStatus(school.id, "reactivate");
    assert.equal(active.status, "active");
    assert.equal((await demoStore.getSchoolById(school.id)).status, "active");
  });
});

describe("requireAuth for a frozen school", () => {
  it("blocks a non-super-admin session with a clear message", async () => {
    const { school, teacher } = await seededUsers();
    await demoStore.setSchoolStatus(school.id, "frozen");

    const res = await requireAuth(["TEACHER"], fakeSession(teacher));
    assert.ok(isDenied(res));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /deactivated/i);
  });

  it("lets the SUPER_ADMIN through so the account can be reactivated", async () => {
    const { school, admin } = await seededUsers();
    await demoStore.setSchoolStatus(school.id, "frozen");

    const session = await requireAuth(["SUPER_ADMIN"], fakeSession(admin));
    assert.ok(!isDenied(session));
    assert.equal(session.role, "SUPER_ADMIN");
  });

  it("lets non-super admins back in once reactivated", async () => {
    const { school, teacher } = await seededUsers();
    await demoStore.setSchoolStatus(school.id, "frozen");
    await demoStore.setSchoolStatus(school.id, "active");

    const session = await requireAuth(["TEACHER"], fakeSession(teacher));
    assert.ok(!isDenied(session));
  });
});

describe("login route for a frozen school", () => {
  async function postLogin(email, password, schoolId) {
    return login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, schoolId }),
      })
    );
  }

  it("rejects staff sign-in while frozen", async () => {
    const { school, teacher } = await seededUsers();
    await demoStore.setSchoolStatus(school.id, "frozen");

    const res = await postLogin("eze@greenfield.test", "teachpass", school.id);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /deactivated/i);
  });

  it("rejects a parent sign-in while frozen", async () => {
    const { school } = await seededUsers();
    const parent = await demoStore.createUser({
      schoolId: school.id,
      name: "Mrs. Parent",
      email: "parent@greenfield.test",
      password: "parentpass",
      role: "PARENT",
    });
    await demoStore.setSchoolStatus(school.id, "frozen");

    const res = await postLogin("parent@greenfield.test", "parentpass", school.id);
    assert.equal(res.status, 403);
  });

  it("still lets the SUPER_ADMIN through to reactivate", async () => {
    const { school, admin } = await seededUsers();
    await demoStore.setSchoolStatus(school.id, "frozen");

    const res = await postLogin("founder@greenfield.test", "adminpass", school.id);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.redirect, "/admin/dashboard");
  });
});

describe("requireAuth for a deleted school (grace period)", () => {
  it("blocks a non-super-admin session while the school is deleted", async () => {
    const { school, teacher } = await seededUsers();
    await demoStore.deleteSchool(school.id);

    const res = await requireAuth(["TEACHER"], fakeSession(teacher));
    assert.ok(isDenied(res));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /deleted/i);
  });

  it("lets the SUPER_ADMIN through during the grace period to restore", async () => {
    const { school, admin } = await seededUsers();
    await demoStore.deleteSchool(school.id);

    const session = await requireAuth(["SUPER_ADMIN"], fakeSession(admin));
    assert.ok(!isDenied(session));
  });

  it("fails closed after the grace period ends (account purged)", async () => {
    const { school, teacher } = await seededUsers();
    await demoStore.deleteSchool(school.id);
    await demoStore.purgeExpiredDeletedSchools({ now: Date.now() + 31 * 24 * 60 * 60 * 1000 });

    const res = await requireAuth(["TEACHER"], fakeSession(teacher));
    assert.ok(isDenied(res));
    assert.equal(res.status, 401);
  });
});

describe("login route for a deleted school (grace period)", () => {
  async function postLogin(email, password, schoolId) {
    return login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, schoolId }),
      })
    );
  }

  it("rejects staff while the school is deleted, inside the grace period", async () => {
    const { school, teacher } = await seededUsers();
    await demoStore.deleteSchool(school.id);

    const res = await postLogin("eze@greenfield.test", "teachpass", school.id);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /deleted/i);
  });

  it("lets the SUPER_ADMIN in during the grace period to restore", async () => {
    const { school, admin } = await seededUsers();
    await demoStore.deleteSchool(school.id);

    const res = await postLogin("founder@greenfield.test", "adminpass", school.id);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.redirect, "/admin/dashboard");
  });

  it("rejects after the grace period once the tenant is purged", async () => {
    const { school, admin } = await seededUsers();
    await demoStore.deleteSchool(school.id);
    await demoStore.purgeExpiredDeletedSchools({ now: Date.now() + 31 * 24 * 60 * 60 * 1000 });

    const res = await postLogin("founder@greenfield.test", "adminpass", school.id);
    assert.equal(res.status, 401);
    assert.equal(await demoStore.getSchoolById(school.id), undefined);
  });
});
