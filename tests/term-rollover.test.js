/**
 * Term rollover tests — moving a school to a new term.
 *
 * A rollover archives the old term's scores + attendance (snapshotted per arm,
 * then cleared from the live tables), clones each arm's fee structure and the
 * weekly timetable forward, resets every student's feePaid and moves the
 * school's currentSession/currentTerm. The suite pins that contract on the
 * demo adapter (dry-run purity, archive counts, ledger + attendance
 * term-scoping, new-row stamping) and drives the real API route for the
 * SUPER_ADMIN round-trip and the RBAC 403.
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

const hadMongoUri = process.env.MONGODB_URI;
delete process.env.MONGODB_URI;
const { POST } = await import("../src/app/api/school/rollover/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-rollover-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function seededSchool() {
  const [school] = await demoStore.searchSchools("Greenfield");
  return school;
}

describe("rolloverTerm — archive + clone semantics", () => {
  it("dry-run returns exact counts WITHOUT mutating anything", async () => {
    const school = await seededSchool();
    const scoresBefore = (await demoStore.getScoresBySchool(school.id)).length;
    const attendanceBefore = (await demoStore.listTermArchives(school.id)).length;

    const dry = await demoStore.rolloverTerm(school.id, {
      newTerm: "Second Term",
      dryRun: true,
    });
    assert.ok(!dry.error, `dry-run should succeed: ${dry.error || ""}`);
    assert.equal(dry.counts.scoresArchived, scoresBefore);
    assert.ok(dry.counts.attendanceArchived > 0, "seed should have attendance registers");
    assert.equal(dry.counts.feesCloned, 12);
    assert.ok(dry.counts.timetableCloned > 0);
    assert.ok(dry.counts.studentsReset > 0);
    assert.ok(dry.counts.carryovers > 0, "seed defaulters carry balances into the new term");

    // Nothing mutated.
    assert.equal((await demoStore.getSchoolById(school.id)).currentTerm, "First Term");
    assert.equal((await demoStore.getScoresBySchool(school.id)).length, scoresBefore);
    assert.equal((await demoStore.listTermArchives(school.id)).length, attendanceBefore);
  });

  it("rejects a missing term and a same-session+term roll", async () => {
    const school = await seededSchool();
    assert.match((await demoStore.rolloverTerm(school.id, { newTerm: "" })).error, /term is required/);
    assert.match(
      (await demoStore.rolloverTerm(school.id, { newTerm: "First Term" })).error,
      /already on/
    );
    // A term change within the same session is allowed.
    assert.ok(
      !(await demoStore.rolloverTerm(school.id, { newTerm: "Second Term", dryRun: true })).error
    );
    // Same term but a NEW session is also a valid roll (new academic year).
    assert.ok(
      !(await demoStore.rolloverTerm(school.id, {
        newTerm: "First Term",
        newSession: "2026/2027",
        dryRun: true,
      })).error
    );
  });

  it("archives scores + attendance, clears live, clones fees + timetable, resets students", async () => {
    const school = await seededSchool();
    const scoresBefore = (await demoStore.getScoresBySchool(school.id)).length;
    const studentsBefore = (await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" }));

    const res = await demoStore.rolloverTerm(school.id, { newTerm: "Second Term" });
    assert.ok(!res.error, `rollover should succeed: ${res.error || ""}`);
    assert.equal(res.counts.scoresArchived, scoresBefore);
    assert.equal(res.school.currentSession, "2025/2026");
    assert.equal(res.school.currentTerm, "Second Term");

    // Live tables are clean for the new term.
    assert.equal((await demoStore.getScoresBySchool(school.id)).length, 0);
    const archived = await demoStore.listTermArchives(school.id, { term: "First Term" });
    assert.equal(archived.filter((a) => a.kind === "score").length, scoresBefore);
    assert.ok(archived.filter((a) => a.kind === "attendance").length > 0);

    // Fee structures cloned into the new term with the same amounts.
    const structures = await demoStore.getFeeStructures(school.id);
    const secondTerm = structures.filter((f) => f.term === "Second Term");
    assert.equal(secondTerm.length, 12);
    const jss1 = secondTerm.find((f) => f.classArm === "JSS1");
    assert.equal(jss1.amount, 90000);
    assert.equal(
      secondTerm.find((f) => f.classArm === "SS1 Science").amount,
      185000
    );

    // Timetable carried over (re-stamped, count unchanged).
    const tt = await demoStore.getTimetable({ schoolId: school.id });
    assert.equal(tt.length, 240);
    assert.ok(tt.every((t) => t.session === "2025/2026" && t.term === "Second Term"));

    // Every student reset to unpaid.
    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    assert.equal(students.length, studentsBefore.length);
    assert.ok(students.every((s) => !s.feePaid));
  });

  it("old-term payments stop satisfying the new term's ledger, and the unpaid balance carries", async () => {
    const school = await seededSchool();
    const ledgerBefore = await demoStore.getFeeLedger(school.id);
    const kunle = ledgerBefore.find((l) => l.email === "k.adebayo@edutrack.app");
    assert.equal(kunle.balance, 111000); // seeded part-payment profile

    await demoStore.rolloverTerm(school.id, { newTerm: "Second Term" });

    const ledgerAfter = await demoStore.getFeeLedger(school.id);
    const kunle2 = ledgerAfter.find((l) => l.email === "k.adebayo@edutrack.app");
    // The seeded First-Term payments are out of scope for Second Term (paid 0),
    // but the unpaid First-Term balance (111,000) CARRIES into Second Term and
    // is ADDED to the cloned new fee (185,000) → billed 296,000.
    assert.equal(kunle2.carryover, 111000);
    assert.equal(kunle2.amount, 296000);
    assert.equal(kunle2.paid, 0);
    assert.equal(kunle2.balance, 296000);
    assert.equal(kunle2.feePaid, false);
  });

  it("carries unpaid balances into the new term; fully paid students carry nothing", async () => {
    const school = await seededSchool();
    await demoStore.rolloverTerm(school.id, { newTerm: "Second Term" });

    const ledger = await demoStore.getFeeLedger(school.id);
    const kunle = ledger.find((l) => l.email === "k.adebayo@edutrack.app");
    assert.equal(kunle.carryover, 111000, "unpaid First-Term balance rolls forward");
    assert.equal(kunle.amount, 296000, "new fee + carried balance are added together");
    assert.equal(kunle.balance, 296000);

    // Chidinma paid First Term in full — nothing carries, new fee only.
    const chidinma = ledger.find((l) => l.email === "c.obi@edutrack.app");
    assert.equal(chidinma.carryover, 0);
    assert.equal(chidinma.amount, 185000);
    assert.equal(chidinma.balance, 185000);

    // A payment in the new term pays down the combined balance.
    await demoStore.recordFeePayment({ schoolId: school.id, studentId: kunle.studentId, amount: 50000 });
    const kunle3 = (await demoStore.getFeeLedger(school.id)).find((l) => l.email === "k.adebayo@edutrack.app");
    assert.equal(kunle3.paid, 50000);
    assert.equal(kunle3.balance, 246000);
  });

  it("attendance summary is term-scoped — the new term starts at zero", async () => {
    const school = await seededSchool();
    const student = (await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" }))[0];
    const before = await demoStore.getStudentAttendanceSummary(school.id, student.id);
    assert.ok(before.total > 0, "seed should have attendance for this term");

    await demoStore.rolloverTerm(school.id, { newTerm: "Second Term" });
    const after = await demoStore.getStudentAttendanceSummary(school.id, student.id);
    assert.deepEqual(after, { total: 0, present: 0, absent: 0 });
  });

  it("new attendance, payments and timetable entries are stamped with the new term", async () => {
    const school = await seededSchool();
    const student = (await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" }))[0];
    await demoStore.rolloverTerm(school.id, { newTerm: "Second Term" });

    await demoStore.saveAttendance(school.id, "JSS1", "2030-01-05", [
      { studentId: student.id, present: true },
    ]);
    const att = await demoStore.getAttendance(school.id, "JSS1", "2030-01-05");
    assert.equal(att.session, "2025/2026");
    assert.equal(att.term, "Second Term");

    const payment = await demoStore.recordFeePayment({
      schoolId: school.id,
      studentId: student.id,
      amount: 50000,
    });
    assert.equal(payment.session, "2025/2026");
    assert.equal(payment.term, "Second Term");
    // And the payment now counts toward the new term's ledger.
    const ledger = await demoStore.getFeeLedger(school.id);
    const entry = ledger.find((l) => l.studentId === student.id);
    assert.equal(entry.paid, 50000);

    await demoStore.saveTimetableEntry({
      schoolId: school.id,
      classArm: "JSS1",
      day: "Monday",
      period: 8,
      subject: "Mathematics",
      teacherId: student.id,
    });
    const tt = await demoStore.getTimetable({ schoolId: school.id, classArm: "JSS1", day: "Monday" });
    const slot = tt.find((t) => t.period === 8);
    assert.equal(slot.term, "Second Term");
  });

  it("re-rolling to the next term archives only what the current term holds", async () => {
    const school = await seededSchool();
    await demoStore.rolloverTerm(school.id, { newTerm: "Second Term" });

    // Nothing scored yet in Second Term — a roll to Third archives 0 scores.
    const third = await demoStore.rolloverTerm(school.id, { newTerm: "Third Term" });
    assert.equal(third.counts.scoresArchived, 0);
    assert.equal(third.school.currentTerm, "Third Term");
    // The First-Term archive snapshot is still intact and queryable.
    const firstArchives = await demoStore.listTermArchives(school.id, { term: "First Term" });
    assert.ok(firstArchives.length > 0);
    assert.ok(firstArchives.every((a) => a.term === "First Term"));
    // The rolled-over structures are preserved for both terms.
    const structures = await demoStore.getFeeStructures(school.id);
    assert.equal(structures.filter((f) => f.term === "First Term").length, 12);
    assert.equal(structures.filter((f) => f.term === "Second Term").length, 12);
    assert.equal(structures.filter((f) => f.term === "Third Term").length, 12);
    // Second-Term unpaid balances (everyone — nothing was paid) carry again.
    assert.ok(third.counts.carryovers > 0, "unpaid Second-Term balances carry into Third Term");
  });
});

describe("POST /api/school/rollover — through the real API", () => {
  async function postRollover(actor, body) {
    const res = await POST(
      new Request("http://localhost/api/school/rollover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("SUPER_ADMIN previews (dry-run) then rolls over and it persists", async () => {
    const school = await seededSchool();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    // Dry-run preview first.
    const preview = await postRollover(admin, { newTerm: "Second Term", dryRun: true });
    assert.equal(preview.status, 200);
    assert.ok(preview.body.counts.scoresArchived > 0);
    assert.equal((await demoStore.getSchoolById(school.id)).currentTerm, "First Term");

    // The real rollover.
    const res = await postRollover(admin, { newTerm: "Second Term" });
    assert.equal(res.status, 200);
    assert.equal(res.body.school.currentTerm, "Second Term");
    assert.equal(res.body.counts.feesCloned, 12);

    // Persisted — a fresh read reflects the new term.
    const stored = await demoStore.getSchoolById(school.id);
    assert.equal(stored.currentTerm, "Second Term");
    assert.equal((await demoStore.getScoresBySchool(school.id)).length, 0);
  });

  it("sends automatic reminders at rollover to carried students' parents (and students without a parent)", async () => {
    const school = await seededSchool();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await postRollover(admin, { newTerm: "Second Term" });
    assert.equal(res.status, 200);
    assert.ok(res.body.counts.carryovers > 0, "seed defaulters carry balances");
    assert.equal(
      res.body.counts.remindersSent,
      res.body.counts.carryovers,
      "one automatic reminder per carried student"
    );

    const all = await demoStore.listNotifications(school.id, admin.id);
    const reminders = all.filter((n) => n.kind === "fee_reminder");
    assert.equal(reminders.length, res.body.counts.carryovers);

    // Parent-linked carried student (Kunle → Folake): parent-addressed copy.
    const parent = await demoStore.findUserByEmail("p.adebayo@edutrack.app");
    const parentMine = reminders.filter((n) => (n.to || []).includes(parent.email));
    assert.ok(parentMine.length >= 1, "Folake gets a reminder for Kunle's carried balance");
    // The reminder carries the FULL new-term outstanding (new fee + carried).
    assert.ok(parentMine[0].body.includes("₦296,000"), "combined balance in the reminder");

    // Parent-less carried student (Tobi): student-addressed copy.
    const studentMine = reminders.filter((n) => (n.to || []).includes("t.alade@edutrack.app"));
    assert.ok(studentMine.length >= 1, "parent-less carried student reminded directly");
    assert.ok(studentMine[0].body.includes("Hi Tobi Alade,"), "student-addressed copy");

    // Every automatic send is on the audit trail.
    const trail = await demoStore.listFeeAudit(school.id);
    const auto = trail.filter(
      (e) => e.action === "REMINDER_SENT" && e.note.includes("Automatic reminder at term rollover")
    );
    assert.equal(auto.length, res.body.counts.carryovers);
  });

  it("rollover automatic reminders use the school's saved reminder templates", async () => {
    const school = await seededSchool();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    // The school saved its own wording (parent + student variants) — rollover
    // reminders must use it instead of the built-in copy.
    await demoStore.updateSchool(school.id, {
      reminderTemplates: {
        parent: "Dear {name}, the carried balance for {student} is {balance} — {school}",
        student: "Hi {name}, your carried balance is {balance} — {school}",
      },
    });

    const res = await postRollover(admin, { newTerm: "Second Term" });
    assert.equal(res.status, 200);
    assert.ok(res.body.counts.remindersSent > 0);

    const all = await demoStore.listNotifications(school.id, admin.id);
    const reminders = all.filter((n) => n.kind === "fee_reminder");

    // Parent-addressed copy carries the school's parent template.
    const parent = await demoStore.findUserByEmail("p.adebayo@edutrack.app");
    const parentMine = reminders.filter((n) => (n.to || []).includes(parent.email));
    assert.ok(parentMine.length >= 1, "Folake gets the automatic reminder");
    assert.ok(
      parentMine[0].body.includes("Dear Mrs. Folake Adebayo, the carried balance for Kunle Adebayo"),
      "parent template rendered with placeholders"
    );
    assert.ok(parentMine[0].body.includes("Greenfield International School"), "{school} filled");

    // Parent-less carried student gets the STUDENT variant, never the parent one.
    const studentMine = reminders.filter((n) => (n.to || []).includes("t.alade@edutrack.app"));
    assert.ok(studentMine.length >= 1, "parent-less carried student reminded directly");
    assert.ok(
      studentMine[0].body.includes("Hi Tobi Alade, your carried balance is"),
      "student template rendered"
    );
    assert.ok(!studentMine[0].body.includes("Dear"), "parent wording never leaks into the student copy");
  });

  it("rejects a same-term roll with 400", async () => {
    const school = await seededSchool();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    __setSessionToken(signToken({ userId: admin.id, role: admin.role, schoolId: school.id }));

    const res = await postRollover(admin, { newTerm: "First Term" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /already on/);
  });

  it("a BURSAR without school.edit gets 403", async () => {
    const school = await seededSchool();
    const bursar = await demoStore.findUserByEmailInSchool(school.id, "bursar@edutrack.app");
    __setSessionToken(signToken({ userId: bursar.id, role: bursar.role, schoolId: school.id }));

    const res = await postRollover(bursar, { newTerm: "Second Term" });
    assert.equal(res.status, 403);
  });
});
