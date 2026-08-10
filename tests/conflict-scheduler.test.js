/**
 * The daily conflict-scan BACKGROUND JOB (src/lib/conflict-scheduler.js).
 *
 * This suite pins the fixed-hour policy and the ticker:
 *
 *   - isScanDue: never-scanned → due; fresh → not due; 24h+ → due (catch-up
 *     when the process was down at the fixed hour); the fixed hour itself →
 *     due only when the last run predates that hour (a manual "Scan now"
 *     during the hour satisfies the day's run)
 *   - nextScheduledScan / formatScanHour / resolveScanHour (env parsing)
 *   - runDueScans against the REAL demo store: a never-scanned school is
 *     scanned once, then skipped until due; the next daily run catches new
 *     collisions and flags them as "new since last scan"
 *   - startConflictScheduler: scans on boot without any dashboard load, does
 *     NOT re-scan while fresh, and stop() halts the ticker
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";
import {
  formatScanHour,
  isScanDue,
  nextScheduledScan,
  resolveScanHour,
} from "../src/lib/conflict-scan.js";
import {
  buildConflictScanNotification,
  runDueScans,
  startConflictScheduler,
} from "../src/lib/conflict-scheduler.js";

const ALL_ARMS = [
  "JSS1", "JSS2", "JSS3",
  "SS1 Science", "SS1 Arts", "SS1 Commercial",
  "SS2 Science", "SS2 Arts", "SS2 Commercial",
  "SS3 Science", "SS3 Arts", "SS3 Commercial",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const silentLogger = { error: () => {}, log: () => {} };

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-cs-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let hadEnv;

beforeEach(() => {
  hadEnv = process.env.CONFLICT_SCAN_HOUR;
  delete process.env.CONFLICT_SCAN_HOUR;
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
  if (hadEnv === undefined) delete process.env.CONFLICT_SCAN_HOUR;
  else process.env.CONFLICT_SCAN_HOUR = hadEnv;
});

async function seed() {
  const [school] = await demoStore.searchSchools("Greenfield");
  const teachers = await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" });
  const byEmail = Object.fromEntries(teachers.map((t) => [t.email, t]));
  return { school, byEmail };
}

/** Double-book Okafor in a second arm at one of her real slots (legacy data). */
async function injectDoubleBooking(schoolId, byEmail) {
  const okafor = byEmail["a.okafor@edutrack.app"];
  const herSlot = (await demoStore.getTimetable({ schoolId })).find((e) => e.teacherId === okafor.id);
  const otherArm = ALL_ARMS.find((a) => a !== herSlot.classArm);
  await demoStore.saveTimetableEntry({
    schoolId,
    classArm: otherArm,
    day: herSlot.day,
    period: herSlot.period,
    subject: "Mathematics",
    teacherId: okafor.id,
  });
  return herSlot;
}

describe("isScanDue — the fixed-hour daily policy", () => {
  it("never scanned → due (populates the metric after boot)", () => {
    const now = new Date(2026, 7, 10, 9, 30, 0);
    assert.equal(isScanDue({ lastRunAtMs: 0, now, scanHour: 2 }), true);
  });

  it("a fresh scan is never due — neither minutes nor hours later, outside the fixed hour", () => {
    const now = new Date(2026, 7, 10, 9, 30, 0);
    const fiveMinAgo = now.getTime() - 5 * 60 * 1000;
    const under24h = now.getTime() - 23 * 60 * 60 * 1000;
    assert.equal(isScanDue({ lastRunAtMs: fiveMinAgo, now, scanHour: 2 }), false);
    assert.equal(isScanDue({ lastRunAtMs: under24h, now, scanHour: 2 }), false);
  });

  it("24h+ elapsed → due (catch-up when the process was down at the fixed hour)", () => {
    const now = new Date(2026, 7, 10, 9, 30, 0);
    const over24h = now.getTime() - 25 * 60 * 60 * 1000;
    assert.equal(isScanDue({ lastRunAtMs: over24h, now, scanHour: 2 }), true);
  });

  it("the fixed hour is due only when the last run predates that hour", () => {
    const atHour = new Date(2026, 7, 10, 2, 5, 0); // the 02:00 tick
    const beforeHour = new Date(2026, 7, 10, 1, 59, 0).getTime();
    const withinHour = new Date(2026, 7, 10, 2, 1, 0).getTime(); // a manual Scan now
    assert.equal(isScanDue({ lastRunAtMs: beforeHour, now: atHour, scanHour: 2 }), true);
    assert.equal(
      isScanDue({ lastRunAtMs: withinHour, now: atHour, scanHour: 2 }),
      false,
      "a manual scan during the fixed hour satisfies the day's run"
    );
  });

  it("other hours never scan a school that was scanned under 24h ago", () => {
    const now = new Date(2026, 7, 10, 9, 30, 0);
    const tenHoursAgo = now.getTime() - 10 * 60 * 60 * 1000;
    assert.equal(isScanDue({ lastRunAtMs: tenHoursAgo, now, scanHour: 2 }), false);
  });
});

describe("nextScheduledScan / formatScanHour / resolveScanHour", () => {
  it("nextScheduledScan: before the hour → today; after → tomorrow", () => {
    const before = new Date(2026, 7, 10, 1, 0, 0);
    const d1 = nextScheduledScan(before, 2);
    assert.equal(d1.getHours(), 2);
    assert.equal(d1.getDate(), 10);
    const after = new Date(2026, 7, 10, 3, 0, 0);
    const d2 = nextScheduledScan(after, 2);
    assert.equal(d2.getHours(), 2);
    assert.equal(d2.getDate(), 11);
  });

  it("formatScanHour pads to HH:00", () => {
    assert.equal(formatScanHour(2), "02:00");
    assert.equal(formatScanHour(17), "17:00");
  });

  it("resolveScanHour: default 2, env override, invalid values fall back", () => {
    assert.equal(resolveScanHour(), 2);
    process.env.CONFLICT_SCAN_HOUR = "5";
    assert.equal(resolveScanHour(), 5);
    process.env.CONFLICT_SCAN_HOUR = "24";
    assert.equal(resolveScanHour(), 2, "24 is out of range");
    process.env.CONFLICT_SCAN_HOUR = "abc";
    assert.equal(resolveScanHour(), 2, "non-numeric falls back");
    process.env.CONFLICT_SCAN_HOUR = "";
    assert.equal(resolveScanHour(), 2, "empty falls back");
  });
});

describe("runDueScans — the job against the real store", () => {
  it("scans a never-scanned school once, then skips it until due", async () => {
    const { school } = await seed();
    assert.deepEqual(await demoStore.listSchoolIds(), [school.id]);

    const first = await runDueScans({
      store: demoStore,
      now: new Date(2026, 7, 10, 9, 0, 0),
      scanHour: 2,
    });
    assert.equal(first.scanned, 1);
    assert.equal(first.skipped, 0);
    assert.ok(await demoStore.getConflictScan(school.id), "record persisted");

    const second = await runDueScans({
      store: demoStore,
      now: new Date(2026, 7, 10, 9, 1, 0),
      scanHour: 2,
    });
    assert.equal(second.scanned, 0, "fresh → not re-scanned");
    assert.equal(second.skipped, 1);
  });

  it("the next daily run catches a new collision and flags it as new", async () => {
    const { school, byEmail } = await seed();
    // Day 1: the job scans a clean baseline.
    await runDueScans({ store: demoStore, now: new Date(2026, 7, 10, 2, 1, 0), scanHour: 2 });
    // Overnight, legacy data double-books Okafor…
    await injectDoubleBooking(school.id, byEmail);
    // …and the record is aged past 24h (the server was up; the day passed).
    const rec = await demoStore.getConflictScan(school.id);
    await demoStore.saveConflictScan(school.id, {
      lastRunAt: new Date(2026, 7, 10, 2, 1, 0).toISOString(),
      conflicts: rec.conflicts,
      conflictKeys: rec.conflictKeys,
      newConflictKeys: rec.newConflictKeys,
    });
    // Day 2: the fixed-hour run re-scans and flags the collision as NEW.
    const run = await runDueScans({ store: demoStore, now: new Date(2026, 7, 11, 2, 1, 0), scanHour: 2 });
    assert.equal(run.scanned, 1);
    assert.equal(run.results[0].conflictCount, 1);
    assert.equal(run.results[0].teacherConflicts, 1);
    assert.equal(run.results[0].newConflictCount, 1, "new since the previous scan");
    assert.equal(run.results[0].newConflicts.teacher[0].teacherName, "Mrs. Adaeze Okafor");
  });

  it("a school whose last run is inside the fixed hour is skipped (manual scan satisfied the day)", async () => {
    const { school } = await seed();
    await runDueScans({ store: demoStore, now: new Date(2026, 7, 10, 2, 0, 30), scanHour: 2 });
    const run = await runDueScans({ store: demoStore, now: new Date(2026, 7, 10, 2, 30, 0), scanHour: 2 });
    assert.equal(run.scanned, 0);
    assert.equal(run.skipped, 1);
  });

  it("the daily job records a per-day history: clean → conflict → resolved", async () => {
    const { school, byEmail } = await seed();
    const ageRecord = async () => {
      const rec = await demoStore.getConflictScan(school.id);
      await demoStore.saveConflictScan(school.id, {
        lastRunAt: new Date(2026, 7, 10, 2, 1, 0).toISOString(),
        conflicts: rec.conflicts,
        conflictKeys: rec.conflictKeys,
        newConflictKeys: rec.newConflictKeys,
        flaggedSlots: rec.flaggedSlots,
        history: rec.history,
      });
    };
    // Day 1: clean.
    await runDueScans({ store: demoStore, now: new Date(2026, 7, 10, 2, 1, 0), scanHour: 2 });
    // Overnight a legacy double-booking appears.
    const injected = await injectDoubleBooking(school.id, byEmail);
    await ageRecord();
    // Day 2: the job finds it → count 1.
    await runDueScans({ store: demoStore, now: new Date(2026, 7, 11, 2, 1, 0), scanHour: 2 });
    // The admin fixes it overnight (frees the duplicate slot).
    await demoStore.deleteTimetableEntry({
      schoolId: school.id,
      classArm: injected.classArm,
      day: injected.day,
      period: injected.period,
    });
    await ageRecord();
    // Day 3: resolved → count 0.
    await runDueScans({ store: demoStore, now: new Date(2026, 7, 12, 2, 1, 0), scanHour: 2 });
    const rec = await demoStore.getConflictScan(school.id);
    assert.deepEqual(
      rec.history.map((h) => h.conflictCount),
      [0, 1, 0],
      "one point per day: clean, conflicted, resolved"
    );
    assert.deepEqual(rec.history.map((h) => h.date), ["2026-08-10", "2026-08-11", "2026-08-12"]);
  });
});

describe("buildConflictScanNotification — the inbox copy", () => {
  it("lists NEW teacher, arm and scope collisions with names", () => {
    const note = buildConflictScanNotification({
      newConflictCount: 3,
      newConflicts: {
        teacher: [
          {
            teacherId: "t1",
            teacherName: "Mrs. Adaeze Okafor",
            day: "Monday",
            period: 7,
            slots: [{ classArm: "JSS1 Science" }, { classArm: "JSS1 Arts" }],
          },
        ],
        arm: [
          {
            classArm: "SS2 Science",
            day: "Tuesday",
            period: 3,
            slots: [
              { subject: "Mathematics", teacherName: "Mrs. Adaeze Okafor" },
              { subject: "Physics", teacherName: "Dr. Ifeoma Nwosu" },
            ],
          },
        ],
        scope: [
          {
            teacherName: "Mrs. Ada Bakare",
            subject: "Mathematics",
            classArm: "JSS1 Science",
            day: "Wednesday",
            period: 2,
            problems: ["subject"],
          },
        ],
      },
    });
    assert.equal(note.kind, "timetable_conflict");
    assert.equal(note.subject, "3 new timetable collisions");
    assert.ok(
      note.body.includes(
        "Mrs. Adaeze Okafor is booked in 2 classes on Monday, period 7: JSS1 Science, JSS1 Arts"
      )
    );
    assert.ok(
      note.body.includes(
        "SS2 Science has 2 subjects at Tuesday, period 3: Mathematics (Mrs. Adaeze Okafor), Physics (Dr. Ifeoma Nwosu)"
      )
    );
    assert.ok(note.body.includes("Mrs. Ada Bakare isn't assigned to teach Mathematics in JSS1 Science"));
  });

  it("handles singular and a missing-teacher scope violation", () => {
    const note = buildConflictScanNotification({
      newConflictCount: 1,
      newConflicts: {
        teacher: [],
        arm: [],
        scope: [
          {
            teacherName: "Mrs. X",
            classArm: "JSS1 Science",
            day: "Monday",
            period: 1,
            problems: ["teacher"],
          },
        ],
      },
    });
    assert.equal(note.subject, "1 new timetable collision");
    assert.ok(note.body.includes("Mrs. X is no longer in the staff list"));
  });
});

describe("daily-scan notifications to admins", () => {
  it("a clean daily run creates NO notification", async () => {
    const { school } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    await runDueScans({ store: demoStore, now: new Date(2026, 7, 10, 2, 1, 0), scanHour: 2 });
    assert.equal((await demoStore.listNotifications(school.id, admin.id)).length, 0);
  });

  it("a daily run that finds new collisions notifies EVERY admin, unread", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const admin2 = await demoStore.createUser({
      schoolId: school.id,
      name: "Second Admin",
      email: "admin2@edutrack.app",
      password: "admin123",
      role: "SUPER_ADMIN",
    });
    // Day 1: clean baseline → nothing.
    await runDueScans({ store: demoStore, now: new Date(2026, 7, 10, 2, 1, 0), scanHour: 2 });
    assert.equal((await demoStore.listNotifications(school.id, admin.id)).length, 0);
    // Overnight, legacy data double-books Okafor; the record ages past 24h.
    await injectDoubleBooking(school.id, byEmail);
    const rec = await demoStore.getConflictScan(school.id);
    await demoStore.saveConflictScan(school.id, {
      lastRunAt: new Date(2026, 7, 10, 2, 1, 0).toISOString(),
      conflicts: rec.conflicts,
      conflictKeys: rec.conflictKeys,
      newConflictKeys: rec.newConflictKeys,
    });
    // Day 2: the fixed-hour run finds it NEW → one notification to both admins.
    const run = await runDueScans({ store: demoStore, now: new Date(2026, 7, 11, 2, 1, 0), scanHour: 2 });
    assert.equal(run.results[0].newConflictCount, 1);
    const inbox = await demoStore.listNotifications(school.id, admin.id);
    assert.equal(inbox.length, 1);
    const n = inbox[0];
    assert.equal(n.kind, "timetable_conflict");
    assert.equal(n.subject, "1 new timetable collision");
    assert.ok(n.preview.includes("since the last daily scan"));
    assert.ok(n.body.includes("Mrs. Adaeze Okafor"));
    assert.equal(n.read, false, "unread → the bell badge shows it");
    assert.deepEqual(
      [...n.to].sort(),
      [admin.email, admin2.email].sort(),
      "both admins addressed"
    );
    // The second admin has their OWN unread copy of the same notification.
    const inbox2 = await demoStore.listNotifications(school.id, admin2.id);
    assert.equal(inbox2.length, 1);
    assert.equal(inbox2[0].read, false);
  });

  it("a collision that persists across daily runs is not re-notified", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    // The collision exists BEFORE any scan (legacy import at onboarding).
    await injectDoubleBooking(school.id, byEmail);
    // Day 1: the first scan finds it → new → notified once.
    await runDueScans({ store: demoStore, now: new Date(2026, 7, 10, 2, 1, 0), scanHour: 2 });
    assert.equal((await demoStore.listNotifications(school.id, admin.id)).length, 1);
    // Day 2: still there, but KNOWN → no duplicate notification.
    const rec = await demoStore.getConflictScan(school.id);
    await demoStore.saveConflictScan(school.id, {
      lastRunAt: new Date(2026, 7, 10, 2, 1, 0).toISOString(),
      conflicts: rec.conflicts,
      conflictKeys: rec.conflictKeys,
      newConflictKeys: rec.newConflictKeys,
    });
    const run = await runDueScans({ store: demoStore, now: new Date(2026, 7, 11, 2, 1, 0), scanHour: 2 });
    assert.equal(run.results[0].conflictCount, 1, "still there");
    assert.equal(run.results[0].newConflictCount, 0, "known → not new");
    assert.equal(
      (await demoStore.listNotifications(school.id, admin.id)).length,
      1,
      "still exactly one notification"
    );
  });
});

describe("startConflictScheduler — the boot ticker", () => {
  it("scans never-scanned schools on start with no dashboard involved, and does not re-scan while fresh", async () => {
    const { school } = await seed();
    const sched = startConflictScheduler({
      store: demoStore,
      tickMs: 5,
      scanHour: 0,
      logger: silentLogger,
    });
    await sleep(60); // immediate tick + several interval ticks
    const rec = await demoStore.getConflictScan(school.id);
    assert.ok(rec, "the background job scanned the school on boot");
    const lastRunAt = rec.lastRunAt;
    await sleep(40); // ticks keep firing, but the scan is fresh → all skip
    const rec2 = await demoStore.getConflictScan(school.id);
    assert.equal(rec2.lastRunAt, lastRunAt, "no re-scan while fresh");
    sched.stop();
  });

  it("stop() halts the ticker even when a school becomes due again", async () => {
    const { school } = await seed();
    const sched = startConflictScheduler({
      store: demoStore,
      tickMs: 5,
      scanHour: 0,
      logger: silentLogger,
    });
    await sleep(30);
    const rec = await demoStore.getConflictScan(school.id);
    assert.ok(rec, "scanned after start");
    sched.stop();
    // Age the record past 24h — a LIVE ticker would re-scan on its next tick
    // and rewrite lastRunAt to ~now…
    const agedIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await demoStore.saveConflictScan(school.id, {
      lastRunAt: agedIso,
      conflicts: rec.conflicts,
      conflictKeys: rec.conflictKeys,
      newConflictKeys: rec.newConflictKeys,
      flaggedSlots: rec.flaggedSlots,
    });
    await sleep(40);
    const rec2 = await demoStore.getConflictScan(school.id);
    assert.equal(rec2.lastRunAt, agedIso, "stopped ticker never re-scans (the aged record is untouched)");
  });
});
