/**
 * Role-management tests — the pure decision policy behind PATCH /api/users/[id]/role
 * and the demo-store role/audit round-trip (the API route is a thin shell over
 * both, so covering them covers the route's logic).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";
import { evaluateRoleChange, MANAGED_ROLES } from "../src/lib/roles.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-roles-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function seededUser(role) {
  const schoolId = await seededSchoolId();
  const [user] = await demoStore.listUsers({ schoolId, role });
  return user;
}

describe("evaluateRoleChange", () => {
  const actorId = "usr_actor";

  it("allows a valid promotion/demotion between staff roles", () => {
    const teacher = { id: "usr_t1", role: "TEACHER", name: "T" };
    assert.deepEqual(
      evaluateRoleChange({ actorId, target: teacher, newRole: "REGISTRAR", superAdminCount: 1 }),
      { ok: true }
    );
    const admin = { id: "usr_a1", role: "SUPER_ADMIN", name: "A" };
    assert.deepEqual(
      evaluateRoleChange({ actorId, target: admin, newRole: "TEACHER", superAdminCount: 2 }),
      { ok: true }
    );
  });

  it("rejects missing targets and unknown roles", () => {
    assert.equal(evaluateRoleChange({ actorId, target: null, newRole: "TEACHER", superAdminCount: 1 }).ok, false);
    assert.equal(evaluateRoleChange({ actorId, target: { id: "u", role: "TEACHER" }, newRole: "BOGUS", superAdminCount: 1 }).ok, false);
  });

  it("only re-rolls staff accounts, to staff roles", () => {
    const student = { id: "usr_s", role: "STUDENT" };
    const asStudent = evaluateRoleChange({ actorId, target: student, newRole: "TEACHER", superAdminCount: 1 });
    assert.equal(asStudent.ok, false);
    assert.match(asStudent.error, /staff/);

    const teacher = { id: "usr_t", role: "TEACHER" };
    const toParent = evaluateRoleChange({ actorId, target: teacher, newRole: "PARENT", superAdminCount: 1 });
    assert.equal(toParent.ok, false);
  });

  it("forbids changing your own role", () => {
    const me = { id: actorId, role: "SUPER_ADMIN" };
    const out = evaluateRoleChange({ actorId, target: me, newRole: "BURSAR", superAdminCount: 2 });
    assert.equal(out.ok, false);
    assert.match(out.error, /own role/);
  });

  it("forbids a no-op and demoting the last Super Admin", () => {
    const admin = { id: "usr_a", role: "SUPER_ADMIN" };
    const noop = evaluateRoleChange({ actorId, target: admin, newRole: "SUPER_ADMIN", superAdminCount: 1 });
    assert.equal(noop.ok, false);

    const last = evaluateRoleChange({ actorId, target: admin, newRole: "BURSAR", superAdminCount: 1 });
    assert.equal(last.ok, false);
    assert.match(last.error, /Super Admin/);

    // With a second super admin it's fine.
    assert.equal(evaluateRoleChange({ actorId, target: admin, newRole: "BURSAR", superAdminCount: 2 }).ok, true);
  });

  it("MANAGED_ROLES covers exactly the four staff roles", () => {
    assert.deepEqual([...MANAGED_ROLES], ["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER"]);
  });
});

describe("demo store role + audit round-trip", () => {
  it("updateRole changes the stored role and the audit trail logs it newest-first", async () => {
    const schoolId = await seededSchoolId();
    const teacher = await seededUser("TEACHER");
    const admin = await seededUser("SUPER_ADMIN");

    const updated = await demoStore.updateRole(teacher.id, "REGISTRAR");
    assert.equal(updated.role, "REGISTRAR");
    assert.equal(updated.password, undefined, "the hash must never leak in a response");
    const reloaded = await demoStore.findUserById(teacher.id);
    assert.equal(reloaded.role, "REGISTRAR");

    await demoStore.logRoleAudit({
      schoolId,
      actorId: admin.id,
      actorName: admin.name,
      actorRole: "SUPER_ADMIN",
      targetId: teacher.id,
      targetName: teacher.name,
      fromRole: "TEACHER",
      toRole: "REGISTRAR",
    });

    const entries = await demoStore.listRoleAudit(schoolId);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].fromRole, "TEACHER");
    assert.equal(entries[0].toRole, "REGISTRAR");
    assert.equal(entries[0].actorName, admin.name);
    assert.equal(entries[0].targetId, teacher.id);

    // A second entry lands on top (newest first) and the limit applies.
    await demoStore.logRoleAudit({
      schoolId,
      actorId: admin.id,
      actorName: admin.name,
      actorRole: "SUPER_ADMIN",
      targetId: teacher.id,
      targetName: teacher.name,
      fromRole: "REGISTRAR",
      toRole: "BURSAR",
    });
    const two = await demoStore.listRoleAudit(schoolId, { limit: 1 });
    assert.equal(two.length, 1);
    assert.equal(two[0].toRole, "BURSAR");
  });

  it("role changes and audit entries survive a simulated restart", async () => {
    const schoolId = await seededSchoolId();
    const teacher = await seededUser("TEACHER");
    const admin = await seededUser("SUPER_ADMIN");

    await demoStore.updateRole(teacher.id, "BURSAR");
    await demoStore.logRoleAudit({
      schoolId,
      actorId: admin.id,
      actorName: admin.name,
      actorRole: "SUPER_ADMIN",
      targetId: teacher.id,
      targetName: teacher.name,
      fromRole: "TEACHER",
      toRole: "BURSAR",
    });
    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    const reloaded = await demoStore.findUserById(teacher.id);
    assert.equal(reloaded.role, "BURSAR", "role survived the restart");
    const entries = await demoStore.listRoleAudit(schoolId);
    assert.equal(entries.length, 1, "audit entry survived the restart");
    assert.equal(entries[0].toRole, "BURSAR");
  });
});
