/**
 * Account & school deletion tests.
 *
 * - deleteUser cascades: a removed student takes their scores/attendance/fee
 *   payments with them; a removed teacher frees their timetable slots.
 * - deleteSchool wipes an entire tenant (school + users + scores + fees +
 *   attendance + timetable + archives) but keeps platform-level leads.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-del-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

describe("deleteUser cascade", () => {
  it("removes a student together with their scores, attendance and fee payments", async () => {
    const school = await seededSchool();
    const student = await demoStore.createUser({
      schoolId: school.id,
      name: "Leaver Student",
      email: "leaver@test.app",
      password: "leaver123",
      role: "STUDENT",
      assignedClass: "JSS1",
    });
    await demoStore.saveScores({
      schoolId: school.id,
      classArm: "JSS1",
      subject: "Mathematics",
      rows: [{ studentId: student.id, caScore: 30, examScore: 40 }],
    });
    await demoStore.recordFeePayment({
      schoolId: school.id,
      studentId: student.id,
      amount: 50000,
      method: "CASH",
      note: "test",
    });

    assert.equal((await demoStore.getScoresByStudent(student.id)).length, 1);

    const ok = await demoStore.deleteUser(student.id);
    assert.equal(ok, true);
    assert.equal(await demoStore.findUserById(student.id), null);
    assert.equal((await demoStore.getScoresByStudent(student.id)).length, 0);
    // Fee payments ledger is keyed by student — the payment is gone too.
    const ledger = await demoStore.getFeeLedger(school.id, { studentIds: [student.id] });
    assert.equal(ledger.length, 0);
  });

  it("removes a teacher and frees their timetable slots", async () => {
    const school = await seededSchool();
    const teacher = await demoStore.createUser({
      schoolId: school.id,
      name: "Departed Teacher",
      email: "departed@test.app",
      password: "departed1",
      role: "TEACHER",
      assignedClass: "JSS1",
      subjects: ["Mathematics"],
      assignedClasses: ["JSS1"],
    });
    await demoStore.saveTimetableEntry({
      schoolId: school.id,
      classArm: "JSS1",
      day: "Monday",
      period: 1,
      subject: "Mathematics",
      teacherId: teacher.id,
    });

    const ok = await demoStore.deleteUser(teacher.id);
    assert.equal(ok, true);
    assert.equal(await demoStore.findUserById(teacher.id), null);
    const entries = await demoStore.getTimetable({ schoolId: school.id });
    assert.equal(entries.some((e) => e.teacherId === teacher.id), false);
  });

  it("returns false for an unknown id", async () => {
    assert.equal(await demoStore.deleteUser("usr_none"), false);
  });
});

describe("deleteSchool grace period", () => {
  async function seedTenant() {
    const school = await seededSchool();
    const student = await demoStore.createUser({
      schoolId: school.id,
      name: "Tenant Student",
      email: "tenant@test.app",
      password: "tenant123",
      role: "STUDENT",
      assignedClass: "JSS1",
    });
    await demoStore.saveScores({
      schoolId: school.id,
      classArm: "JSS1",
      subject: "Mathematics",
      rows: [{ studentId: student.id, caScore: 25, examScore: 35 }],
    });
    // A platform lead (not tenant-scoped) must survive the final wipe.
    await demoStore.createLead({
      kind: "demo",
      name: "Prospect",
      school: "Some Other School",
      email: "prospect@test.app",
      message: "requested a demo",
    });
    return { school, student };
  }

  it("soft-deletes: marks the school deleted with a deletedAt stamp, data intact", async () => {
    const { school, student } = await seedTenant();

    const ok = await demoStore.deleteSchool(school.id);
    assert.equal(ok, true);
    const after = await demoStore.getSchoolById(school.id);
    assert.equal(after.status, "deleted");
    assert.ok(after.deletedAt, "deletedAt is stamped for the recovery window");
    // Every byte of data is still there and recoverable…
    assert.ok(await demoStore.findUserById(student.id));
    assert.equal((await demoStore.getScoresByStudent(student.id)).length, 1);
    // …and the school still shows in the public directory, flagged as deleted.
    const [found] = await demoStore.searchSchools("Greenfield");
    assert.equal(found.status, "deleted");
  });

  it("restores a deleted school back to active and clears the stamp", async () => {
    const { school, student } = await seedTenant();
    await demoStore.deleteSchool(school.id);

    const restored = await demoStore.setSchoolStatus(school.id, "active");
    assert.equal(restored.status, "active");
    assert.equal(restored.deletedAt, null);
    assert.ok(await demoStore.findUserById(student.id));
  });

  it("purgeExpiredDeletedSchools wipes only lapsed tenants, keeping platform leads", async () => {
    const { school, student } = await seedTenant();
    await demoStore.deleteSchool(school.id);

    // Inside the grace period — nothing is purged.
    assert.equal(await demoStore.purgeExpiredDeletedSchools(), 0);
    assert.ok(await demoStore.findUserById(student.id));

    // 31 days later — the sweep removes the tenant for real.
    const later = Date.now() + 31 * 24 * 60 * 60 * 1000;
    assert.equal(await demoStore.purgeExpiredDeletedSchools({ now: later }), 1);
    assert.equal(await demoStore.getSchoolById(school.id), undefined);
    assert.equal(await demoStore.findUserById(student.id), null);
    assert.equal((await demoStore.getScoresByStudent(student.id)).length, 0);
    // The school's own users are gone…
    const [found] = await demoStore.searchSchools("Greenfield");
    assert.equal(found, undefined);
    // …but the platform lead is still there.
    const leads = await demoStore.listLeads("demo");
    assert.equal(leads.some((l) => l.email === "prospect@test.app"), true);
  });

  it("returns false for an unknown school", async () => {
    assert.equal(await demoStore.deleteSchool("sch_none"), false);
  });
});
