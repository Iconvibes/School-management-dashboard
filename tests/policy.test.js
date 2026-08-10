/**
 * Policy tests — requireAuth / requirePermission session re-validation (P1).
 *
 * The JWT is only a ticket: requireAuth re-checks the acting user against the
 * store on every call, so deleted accounts, demotions and school moves take
 * effect immediately instead of after the 7-day token expiry.
 *
 * The guards read the real cookie jar only when no session is injected; these
 * tests pass a fake session as the optional argument and drive the seeded demo
 * store, so every branch of the re-validation runs end to end.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";

// policy.js binds its store from MONGODB_URI at module-evaluation time — force
// demo mode so these tests run against the in-memory seed even when a developer
// has MONGODB_URI exported in their shell. (Each node --test file runs in its
// own process, so this cannot affect other suites.)
const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { isDenied, requireAuth, requirePermission } = await import("../src/lib/policy.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-policy-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function seededSchoolId() {
  const [match] = await demoStore.searchSchools("Greenfield");
  return match.id;
}

/** The first seeded user of a role in the Greenfield school. */
async function seededUser(role) {
  const schoolId = await seededSchoolId();
  const [user] = await demoStore.listUsers({ schoolId, role });
  return user;
}

describe("requireAuth — session re-validation (P1)", () => {
  it("honors a valid session for an unchanged account", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const session = { userId: admin.id, role: "SUPER_ADMIN", schoolId: admin.schoolId };

    const out = await requireAuth(["SUPER_ADMIN", "BURSAR"], session);

    assert.equal(isDenied(out), false);
    assert.equal(out.userId, admin.id);
    assert.equal(out.role, "SUPER_ADMIN");
  });

  it("any-authenticated gate (no role list) passes for an unchanged account", async () => {
    const parent = await seededUser("PARENT");
    const session = { userId: parent.id, role: "PARENT", schoolId: parent.schoolId };

    const out = await requireAuth(undefined, session);

    assert.equal(isDenied(out), false);
    assert.equal(out.role, "PARENT");
  });

  it("401 when there is no session at all (missing/invalid cookie)", async () => {
    // No injected session → the guard falls through to the real cookie jar,
    // which cannot exist outside a request scope (getSession → null).
    const out = await requireAuth(["SUPER_ADMIN"]);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 401);
  });

  it("401 when the account was deleted — old tokens die immediately", async () => {
    const schoolId = await seededSchoolId();
    const created = await demoStore.createUser({
      schoolId,
      name: "Doomed Admin",
      email: "doomed@edutrack.app",
      password: "doom123",
      role: "SUPER_ADMIN",
    });
    const session = { userId: created.id, role: "SUPER_ADMIN", schoolId };

    await demoStore.deleteUser(created.id);
    const out = await requireAuth(["SUPER_ADMIN"], session);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 401);
  });

  it("401 when the token's role claim is stale (user was demoted)", async () => {
    const teacher = await seededUser("TEACHER");
    // Token was issued when this account was still an admin — the DB knows better.
    const staleSession = {
      userId: teacher.id,
      role: "SUPER_ADMIN",
      schoolId: teacher.schoolId,
    };

    const out = await requireAuth(["SUPER_ADMIN", "TEACHER"], staleSession);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 401);
  });

  it("401 when the token's schoolId no longer matches (user moved school)", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    // A second tenant, created via the normal registration path.
    const { school: otherSchool } = await demoStore.createSchoolAndAdmin({
      schoolName: "Other Academy",
      adminName: "Other Admin",
      email: "other@edutrack.app",
      password: "other123",
    });
    const staleSession = { userId: admin.id, role: "SUPER_ADMIN", schoolId: otherSchool.id };

    const out = await requireAuth(["SUPER_ADMIN"], staleSession);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 401);
  });

  it("403 when the account is valid but the route does not allow its role", async () => {
    const teacher = await seededUser("TEACHER");
    const session = { userId: teacher.id, role: "TEACHER", schoolId: teacher.schoolId };

    const out = await requireAuth(["SUPER_ADMIN", "BURSAR"], session);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 403);
  });

  it("gates on the FRESH store role, not the token claim", async () => {
    const registrar = await seededUser("REGISTRAR");
    const session = { userId: registrar.id, role: "REGISTRAR", schoolId: registrar.schoolId };

    // Token claims match the store — the account is fine, but this route only
    // admits SUPER_ADMIN, so the fresh-role gate still denies.
    const out = await requireAuth(["SUPER_ADMIN"], session);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 403);
  });
});

describe("requirePermission — action gate after re-validation", () => {
  it("lets a BURSAR record a fee payment but not confirm one", async () => {
    const bursar = await seededUser("BURSAR");
    const session = { userId: bursar.id, role: "BURSAR", schoolId: bursar.schoolId };

    const record = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.record", session);
    assert.equal(isDenied(record), false);
    assert.equal(record.role, "BURSAR");

    const confirm = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.confirm", session);
    assert.equal(isDenied(confirm), true);
    assert.equal(confirm.status, 403);
  });

  it("rejects a stale admin token before the action check", async () => {
    const registrar = await seededUser("REGISTRAR");
    const staleSession = {
      userId: registrar.id,
      role: "SUPER_ADMIN",
      schoolId: registrar.schoolId,
    };

    const out = await requirePermission(["SUPER_ADMIN"], "users.manage", staleSession);

    assert.equal(isDenied(out), true);
    assert.equal(out.status, 401);
  });

  it("enforces the admin-console actions (school.edit, users.edit, notifications.view)", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const registrar = await seededUser("REGISTRAR");
    const bursar = await seededUser("BURSAR");
    const adminSession = { userId: admin.id, role: "SUPER_ADMIN", schoolId: admin.schoolId };
    const registrarSession = { userId: registrar.id, role: "REGISTRAR", schoolId: registrar.schoolId };
    const bursarSession = { userId: bursar.id, role: "BURSAR", schoolId: bursar.schoolId };

    // SUPER_ADMIN may edit school settings / read the inbox.
    const school = await requirePermission(["SUPER_ADMIN"], "school.edit", adminSession);
    assert.equal(isDenied(school), false);
    const inbox = await requirePermission(["SUPER_ADMIN"], "notifications.view", adminSession);
    assert.equal(isDenied(inbox), false);

    // REGISTRAR may edit user records but not school settings or the inbox.
    const edit = await requirePermission(["SUPER_ADMIN", "REGISTRAR"], "users.edit", registrarSession);
    assert.equal(isDenied(edit), false);
    const notSchool = await requirePermission(["SUPER_ADMIN"], "school.edit", registrarSession);
    assert.equal(isDenied(notSchool), true);
    assert.equal(notSchool.status, 403);
    const notInbox = await requirePermission(["SUPER_ADMIN"], "notifications.view", registrarSession);
    assert.equal(isDenied(notInbox), true);
    assert.equal(notInbox.status, 403);

    // BURSAR holds none of these.
    const bursarEdit = await requirePermission(["SUPER_ADMIN", "REGISTRAR"], "users.edit", bursarSession);
    assert.equal(isDenied(bursarEdit), true);
    assert.equal(bursarEdit.status, 403);
  });
});
