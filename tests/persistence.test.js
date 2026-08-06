/**
 * Demo-store persistence tests (demo mode survives dev-server restarts).
 *
 * The demo store snapshots its state to a JSON file after every mutation and
 * restores it on boot. These tests drive that machinery through the exported
 * test hooks:
 *   __setDemoStoreFile(path)  — point persistence at a temp file
 *   __persistNow()            — flush the debounced write immediately
 *   __reloadDemoStore()       — simulate a process restart (reload from disk)
 *   __resetDemoStore()        — wipe state + seed (also deletes the file)
 *
 * Covers: round-trip survival across a "restart", hash integrity (passwords
 * verify after reload), id-uniqueness across reloads, reset wiping the disk,
 * corrupt-file and version-mismatch fallback to a fresh seed, and burst
 * writes coalescing into a single snapshot.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import * as demoStore from "../src/lib/demo-store.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-demo-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

describe("demo-store persistence", () => {
  it("a created account survives a simulated restart (round-trip)", async () => {
    const school = await seededSchool();
    const created = await demoStore.createUser({
      schoolId: school.id,
      name: "Survivor Student",
      email: "survivor@edutrack.app",
      password: "keepme123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });

    demoStore.__persistNow();
    assert.ok(fs.existsSync(file), "snapshot file was written");

    // Simulate a dev-server restart: wipe memory, reload from disk.
    demoStore.__reloadDemoStore();

    const after = await demoStore.findUserByEmail("survivor@edutrack.app");
    assert.ok(after, "created user survived the restart");
    assert.equal(after.name, "Survivor Student");
    assert.equal(after.assignedClass, "SS1 Science");

    // The stored password is a hash that still verifies (login parity).
    assert.notEqual(after.password, "keepme123");
    assert.ok(bcrypt.compareSync("keepme123", after.password));

    // School object survived too, and ids keep incrementing without collision.
    const schoolAfter = await demoStore.getSchoolById(school.id);
    assert.equal(schoolAfter.name, school.name);
    const next = await demoStore.createUser({
      schoolId: school.id,
      name: "After Reload",
      email: "after@edutrack.app",
      password: "fresh123",
      role: "STUDENT",
    });
    assert.notEqual(next.id, created.id);
    const ids = (await demoStore.listUsers({ schoolId: school.id })).map((u) => u.id);
    assert.equal(new Set(ids).size, ids.length, "no id collisions after reload");
  });

  it("fee payments and scores persist too", async () => {
    const school = await seededSchool();
    const [student] = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });

    const payment = await demoStore.recordFeePayment({
      schoolId: school.id,
      studentId: student.id,
      amount: 25000,
      method: "CASH",
    });
    await demoStore.saveScores({
      schoolId: school.id,
      classArm: student.assignedClass,
      subject: "Mathematics",
      rows: [{ studentId: student.id, caScore: 30, examScore: 45 }],
    });

    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    const ledger = await demoStore.getFeeLedger(school.id);
    const entry = ledger.find((l) => l.studentId === student.id);
    // The student may carry seeded payments — the important bit is that the
    // payment we just recorded (receipt RCT-1001) survived the restart.
    const survived = entry.payments.find((p) => p.id === payment.id);
    assert.ok(survived, "the recorded payment survived the restart");
    assert.equal(survived.amount, 25000);
    assert.equal(survived.receiptNo, payment.receiptNo);

    const scores = await demoStore.getScoresByStudent(student.id);
    const saved = scores.find((s) => s.totalScore === 75);
    assert.ok(saved, "score survived the restart");
  });

  it("burst writes land in a complete snapshot (bulk-import friendly)", async () => {
    const school = await seededSchool();
    for (let i = 0; i < 100; i++) {
      await demoStore.createUser({
        schoolId: school.id,
        name: `Burst Student ${i}`,
        email: `burst${i}@edutrack.app`,
        password: "burst123",
        role: "STUDENT",
      });
    }
    demoStore.__persistNow();

    demoStore.__reloadDemoStore();
    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    assert.equal(students.length, 10 + 100, "all 100 burst users made it into the snapshot");
  });

  it("reset wipes the disk state too — the next boot is a fresh seed", async () => {
    const school = await seededSchool();
    await demoStore.createUser({
      schoolId: school.id,
      name: "Gone After Reset",
      email: "gone@edutrack.app",
      password: "gone123",
      role: "STUDENT",
    });
    demoStore.__persistNow();
    assert.ok(fs.existsSync(file));

    demoStore.__resetDemoStore();
    assert.ok(!fs.existsSync(file), "reset deletes the persisted snapshot");

    demoStore.__reloadDemoStore();
    const gone = await demoStore.findUserByEmail("gone@edutrack.app");
    assert.equal(gone, undefined, "the pre-reset user is gone after reload");
    const [match] = await demoStore.searchSchools("Greenfield");
    assert.equal(match.name, "Greenfield International School", "seed restored");
  });

  it("a corrupt snapshot file falls back to a fresh seed", async () => {
    fs.writeFileSync(file, "{ this is not valid json !!!");
    demoStore.__reloadDemoStore();
    const [match] = await demoStore.searchSchools("Greenfield");
    assert.equal(match.name, "Greenfield International School", "fell back to seed");
    const students = await demoStore.listUsers({ schoolId: match.id, role: "STUDENT" });
    assert.equal(students.length, 10);
  });

  it("an unknown snapshot version falls back to a fresh seed", async () => {
    fs.writeFileSync(file, JSON.stringify({ version: 99, users: [] }));
    demoStore.__reloadDemoStore();
    const [match] = await demoStore.searchSchools("Greenfield");
    assert.ok(match, "fell back to seed on version mismatch");
    const students = await demoStore.listUsers({ schoolId: match.id, role: "STUDENT" });
    assert.equal(students.length, 10);
  });

  it("a snapshot from before a collection existed loads as empty (backward-compatible)", async () => {
    // Simulate a store.json written before the notifications collection was
    // introduced (e.g. the live .demo-data file). It must restore, keeping
    // the existing users, rather than failing and re-seeding the demo.
    const school = await seededSchool();
    // A mutation marks the store dirty so the debounced write has something
    // to flush — pure reads never produce a snapshot.
    await demoStore.createUser({
      schoolId: school.id,
      name: "Pre-Notifications",
      email: "pre-notif@edutrack.app",
      password: "pre123",
      role: "STUDENT",
      assignedClass: "SS1 Arts",
    });
    demoStore.__persistNow();
    const before = JSON.parse(fs.readFileSync(file, "utf8"));
    delete before.notifications; // older snapshots have no such key
    fs.writeFileSync(file, JSON.stringify(before));

    demoStore.__reloadDemoStore();

    const [match] = await demoStore.searchSchools("Greenfield");
    assert.equal(match.name, "Greenfield International School", "state restored, not re-seeded");
    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    assert.equal(students.length, 11, "existing students survived");
    assert.ok(
      await demoStore.findUserByEmail("pre-notif@edutrack.app"),
      "the pre-collection user survived"
    );
    const admins = await demoStore.listUsers({ schoolId: school.id, role: "SUPER_ADMIN" });
    const inbox = await demoStore.listNotifications(school.id, admins[0].id);
    assert.deepEqual(inbox, [], "missing collection starts empty");
  });
});
