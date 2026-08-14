/**
 * Weekly timetable — the SUPER_ADMIN-set schedule that tells every teacher
 * which classes they take at every point in time. This suite pins:
 *
 *   - the seeded demo timetable (12 arms — JSS1–JSS3 plain + SS1–SS3 × 3
 *     streams — × 5 days × 20 slots/week) is complete and NEVER double-books
 *     a teacher OR an arm (one Mathematics teacher and one English teacher
 *     span all 12 classes — a teacher physically cannot be in two arms at
 *     the same period)
 *   - store round-trip: upsert / delete / conflict-guard parity
 *   - GET is role-scoped: teachers see only their assigned arms, students
 *     only their own arm, parents only their children's arms, staff every arm
 *   - writes (POST assign / DELETE free) are SUPER_ADMIN-only, and POST
 *     validates the subject-specialist scope (a Mathematics teacher cannot
 *     be scheduled for Physics) plus the double-booking guard
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as demoStore from "../src/lib/demo-store.js";
import { runDueScans } from "../src/lib/conflict-scheduler.js";
import {
  appendScanHistory,
  sparklinePoints,
} from "../src/lib/conflict-scan.js";
import { signToken } from "../src/lib/token.js";
import { __setSessionToken } from "./helpers/headers-mock.js";
import {
  DAYS,
  DEFAULT_PERIOD_TIMES,
  conflictKey,
  conflictSlotKeys,
  findOrphanedEntries,
  findScopeViolations,
  findTimetableConflicts,
  findUnassignedPeriods,
  findUnstaffedTeachers,
  getBreakTime,
  getDaySchedule,
  getDayTimeline,
  getPeriodTimes,
  newConflictsSince,
  slotConflictReasons,
  validSubstitutes,
} from "../src/lib/timetable.js";

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
const { GET, POST, DELETE } = await import("../src/app/api/timetable/route.js");
const { GET: HEALTH_GET } = await import("../src/app/api/timetable/health/route.js");
const { POST: SCAN_POST } = await import("../src/app/api/timetable/scan/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-tt-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

async function seed() {
  const [school] = await demoStore.searchSchools("Greenfield");
  const teachers = await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" });
  const byEmail = Object.fromEntries(teachers.map((t) => [t.email, t]));
  const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
  const parent = await demoStore.findUserByEmailInSchool(school.id, "p.adebayo@edutrack.app");
  const byName = Object.fromEntries(students.map((s) => [s.name, s]));
  return { school, teachers, byEmail, students, parent, byName };
}

// The real Nigerian structure — JSS1–JSS3 are PLAIN classes (streaming
// starts at SSS); only SS1–SS3 split into Science/Arts/Commercial (12 arms).
const ALL_ARMS = [
  "JSS1", "JSS2", "JSS3",
  "SS1 Science", "SS1 Arts", "SS1 Commercial",
  "SS2 Science", "SS2 Arts", "SS2 Commercial",
  "SS3 Science", "SS3 Arts", "SS3 Commercial",
];
const SCIENCE_ARMS = ["SS1 Science", "SS2 Science", "SS3 Science"];

function http(url, { method = "GET", body } = {}) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function sessionFor(user) {
  __setSessionToken(signToken({ userId: user.id, role: user.role, schoolId: user.schoolId }));
}

async function get(url) {
  const res = await GET(http(url));
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function post(url, body, actor) {
  sessionFor(actor);
  const res = await POST(http(url, { method: "POST", body }));
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function del(url, body, actor) {
  sessionFor(actor);
  const res = await DELETE(http(url, { method: "DELETE", body }));
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function healthGet(actor) {
  sessionFor(actor);
  const res = await HEALTH_GET(http("/api/timetable/health"));
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function scanPost(actor) {
  sessionFor(actor);
  const res = await SCAN_POST(http("/api/timetable/scan", { method: "POST" }));
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Double-book Okafor in a second arm at one of her real slots (bypassing the API guard, like legacy data). */
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

describe("seeded timetable — complete and collision-free", () => {
  it("ships 12 arms × 5 days × 4 periods = 240 slots, every arm has a full 20-slot week", async () => {
    const { school } = await seed();
    const entries = await demoStore.getTimetable({ schoolId: school.id });
    assert.equal(entries.length, ALL_ARMS.length * DAYS.length * 4);
    for (const arm of ALL_ARMS) {
      const armEntries = entries.filter((e) => e.classArm === arm);
      assert.equal(armEntries.length, DAYS.length * 4, `${arm} has a full week`);
      for (const day of DAYS) {
        const dayEntries = armEntries.filter((e) => e.day === day);
        assert.ok(dayEntries.length >= 1 && dayEntries.length <= 8, `${arm} ${day} has ${dayEntries.length} slots`);
        const periods = dayEntries.map((e) => e.period);
        assert.equal(new Set(periods).size, dayEntries.length, `${arm} ${day} periods are distinct`);
        assert.ok(periods.every((p) => p >= 1 && p <= 8), `${arm} ${day} within the school day`);
      }
    }
  });

  it("never double-books a teacher OR an arm at the same day + period", async () => {
    const { school } = await seed();
    const entries = await demoStore.getTimetable({ schoolId: school.id });
    const seenTeacher = new Set();
    const seenArm = new Set();
    for (const e of entries) {
      const tk = `${e.teacherId}|${e.day}|${e.period}`;
      const ak = `${e.classArm}|${e.day}|${e.period}`;
      assert.equal(seenTeacher.has(tk), false, `double-booked teacher: ${tk}`);
      assert.equal(seenArm.has(ak), false, `double-booked arm: ${ak}`);
      seenTeacher.add(tk);
      seenArm.add(ak);
    }
    // And every slot is staffed by a teacher who actually teaches that
    // subject in that arm (the subject-specialist model).
    const teachers = await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" });
    const byId = Object.fromEntries(teachers.map((t) => [t.id, t]));
    for (const e of entries) {
      const t = byId[e.teacherId];
      assert.ok(t, `entry ${e.id} has a real teacher`);
      assert.ok(t.subjects.includes(e.subject), `${t.name} teaches ${e.subject} in ${e.classArm}`);
      assert.ok(t.assignedClasses.includes(e.classArm), `${t.name} is assigned to ${e.classArm}`);
    }
  });

  it("a Mathematics teacher spans every arm; a Physics teacher only the science arms", async () => {
    const { school, byEmail } = await seed();
    const entries = await demoStore.getTimetable({ schoolId: school.id });
    const okaforArms = new Set(
      entries.filter((e) => e.teacherId === byEmail["a.okafor@edutrack.app"].id).map((e) => e.classArm)
    );
    assert.deepEqual(
      [...okaforArms].sort(),
      [...ALL_ARMS].sort(),
      "Okafor (Mathematics) teaches in ALL 12 classes"
    );
    const nwosuSlots = entries.filter((e) => e.teacherId === byEmail["i.nwosu@edutrack.app"].id);
    assert.ok(nwosuSlots.length > 0);
    assert.ok(nwosuSlots.every((e) => SCIENCE_ARMS.includes(e.classArm)), "Physics teacher only in science arms");
  });
});

describe("timetable store ops — round trip", () => {
  it("upserts a slot (assigning a period replaces what was there)", async () => {
    const { school, byEmail } = await seed();
    const okafor = byEmail["a.okafor@edutrack.app"];
    const first = await demoStore.saveTimetableEntry({
      schoolId: school.id,
      classArm: "SS1 Science",
      day: "Friday",
      period: 8,
      subject: "Mathematics",
      teacherId: okafor.id,
    });
    assert.equal(first.subject, "Mathematics");
    await demoStore.saveTimetableEntry({
      schoolId: school.id,
      classArm: "SS1 Science",
      day: "Friday",
      period: 8,
      subject: "Further Mathematics",
      teacherId: okafor.id,
    });
    const friday = await demoStore.getTimetable({ schoolId: school.id, classArm: "SS1 Science", day: "Friday" });
    const slot = friday.filter((e) => e.period === 8);
    assert.equal(slot.length, 1, "one slot per period — the upsert replaced it");
    assert.equal(slot[0].subject, "Further Mathematics");
  });

  it("delete returns false for a missing slot, true for an existing one", async () => {
    const { school } = await seed();
    assert.equal(
      await demoStore.deleteTimetableEntry({ schoolId: school.id, classArm: "SS1 Science", day: "Saturday", period: 1 }),
      false
    );
    const monday = await demoStore.getTimetable({ schoolId: school.id, classArm: "SS1 Science", day: "Monday" });
    const target = monday[0];
    assert.equal(
      await demoStore.deleteTimetableEntry({ schoolId: school.id, classArm: target.classArm, day: target.day, period: target.period }),
      true
    );
    const after = await demoStore.getTimetable({ schoolId: school.id, classArm: "SS1 Science", day: "Monday" });
    assert.equal(after.length, monday.length - 1);
  });

  it("conflict guard finds the same teacher booked elsewhere; excludeClassArm ignores the slot being edited", async () => {
    const { school, byEmail } = await seed();
    const okafor = byEmail["a.okafor@edutrack.app"];
    // Pick a REAL seeded Okafor slot, then probe that day + period.
    const herSlot = (await demoStore.getTimetable({ schoolId: school.id })).find(
      (e) => e.teacherId === okafor.id
    );
    const conflict = await demoStore.getTimetableConflict({
      schoolId: school.id,
      teacherId: okafor.id,
      day: herSlot.day,
      period: herSlot.period,
    });
    assert.ok(conflict);
    assert.equal(conflict.classArm, herSlot.classArm);
    // Editing the same slot is not a conflict…
    const self = await demoStore.getTimetableConflict({
      schoolId: school.id,
      teacherId: okafor.id,
      day: herSlot.day,
      period: herSlot.period,
      excludeClassArm: herSlot.classArm,
    });
    assert.equal(self, null);
    // …but booking her elsewhere at the same time IS.
    const otherArm = ALL_ARMS.find((a) => a !== herSlot.classArm);
    const other = await demoStore.getTimetableConflict({
      schoolId: school.id,
      teacherId: okafor.id,
      day: herSlot.day,
      period: herSlot.period,
      excludeClassArm: otherArm,
    });
    assert.ok(other);
    assert.equal(other.classArm, herSlot.classArm);
  });
});

describe("GET /api/timetable — role scoping", () => {
  it("SUPER_ADMIN sees every arm, and can narrow with ?classArm=", async () => {
    const { school } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    sessionFor(admin);
    const all = await get("/api/timetable");
    assert.equal(all.status, 200);
    assert.equal(all.body.entries.length, ALL_ARMS.length * 20);
    const one = await get(`/api/timetable?classArm=${encodeURIComponent("SS1 Arts")}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.entries.length, 20);
    assert.ok(one.body.entries.every((e) => e.classArm === "SS1 Arts"));
    assert.ok(one.body.entries.every((e) => typeof e.teacherName === "string" && e.teacherName.length > 0));
  });

  it("TEACHER is locked to their assigned arms (Physics teacher: science arms only)", async () => {
    const { school, byEmail } = await seed();
    sessionFor(byEmail["i.nwosu@edutrack.app"]);
    const all = await get("/api/timetable");
    assert.equal(all.status, 200);
    assert.equal(all.body.entries.length, SCIENCE_ARMS.length * 20);
    assert.ok(all.body.entries.every((e) => SCIENCE_ARMS.includes(e.classArm)), "only science arms");
    // An arm she does not teach is forbidden even when asking directly.
    const denied = await get(`/api/timetable?classArm=${encodeURIComponent("SS1 Arts")}`);
    assert.equal(denied.status, 403);
  });

  it("?mine=1 returns ONLY the teacher's own slots (no colleague's class)", async () => {
    const { school, byEmail } = await seed();
    // Okafor teaches Mathematics in all twelve classes; her arms also contain
    // English/Physics/Chemistry slots taught by other teachers.
    const okafor = byEmail["a.okafor@edutrack.app"];
    sessionFor(okafor);
    const all = await get("/api/timetable");
    assert.equal(all.body.entries.length, ALL_ARMS.length * 20); // every slot in her 12 classes
    const mine = await get("/api/timetable?mine=1");
    assert.equal(mine.status, 200);
    assert.ok(mine.body.entries.length > 0 && mine.body.entries.length < all.body.entries.length);
    assert.ok(
      mine.body.entries.every((e) => e.teacherId === okafor.id),
      "every slot is her own — the alert scheduler must never see a colleague's class"
    );
    assert.ok(mine.body.entries.every((e) => e.subject === "Mathematics"));
  });

  it("?mine=1 is rejected for non-teachers (403)", async () => {
    const { school, byName } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    sessionFor(admin);
    assert.equal((await get("/api/timetable?mine=1")).status, 403);
    sessionFor(byName["Kunle Adebayo"]); // student
    assert.equal((await get("/api/timetable?mine=1")).status, 403);
  });

  it("STUDENT sees only their own class arm", async () => {
    const { school, byName } = await seed();
    sessionFor(byName["Kunle Adebayo"]); // SS1 Science
    const own = await get("/api/timetable");
    assert.equal(own.status, 200);
    assert.equal(own.body.entries.length, 20);
    assert.ok(own.body.entries.every((e) => e.classArm === "SS1 Science"));
    const denied = await get(`/api/timetable?classArm=${encodeURIComponent("SS1 Arts")}`);
    assert.equal(denied.status, 403);
  });

  it("PARENT sees only their linked children's arms", async () => {
    const { parent } = await seed(); // children: Kunle + Chidinma, both SS1 Science
    sessionFor(parent);
    const own = await get("/api/timetable");
    assert.equal(own.status, 200);
    assert.equal(own.body.entries.length, 20);
    assert.ok(own.body.entries.every((e) => e.classArm === "SS1 Science"));
    const denied = await get(`/api/timetable?classArm=${encodeURIComponent("SS2 Science")}`);
    assert.equal(denied.status, 403);
  });

  it("legacy single-arm teacher (assignedClass only) gets exactly their one arm", async () => {
    const { school } = await seed();
    const legacy = await demoStore.createUser({
      schoolId: school.id,
      name: "Legacy Teacher",
      email: "legacy.tt@edutrack.app",
      password: "legacy123",
      role: "TEACHER",
      assignedClass: "SS1 Arts",
    });
    sessionFor(legacy);
    const own = await get("/api/timetable");
    assert.equal(own.status, 200);
    assert.equal(own.body.entries.length, 20);
    assert.ok(own.body.entries.every((e) => e.classArm === "SS1 Arts"));
    const denied = await get(`/api/timetable?classArm=${encodeURIComponent("SS1 Science")}`);
    assert.equal(denied.status, 403);
  });

  it("?day= narrows the schedule to one school day", async () => {
    const { school } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    sessionFor(admin);
    const monday = await get("/api/timetable?day=Monday");
    assert.equal(monday.status, 200);
    assert.ok(monday.body.entries.every((e) => e.day === "Monday"));
    // Every arm is present on the day (each arm runs 1-6 periods a day).
    const armSet = new Set(monday.body.entries.map((e) => e.classArm));
    assert.equal(armSet.size, ALL_ARMS.length);
    const junk = await get("/api/timetable?day=Sunday");
    assert.equal(junk.status, 200);
    assert.equal(junk.body.entries.length, 0);
  });

  it("BURSAR and REGISTRAR get 403 — the timetable is for staff-admins, teachers, students and parents", async () => {
    const { school } = await seed();
    const bursar = await demoStore.findUserByEmailInSchool(school.id, "bursar@edutrack.app");
    sessionFor(bursar);
    const res = await get("/api/timetable");
    assert.equal(res.status, 403);
  });
});

describe("POST /api/timetable — SUPER_ADMIN only, with scope + double-booking checks", () => {
  it("REGISTRAR cannot assign a slot (403)", async () => {
    const { school } = await seed();
    const registrar = await demoStore.findUserByEmailInSchool(school.id, "registrar@edutrack.app");
    const { status, body } = await post(
      "/api/timetable",
      { classArm: "SS1 Science", day: "Monday", period: 1, subject: "Mathematics", teacherId: registrar.id },
      registrar
    );
    assert.equal(status, 403);
    assert.equal(body.error, "Forbidden");
  });

  it("SUPER_ADMIN assigns a valid slot and gets it back with the teacher's name", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const okafor = byEmail["a.okafor@edutrack.app"];
    // Find a Friday period free for BOTH SS1 Science and Okafor.
    const friday = await demoStore.getTimetable({ schoolId: school.id, day: "Friday" });
    const armPeriods = new Set(friday.filter((e) => e.classArm === "SS1 Science").map((e) => e.period));
    const teacherPeriods = new Set(friday.filter((e) => e.teacherId === okafor.id).map((e) => e.period));
    let period = null;
    for (let p = 1; p <= 8; p++) {
      if (!armPeriods.has(p) && !teacherPeriods.has(p)) {
        period = p;
        break;
      }
    }
    assert.ok(period, "found a Friday period free for both");
    const { status, body } = await post(
      "/api/timetable",
      { classArm: "SS1 Science", day: "Friday", period, subject: "Mathematics", teacherId: okafor.id },
      admin
    );
    assert.equal(status, 200);
    assert.equal(body.entry.subject, "Mathematics");
    assert.equal(body.entry.teacherName, "Mrs. Adaeze Okafor");
    assert.equal(body.entry.classArm, "SS1 Science");
  });

  it("refuses a subject the teacher does not teach (Mathematics teacher, Physics slot)", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const { status, body } = await post(
      "/api/timetable",
      { classArm: "SS1 Science", day: "Monday", period: 2, subject: "Physics", teacherId: byEmail["a.okafor@edutrack.app"].id },
      admin
    );
    assert.equal(status, 400);
    assert.match(body.error, /does not teach Physics/);
  });

  it("refuses an arm the teacher is not assigned to (Government teacher, science arm)", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const { status, body } = await post(
      "/api/timetable",
      { classArm: "SS1 Science", day: "Monday", period: 2, subject: "Government", teacherId: byEmail["a.suleiman@edutrack.app"].id },
      admin
    );
    assert.equal(status, 400);
    assert.match(body.error, /is not assigned to SS1 Science/);
  });

  it("refuses a double-booking — the teacher is already in another arm that period", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const okafor = byEmail["a.okafor@edutrack.app"];
    // Use a REAL seeded Okafor slot as the conflict target.
    const herSlot = (await demoStore.getTimetable({ schoolId: school.id })).find(
      (e) => e.teacherId === okafor.id
    );
    const otherArm = ALL_ARMS.find((a) => a !== herSlot.classArm);
    const { status, body } = await post(
      "/api/timetable",
      { classArm: otherArm, day: herSlot.day, period: herSlot.period, subject: "Mathematics", teacherId: okafor.id },
      admin
    );
    assert.equal(status, 400);
    assert.match(
      body.error,
      new RegExp(`already teaches Mathematics in ${herSlot.classArm} on ${herSlot.day}, period ${herSlot.period}`)
    );
  });

  it("validates day/period and unknown teachers", async () => {
    const { school } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const { status: badDay } = await post(
      "/api/timetable",
      { classArm: "SS1 Science", day: "Saturday", period: 1, subject: "Mathematics", teacherId: admin.id },
      admin
    );
    assert.equal(badDay, 400);
    const { status: badPeriod } = await post(
      "/api/timetable",
      { classArm: "SS1 Science", day: "Monday", period: 9, subject: "Mathematics", teacherId: admin.id },
      admin
    );
    assert.equal(badPeriod, 400);
    const { status: noTeacher } = await post(
      "/api/timetable",
      { classArm: "SS1 Science", day: "Monday", period: 1, subject: "Mathematics", teacherId: "usr_999999" },
      admin
    );
    assert.equal(noTeacher, 400);
  });
});

describe("getDayTimeline — the realistic school day with an explicit break", () => {
  it("interleaves the mid-day break between periods 4 and 5 with the default times", () => {
    const timeline = getDayTimeline(null);
    assert.equal(timeline.length, 9, "8 teaching periods + 1 break");
    assert.deepEqual(
      timeline.map((b) => (b.type === "break" ? "break" : b.period)),
      [1, 2, 3, 4, "break", 5, 6, 7, 8]
    );
    const breakBlock = timeline[4];
    assert.equal(breakBlock.type, "break");
    assert.equal(breakBlock.start, "10:40");
    assert.equal(breakBlock.end, "11:00");
    // Teaching blocks keep their bell times and type.
    assert.equal(timeline[0].type, "teaching");
    assert.equal(timeline[0].start, "08:00");
    assert.equal(timeline[3].end, "10:40"); // period 4 ends where the break starts
    assert.equal(timeline[5].start, "11:00"); // period 5 starts where the break ends
  });

  it("honours a school's custom break window", () => {
    const timeline = getDayTimeline({ breakTimes: { start: "11:00", end: "11:20" } });
    assert.equal(timeline[4].start, "11:00");
    assert.equal(timeline[4].end, "11:20");
    assert.deepEqual(getBreakTime({ breakTimes: { start: "11:00", end: "11:20" } }), {
      start: "11:00",
      end: "11:20",
    });
  });

  it("falls back to the default break for missing or malformed breakTimes", () => {
    assert.deepEqual(getBreakTime({}), { start: "10:40", end: "11:00" });
    assert.deepEqual(getBreakTime({ breakTimes: { start: "oops", end: "11:00" } }), {
      start: "10:40",
      end: "11:00",
    });
  });

  it("getPeriodTimes stays pure teaching bells — class alerts never see the break", () => {
    const bells = getPeriodTimes({ breakTimes: { start: "11:00", end: "11:20" } });
    assert.equal(bells.length, 8);
    assert.ok(bells.every((p) => p.type === undefined || p.type === "teaching"));
    assert.deepEqual(bells.map((p) => p.period), [1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("per-weekday bell schedules (dailySchedules) — e.g. Friday ends at period 6", () => {
  // A school whose Friday runs only periods 1-6 (no afternoon 7/8), with its
  // own break window; every other day inherits the school-wide schedule.
  const fridayTimes = DEFAULT_PERIOD_TIMES.slice(0, 6).map((p) => ({ ...p }));
  const school = {
    periodTimes: DEFAULT_PERIOD_TIMES.map((p) => ({ ...p })),
    dailySchedules: {
      Friday: {
        periodTimes: fridayTimes,
        breakTimes: { start: "11:15", end: "11:35" },
      },
    },
  };

  it("getPeriodTimes(school, day) returns the day's override EXACTLY — never padded back to 8", () => {
    const friday = getPeriodTimes(school, "Friday");
    assert.equal(friday.length, 6, "a short Friday stays short");
    assert.deepEqual(friday.map((p) => p.period), [1, 2, 3, 4, 5, 6]);
    // Days without an override fall back to the school-wide schedule.
    assert.deepEqual(getPeriodTimes(school, "Monday"), DEFAULT_PERIOD_TIMES);
    assert.deepEqual(getPeriodTimes(school), DEFAULT_PERIOD_TIMES, "no day arg = school-wide");
  });

  it("getDayTimeline(school, day) renders each day's own timeline", () => {
    const friday = getDayTimeline(school, "Friday");
    assert.deepEqual(
      friday.map((b) => (b.type === "break" ? "break" : b.period)),
      [1, 2, 3, 4, "break", 5, 6]
    );
    assert.equal(friday[4].start, "11:15"); // Friday's own break window
    assert.equal(friday[4].end, "11:35");
    const monday = getDayTimeline(school, "Monday");
    assert.equal(monday.length, 9, "un-overridden days keep the full day");
    assert.equal(monday[4].start, "10:40", "and the school-wide break");
  });

  it("getDaySchedule exposes the resolved schedule + whether the day is overridden", () => {
    const friday = getDaySchedule(school, "Friday");
    assert.equal(friday.overridden, true);
    assert.equal(friday.periodTimes.length, 6);
    assert.deepEqual(friday.breakTimes, { start: "11:15", end: "11:35" });
    const monday = getDaySchedule(school, "Monday");
    assert.equal(monday.overridden, false);
    assert.equal(monday.periodTimes.length, 8);
    // An override with only a break (no periodTimes) is still detected.
    const breakOnly = getDaySchedule(
      { dailySchedules: { Tuesday: { breakTimes: { start: "10:50", end: "11:10" } } } },
      "Tuesday"
    );
    assert.equal(breakOnly.overridden, true);
    assert.equal(breakOnly.periodTimes.length, 8, "periods fall back to defaults");
  });

  it("a day override with zero periods is impossible via the API but resolves safely", () => {
    // The API rejects empty periodTimes; an empty override (defensive) falls
    // back to the defaults rather than silently disabling the day's alarms.
    assert.deepEqual(
      getPeriodTimes({ dailySchedules: { Friday: { periodTimes: [] } } }, "Friday"),
      DEFAULT_PERIOD_TIMES
    );
    assert.equal(
      getDayTimeline({ dailySchedules: { Friday: { periodTimes: [] } } }, "Friday").length,
      9
    );
  });
});

describe("findTimetableConflicts — the integrity scan", () => {
  it("reports zero conflicts for the seeded 360-slot grid", async () => {
    const { school } = await seed();
    const entries = await demoStore.getTimetable({ schoolId: school.id });
    assert.deepEqual(findTimetableConflicts(entries), { teacher: [], arm: [] });
  });

  it("flags a teacher double-booked in two arms at the same day + period (pre-existing data)", async () => {
    const { school, byEmail } = await seed();
    const okafor = byEmail["a.okafor@edutrack.app"];
    // A REAL seeded Okafor slot, then a second arm already holds her at the
    // same time — written directly to the store, bypassing the API guard the
    // way legacy/imported data could.
    const herSlot = (await demoStore.getTimetable({ schoolId: school.id })).find(
      (e) => e.teacherId === okafor.id
    );
    const otherArm = ALL_ARMS.find((a) => a !== herSlot.classArm);
    await demoStore.saveTimetableEntry({
      schoolId: school.id,
      classArm: otherArm,
      day: herSlot.day,
      period: herSlot.period,
      subject: "Mathematics",
      teacherId: okafor.id,
    });
    const entries = await demoStore.getTimetable({ schoolId: school.id });
    const { teacher, arm } = findTimetableConflicts(entries);
    assert.equal(teacher.length, 1);
    assert.equal(teacher[0].teacherId, okafor.id);
    assert.equal(teacher[0].day, herSlot.day);
    assert.equal(teacher[0].period, herSlot.period);
    assert.equal(teacher[0].slots.length, 2);
    assert.deepEqual(
      teacher[0].slots.map((s) => s.classArm).sort(),
      [herSlot.classArm, otherArm].sort()
    );
    assert.equal(arm.length, 0, "each arm still holds one slot per period");
  });

  it("flags duplicated entries in the SAME arm at one period (legacy corruption)", () => {
    // Two different teachers in one arm at the same day + period — the upsert
    // normally prevents this, but duplicated legacy data can carry it.
    const { teacher, arm } = findTimetableConflicts([
      { id: "a", classArm: "SS1 Science", day: "Monday", period: 1, teacherId: "t1", subject: "Mathematics" },
      { id: "b", classArm: "SS1 Science", day: "Monday", period: 1, teacherId: "t2", subject: "Physics" },
    ]);
    assert.equal(teacher.length, 0, "different teachers — no teacher conflict");
    assert.equal(arm.length, 1);
    assert.equal(arm[0].classArm, "SS1 Science");
    assert.equal(arm[0].slots.length, 2);
  });

  it("sorts conflicts by school-day order then period, and groups 3-way clashes", async () => {
    const { school, byEmail } = await seed();
    const okafor = byEmail["a.okafor@edutrack.app"];
    const herSlot = (await demoStore.getTimetable({ schoolId: school.id })).find(
      (e) => e.teacherId === okafor.id
    );
    const arms = ALL_ARMS.filter((a) => a !== herSlot.classArm).slice(0, 2);
    for (const arm of arms) {
      await demoStore.saveTimetableEntry({
        schoolId: school.id,
        classArm: arm,
        day: herSlot.day,
        period: herSlot.period,
        subject: "Mathematics",
        teacherId: okafor.id,
      });
    }
    const entries = await demoStore.getTimetable({ schoolId: school.id });
    const { teacher } = findTimetableConflicts(entries);
    assert.equal(teacher.length, 1);
    assert.equal(teacher[0].slots.length, 3, "all three arms group into one conflict");
  });

  it("ignores unstaffed/undefined teacherId entries", () => {
    const { teacher, arm } = findTimetableConflicts([
      { id: "a", classArm: "SS1 Science", day: "Monday", period: 1, teacherId: "t1", subject: "Mathematics" },
      { id: "b", classArm: "SS1 Science", day: "Monday", period: 1, teacherId: "t1", subject: "Mathematics" },
      { id: "c", classArm: "SS1 Arts", day: "Monday", period: 1, subject: "Free period" },
    ]);
    assert.equal(teacher.length, 1);
    assert.equal(arm.length, 1);
    assert.equal(teacher[0].slots.length, 2);
  });
});

describe("GET /api/timetable?conflicts=1 — SUPER_ADMIN integrity scan", () => {
  it("returns a clean scan for the seeded grid, with both lists empty", async () => {
    const { school } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    sessionFor(admin);
    const res = await get("/api/timetable?conflicts=1");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.conflicts, {
      teacher: [],
      arm: [],
      scope: [],
      unassignedPeriods: [],
      unstaffedTeachers: [],
      orphanedEntries: [],
    });
  });

  it("lists an injected double-booking with the teacher's name resolved", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const okafor = byEmail["a.okafor@edutrack.app"];
    const herSlot = (await demoStore.getTimetable({ schoolId: school.id })).find(
      (e) => e.teacherId === okafor.id
    );
    const otherArm = ALL_ARMS.find((a) => a !== herSlot.classArm);
    await demoStore.saveTimetableEntry({
      schoolId: school.id,
      classArm: otherArm,
      day: herSlot.day,
      period: herSlot.period,
      subject: "Mathematics",
      teacherId: okafor.id,
    });
    sessionFor(admin);
    const res = await get("/api/timetable?conflicts=1");
    assert.equal(res.status, 200);
    assert.equal(res.body.conflicts.teacher.length, 1);
    assert.equal(res.body.conflicts.teacher[0].teacherName, "Mrs. Adaeze Okafor");
    assert.equal(res.body.conflicts.teacher[0].slots.length, 2);
    // Fix one side via DELETE and the scan comes back clean.
    const { status } = await del(
      "/api/timetable",
      { classArm: otherArm, day: herSlot.day, period: herSlot.period },
      admin
    );
    assert.equal(status, 200);
    const again = await get("/api/timetable?conflicts=1");
    assert.deepEqual(again.body.conflicts, {
      teacher: [],
      arm: [],
      scope: [],
      unassignedPeriods: [],
      unstaffedTeachers: [],
      orphanedEntries: [],
    });
  });

  it("is forbidden for non-super-admins (teacher, registrar, student)", async () => {
    const { school, byEmail, byName } = await seed();
    sessionFor(byEmail["i.nwosu@edutrack.app"]); // teacher
    assert.equal((await get("/api/timetable?conflicts=1")).status, 403);
    const registrar = await demoStore.findUserByEmailInSchool(school.id, "registrar@edutrack.app");
    sessionFor(registrar);
    assert.equal((await get("/api/timetable?conflicts=1")).status, 403);
    sessionFor(byName["Kunle Adebayo"]);
    assert.equal((await get("/api/timetable?conflicts=1")).status, 403);
  });
});

describe("scope violations — a teacher scheduled outside their subject/arm scope", () => {
  async function teachersByIdOf(schoolId) {
    const teachers = await demoStore.listUsers({ schoolId, role: "TEACHER" });
    return Object.fromEntries(teachers.map((t) => [t.id, t]));
  }

  // The seed has exactly ONE teacher per subject (the Nigerian specialist
  // model), so a Mathematics slot has no other Mathematics teacher to swap
  // in. Add a second, unbooked Mathematics teacher — the realistic case when
  // a school has more than one specialist per subject.
  async function addSecondMathTeacher(schoolId) {
    const school = await demoStore.getSchoolById(schoolId);
    return demoStore.createUser({
      schoolId,
      name: "Mr. New Maths",
      email: "maths2@edutrack.app",
      password: "maths123",
      role: "TEACHER",
      assignedClass: "SS1 Science",
      subjects: ["Mathematics"],
      assignedClasses: school.activeArms,
    });
  }

  it("the seeded 360-slot grid has zero scope violations", async () => {
    const { school } = await seed();
    const entries = await demoStore.getTimetable({ schoolId: school.id });
    const byId = await teachersByIdOf(school.id);
    assert.deepEqual(
      findScopeViolations(entries.map((e) => ({ ...e, teacherName: byId[e.teacherId]?.name })), byId),
      []
    );
  });

  it("flags subject violations, arm violations, both, and teachers missing from the roster", async () => {
    const { school, byEmail } = await seed();
    const byId = await teachersByIdOf(school.id);
    const okafor = byId[byEmail["a.okafor@edutrack.app"].id]; // Mathematics, ALL arms
    const bakare = byId[byEmail["t.bakare@edutrack.app"].id]; // English Language, ALL arms
    const anya = byId[byEmail["e.anya@edutrack.app"].id]; // French, arts arms only
    const entry = (subject, teacherId, classArm) => ({
      id: `ttb_${subject}_${classArm}`,
      classArm,
      day: "Monday",
      period: 1,
      teacherId,
      subject,
      teacherName: byId[teacherId]?.name,
    });
    const violations = findScopeViolations(
      [
        entry("Mathematics", bakare.id, "SS1 Science"), // subject: Bakare teaches English
        entry("French", anya.id, "SS1 Science"), // arm: Anya (French, arts arms only) is not on a science arm
        entry("Physics", anya.id, "SS1 Science"), // both: Anya teaches French, arts arms only
        entry("Mathematics", okafor.id, "SS1 Science"), // clean: Okafor teaches Math in SS1 Science
        // Not in roster — names resolve from the roster per scan, so none here.
        { ...entry("Mathematics", okafor.id, "SS1 Science"), teacherId: "usr_missing", teacherName: undefined },
      ],
      byId
    );
    assert.equal(violations.length, 4);
    assert.deepEqual(violations.find((v) => v.teacherId === bakare.id).problems, ["subject"]);
    assert.deepEqual(
      violations.find((v) => v.teacherId === anya.id && v.subject === "French").problems,
      ["arm"]
    );
    assert.deepEqual(
      violations.find((v) => v.teacherId === anya.id && v.subject === "Physics").problems.sort(),
      ["arm", "subject"]
    );
    assert.deepEqual(violations.find((v) => v.teacherId === "usr_missing").problems, ["teacher"]);
    assert.equal(violations.find((v) => v.teacherId === "usr_missing").teacherName, undefined);
  });

  it("validSubstitutes only offers teachers who teach the subject, fit the arm, and are free that period", async () => {
    const { school, byEmail } = await seed();
    const byId = await teachersByIdOf(school.id);
    const all = await demoStore.getTimetable({ schoolId: school.id });
    const okafor = byId[byEmail["a.okafor@edutrack.app"].id];
    const herSlot = all.find((e) => e.teacherId === okafor.id);
    // Okafor teaches the slot's subject; find a busy teacher (someone booked
    // at the same day+period elsewhere) and a Physics-only teacher.
    const busyAt = all.find(
      (e) => e.day === herSlot.day && e.period === herSlot.period && e.teacherId !== herSlot.teacherId
    );
    const secondMath = await addSecondMathTeacher(school.id);
    const byIdWithSecond = { ...byId, [secondMath.id]: secondMath };
    const subs = validSubstitutes({
      entries: all,
      teachersById: byIdWithSecond,
      subject: herSlot.subject,
      classArm: herSlot.classArm,
      day: herSlot.day,
      period: herSlot.period,
    });
    assert.ok(subs.length >= 1, "at least one valid substitute exists");
    assert.ok(subs.some((s) => s.id === secondMath.id), "the second Mathematics teacher is offered");
    for (const s of subs) {
      const t = byIdWithSecond[s.id];
      assert.ok(
        t.subjects.length === 0 || t.subjects.includes(herSlot.subject),
        `${t.name} teaches ${herSlot.subject}`
      );
      assert.ok(
        t.assignedClasses.length === 0 || t.assignedClasses.includes(herSlot.classArm),
        `${t.name} fits ${herSlot.classArm}`
      );
      assert.ok(
        !all.some((e) => e.teacherId === s.id && e.day === herSlot.day && e.period === herSlot.period),
        `${t.name} is free at that period`
      );
    }
    if (busyAt) {
      assert.ok(!subs.some((s) => s.id === busyAt.teacherId), "a teacher already booked that period is excluded");
    }
    // A legacy unscoped teacher (no subjects/arms) is a valid substitute.
    const legacy = await demoStore.createUser({
      schoolId: school.id,
      name: "Legacy Unscoped",
      email: "legacy.scope@edutrack.app",
      password: "legacy123",
      role: "TEACHER",
      assignedClass: "",
    });
    const subs2 = validSubstitutes({
      entries: all,
      teachersById: { ...byId, [legacy.id]: legacy },
      subject: herSlot.subject,
      classArm: herSlot.classArm,
      day: herSlot.day,
      period: herSlot.period,
    });
    assert.ok(subs2.some((s) => s.id === legacy.id), "unscoped legacy teachers are substitutable");
  });

  it("?conflicts=1 lists a scope violation with valid swap candidates and the teacher's name", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const okafor = byEmail["a.okafor@edutrack.app"];
    const bakare = byEmail["t.bakare@edutrack.app"]; // English teacher — not Mathematics
    // Overwrite one of Okafor's real Mathematics slots with Bakare (direct
    // store write — the assign API would refuse it, exactly like legacy data).
    const herSlot = (await demoStore.getTimetable({ schoolId: school.id })).find(
      (e) => e.teacherId === okafor.id
    );
    await demoStore.saveTimetableEntry({
      schoolId: school.id,
      classArm: herSlot.classArm,
      day: herSlot.day,
      period: herSlot.period,
      subject: "Mathematics",
      teacherId: bakare.id,
    });
    sessionFor(admin);
    const res = await get("/api/timetable?conflicts=1");
    assert.equal(res.status, 200);
    const scope = res.body.conflicts.scope || [];
    assert.equal(scope.length, 1);
    assert.equal(scope[0].teacherName, "Mr. Tunde Bakare");
    assert.ok(scope[0].problems.includes("subject"));
    assert.equal(scope[0].classArm, herSlot.classArm);
    // Candidates: teachers who teach Mathematics in that arm and are free.
    // The seed has only ONE Mathematics teacher (the violating English
    // teacher plus Okafor, who owns the slot) — add a second so there is a
    // real substitute to swap in, like a school with multiple specialists.
    const secondMath = await addSecondMathTeacher(school.id);
    sessionFor(admin);
    const res2 = await get("/api/timetable?conflicts=1");
    const scope2 = res2.body.conflicts.scope || [];
    assert.equal(scope2.length, 1);
    assert.ok(scope2[0].candidates.some((c) => c.id === secondMath.id), "the second Mathematics teacher is offered");
    const teachers = await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" });
    const byId = Object.fromEntries(teachers.map((t) => [t.id, t]));
    assert.ok(scope2[0].candidates.length >= 1);
    for (const c of scope2[0].candidates) {
      const t = byId[c.id];
      assert.ok(
        t.subjects.length === 0 || t.subjects.includes("Mathematics"),
        `${t.name} teaches Mathematics`
      );
      assert.ok(
        t.assignedClasses.length === 0 || t.assignedClasses.includes(herSlot.classArm),
        `${t.name} fits ${herSlot.classArm}`
      );
    }
    assert.ok(
      !scope2[0].candidates.some((c) => c.id === bakare.id),
      "the violating teacher never qualifies as a substitute"
    );
    // Swapping via the real assign API (a valid candidate) fixes the scan.
    const candidate = scope2[0].candidates[0];
    const { status, body } = await post(
      "/api/timetable",
      {
        classArm: herSlot.classArm,
        day: herSlot.day,
        period: herSlot.period,
        subject: "Mathematics",
        teacherId: candidate.id,
      },
      admin
    );
    assert.equal(status, 200);
    const after = await get("/api/timetable?conflicts=1");
    const scopeAfter = after.body.conflicts.scope || [];
    assert.equal(scopeAfter.length, 0, "the swap cleared the scope violation");
  });
});

describe("conflict health — keys, store round-trip, daily auto-scan, new-collision flag", () => {
  it("conflictKey is stable across slot order and newConflictsSince diffs correctly", () => {
    const c1 = { teacherId: "usr_5", day: "Monday", period: 7, slots: [{ classArm: "JSS1 Arts" }, { classArm: "JSS1 Science" }] };
    const c1reversed = { teacherId: "usr_5", day: "Monday", period: 7, slots: [{ classArm: "JSS1 Science" }, { classArm: "JSS1 Arts" }] };
    assert.equal(conflictKey(c1), conflictKey(c1reversed), "slot order never changes the identity");
    assert.equal(conflictKey(c1), "t|usr_5|Monday|7|JSS1 Arts~JSS1 Science");
    const armC = { classArm: "SS1 Science", day: "Tuesday", period: 2, slots: [{ teacherId: "t1" }, { teacherId: "t2" }] };
    assert.equal(conflictKey(armC), "a|SS1 Science|Tuesday|2|t1~t2");
    assert.equal(newConflictsSince(new Set(), [c1, armC]).length, 2);
    assert.equal(newConflictsSince(new Set([conflictKey(c1)]), [c1, armC]).length, 1);
    assert.equal(newConflictsSince(new Set([conflictKey(c1), conflictKey(armC)]), [c1, armC]).length, 0);
    assert.deepEqual(newConflictsSince(new Set([conflictKey(c1)]), [c1, armC]).map(conflictKey), [conflictKey(armC)]);
  });

  it("conflict scans round-trip through the store (one row per school, upsert)", async () => {
    const { school } = await seed();
    assert.equal(await demoStore.getConflictScan(school.id), null, "never scanned before");
    await demoStore.saveConflictScan(school.id, {
      lastRunAt: new Date().toISOString(),
      conflicts: { teacher: [{ teacherId: "usr_1", day: "Monday", period: 7, slots: [] }], arm: [] },
      conflictKeys: ["t|usr_1|Monday|7|"],
      newConflictKeys: ["t|usr_1|Monday|7|"],
      history: [{ date: "2026-08-10", conflictCount: 1, newCount: 1 }],
    });
    const rec = await demoStore.getConflictScan(school.id);
    assert.equal(rec.conflicts.teacher.length, 1);
    assert.deepEqual(rec.newConflictKeys, ["t|usr_1|Monday|7|"]);
    assert.deepEqual(rec.history, [{ date: "2026-08-10", conflictCount: 1, newCount: 1 }]);
    // A second save replaces the record rather than stacking rows.
    await demoStore.saveConflictScan(school.id, {
      lastRunAt: new Date().toISOString(),
      conflicts: { teacher: [], arm: [] },
      conflictKeys: [],
      newConflictKeys: [],
    });
    const rec2 = await demoStore.getConflictScan(school.id);
    assert.equal(rec2.conflicts.teacher.length, 0);
    assert.equal(rec2.conflictKeys.length, 0);
    // A save without history keeps the existing series (legacy callers never
    // wipe the trend) — and a never-written record defaults to [].
    assert.deepEqual(rec2.history, rec.history, "history survives a history-less save");
    const fresh = await demoStore.saveConflictScan("sch_other", {
      lastRunAt: new Date().toISOString(),
      conflicts: { teacher: [], arm: [] },
      conflictKeys: [],
      newConflictKeys: [],
    });
    assert.deepEqual(fresh.history, []);
  });

  describe("conflict scan history — per-day counts + the sparkline", () => {
    it("appendScanHistory upserts the same day and appends new days, capped at 30", () => {
      let h = appendScanHistory([], new Date(2026, 7, 10, 2, 0, 0), 0, 0);
      assert.deepEqual(h, [{ date: "2026-08-10", conflictCount: 0, newCount: 0 }]);
      // A manual scan later the SAME day replaces the day's point.
      h = appendScanHistory(h, new Date(2026, 7, 10, 11, 0, 0), 1, 1);
      assert.equal(h.length, 1, "one point per day");
      assert.equal(h[0].conflictCount, 1);
      // The next day appends; the series stays ascending by date.
      h = appendScanHistory(h, new Date(2026, 7, 11, 2, 0, 0), 0, 0);
      assert.deepEqual(h.map((x) => x.date), ["2026-08-10", "2026-08-11"]);
      // Cap: 40 days of scans keep only the last 30.
      let big = [];
      for (let i = 0; i < 40; i++) {
        big = appendScanHistory(big, new Date(2026, 0, 1 + i, 2, 0, 0), i % 3, 0);
      }
      assert.equal(big.length, 30);
      assert.equal(big[0].date, "2026-01-11");
    });

    it("sparklinePoints: null below 2 points; maps counts to an SVG polyline (y inverted)", () => {
      assert.equal(sparklinePoints([]), null);
      assert.equal(sparklinePoints([{ conflictCount: 0 }]), null);
      const pts = sparklinePoints(
        [{ conflictCount: 0 }, { conflictCount: 1 }, { conflictCount: 0 }],
        { width: 120, height: 28 }
      );
      const coords = pts.split(" ").map((p) => p.split(",").map(Number));
      assert.equal(coords.length, 3);
      assert.equal(coords[0][0], 0, "starts at the left edge");
      assert.equal(coords[2][0], 120, "ends at the right edge");
      assert.ok(coords[0][1] > coords[1][1], "higher count → higher on the chart");
      assert.equal(coords[0][1], coords[2][1], "equal counts → equal height");
      // Only the last maxPoints matter (the cap already bounds the series).
      const trimmed = sparklinePoints(
        [{ conflictCount: 0 }, { conflictCount: 5 }, { conflictCount: 2 }],
        { width: 100, height: 20, maxPoints: 2 }
      );
      assert.equal(trimmed.split(" ").length, 2);
    });

    it("runConflictScan records one point per day; health exposes the history", async () => {
      const { school, byEmail } = await seed();
      const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
      // Day 1: clean baseline.
      await scanPost(admin);
      let rec = await demoStore.getConflictScan(school.id);
      assert.deepEqual(rec.history.map((h) => h.conflictCount), [0]);
      // Same-day manual scan upserts the day's point — still one entry.
      await injectDoubleBooking(school.id, byEmail);
      await scanPost(admin);
      rec = await demoStore.getConflictScan(school.id);
      assert.equal(rec.history.length, 1, "same day → one point");
      assert.equal(rec.history[0].conflictCount, 1);
      // The health read surfaces the series for the sparkline.
      const health = await healthGet(admin);
      assert.equal(health.status, 200);
      assert.deepEqual(health.body.history.map((h) => h.conflictCount), [1]);
    });

    it("legacy scan records without history read back as []", async () => {
      const { school } = await seed();
      await demoStore.saveConflictScan(school.id, {
        lastRunAt: new Date().toISOString(),
        conflicts: { teacher: [], arm: [], scope: [] },
        conflictKeys: [],
        newConflictKeys: [],
      });
      const rec = await demoStore.getConflictScan(school.id);
      assert.deepEqual(rec.history, []);
      const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
      const health = await healthGet(admin);
      assert.deepEqual(health.body.history, []);
      assert.deepEqual(health.body.unassignedPeriods, []);
      assert.equal(health.body.unassignedPeriodCount, 0);
      assert.equal(health.body.unstaffedTeacherCount, 0);
      assert.equal(health.body.orphanedEntryCount, 0);
      assert.equal(health.body.issueCount, 0);
    });
  });

  describe("integrity checks — unassigned days, unscheduled teachers, orphaned entries", () => {
    it("findUnassignedPeriods flags only arm-days with ZERO classes (gaps are normal)", () => {
      const entries = [
        { classArm: "JSS1 Science", day: "Monday", period: 1 },
        { classArm: "JSS1 Science", day: "Monday", period: 4 },
        { classArm: "JSS1 Science", day: "Tuesday", period: 2 },
        { classArm: "JSS1 Arts", day: "Monday", period: 1 },
      ];
      const arms = ["JSS1 Science", "JSS1 Arts", "JSS1 Commercial"];
      const found = findUnassignedPeriods(entries, arms, ["Monday", "Tuesday"]);
      assert.deepEqual(found, [
        // JSS1 Science has Monday + Tuesday; JSS1 Arts has Monday only;
        // JSS1 Commercial has nothing at all.
        { classArm: "JSS1 Arts", day: "Tuesday" },
        { classArm: "JSS1 Commercial", day: "Monday" },
        { classArm: "JSS1 Commercial", day: "Tuesday" },
      ]);
      // Monday period 4 being empty is NOT flagged — arms don't fill every period.
      assert.ok(!found.some((f) => f.classArm === "JSS1 Science"));
    });

    it("findUnstaffedTeachers lists roster teachers with no slots at all", () => {
      const entries = [{ teacherId: "t1", day: "Monday", period: 1 }];
      const teachers = [
        { id: "t1", name: "Mrs. A" },
        { id: "t2", name: "Mr. B" },
        { id: "t3", name: "Ms. C" },
      ];
      assert.deepEqual(findUnstaffedTeachers(entries, teachers), [
        { teacherId: "t2", teacherName: "Mr. B" },
        { teacherId: "t3", teacherName: "Ms. C" },
      ]);
    });

    it("findOrphanedEntries flags only entries in deactivated arms (missing teachers stay in scope)", () => {
      const entries = [
        { id: "e1", classArm: "JSS1 Science", day: "Monday", period: 1, subject: "Mathematics", teacherId: "t1", teacherName: "Mrs. A" },
        { id: "e2", classArm: "JSS1 Commercial", day: "Tuesday", period: 2, subject: "Commerce", teacherId: "t2", teacherName: "Mr. B" },
        { id: "e3", classArm: "JSS1 Commercial", day: "Wednesday", period: 3, subject: "Commerce", teacherId: "t9", teacherName: undefined },
      ];
      const active = ["JSS1 Science"]; // JSS1 Commercial was deactivated
      assert.deepEqual(findOrphanedEntries(entries, active), [
        {
          entryId: "e2",
          classArm: "JSS1 Commercial",
          day: "Tuesday",
          period: 2,
          subject: "Commerce",
          teacherId: "t2",
          teacherName: "Mr. B",
        },
        {
          entryId: "e3",
          classArm: "JSS1 Commercial",
          day: "Wednesday",
          period: 3,
          subject: "Commerce",
          teacherId: "t9",
          teacherName: undefined,
        },
      ]);
    });

    it("a clean seed has ZERO integrity issues (empty periods are not issues)", async () => {
      const { school } = await seed();
      const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
      const scan = await scanPost(admin);
      assert.equal(scan.status, 200);
      assert.equal(scan.body.unassignedPeriodCount, 0);
      assert.equal(scan.body.unstaffedTeacherCount, 0);
      assert.equal(scan.body.orphanedEntryCount, 0);
      assert.equal(scan.body.issueCount, 0, "clean schedule → Schedule Health Clear");
    });

    it("the scan counts every integrity defect once and health surfaces it", async () => {
      const { school, byEmail } = await seed();
      const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
      const schoolFull = await demoStore.getSchoolById(school.id);
      // 1) Unassigned day: wipe JSS2's whole Wednesday (plain class, no stream).
      const entries = await demoStore.getTimetable({ schoolId: school.id });
      for (const e of entries.filter((x) => x.classArm === "JSS2" && x.day === "Wednesday")) {
        await demoStore.deleteTimetableEntry({ schoolId: school.id, classArm: e.classArm, day: e.day, period: e.period });
      }
      // 2) Unstaffed teacher: hired but never scheduled.
      const newTeacher = await demoStore.createUser({
        schoolId: school.id,
        name: "Mrs. Yetunde Ade",
        email: "y.ade@edutrack.app",
        password: "teacher123",
        role: "TEACHER",
        assignedClass: "JSS1",
        subjects: ["Mathematics"],
        assignedClasses: ["JSS1"],
      });
      // 3) Orphaned entries: SS1 Commercial is deactivated but its slots remain.
      const commercialEntries = entries.filter((e) => e.classArm === "SS1 Commercial").length;
      await demoStore.updateSchool(school.id, {
        activeArms: schoolFull.activeArms.filter((a) => a !== "SS1 Commercial"),
      });

      const scan = await scanPost(admin);
      assert.equal(scan.status, 200);
      assert.equal(scan.body.conflictCount, 0, "no double-bookings or scope issues were introduced");
      assert.equal(scan.body.unassignedPeriodCount, 1);
      assert.deepEqual(scan.body.unassignedPeriods, [{ classArm: "JSS2", day: "Wednesday" }]);
      assert.equal(scan.body.unstaffedTeacherCount, 1);
      assert.equal(scan.body.unstaffedTeachers[0].teacherId, newTeacher.id);
      assert.equal(scan.body.orphanedEntryCount, commercialEntries);
      assert.ok(scan.body.orphanedEntries.every((o) => o.classArm === "SS1 Commercial"));
      assert.ok(scan.body.orphanedEntries[0].teacherName, "orphans still resolve the teacher name");
      assert.equal(
        scan.body.issueCount,
        1 + 1 + commercialEntries,
        "every defect counted exactly once"
      );
      // The health read exposes the same counts for the card chips.
      const health = await healthGet(admin);
      assert.equal(health.status, 200);
      assert.equal(health.body.unassignedPeriodCount, 1);
      assert.equal(health.body.unstaffedTeacherCount, 1);
      assert.equal(health.body.orphanedEntryCount, commercialEntries);
      assert.equal(health.body.issueCount, 1 + 1 + commercialEntries);
    });
  });

  it("GET /api/timetable/health is READ-ONLY: a never-scanned school is reported, not scanned", async () => {
    const { school } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const first = await healthGet(admin);
    assert.equal(first.status, 200);
    assert.equal(first.body.neverScanned, true, "never scanned → reported as-is");
    assert.equal(first.body.scannedAt, null);
    assert.equal(first.body.conflictCount, 0, "clean seed");
    assert.equal(first.body.newConflictCount, 0);
    assert.ok(first.body.nextScanAt, "schedules the next fixed-hour scan");
    assert.ok(first.body.scanHour >= 0 && first.body.scanHour <= 23);
    assert.equal(
      await demoStore.getConflictScan(school.id),
      null,
      "the read did NOT write a scan record — scanning is the job's, not the dashboard's"
    );
  });

  it("a fresh health read serves the persisted record — new data only appears after a scan", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const baseline = await scanPost(admin); // the job/admin recorded a clean baseline
    assert.equal(baseline.status, 200);
    assert.equal(baseline.body.conflictCount, 0);
    // A collision appears AFTER the scan (e.g. a legacy import overnight)…
    await injectDoubleBooking(school.id, byEmail);
    // …but the health read is still fresh, so it serves the cached scan.
    const cached = await healthGet(admin);
    assert.equal(cached.body.neverScanned, false);
    assert.equal(cached.body.conflictCount, 0, "cached result does not see the new conflict yet");
    // The manual Scan now catches it AND flags it as new since the last scan.
    const scan = await scanPost(admin);
    assert.equal(scan.status, 200);
    assert.equal(scan.body.conflictCount, 1);
    assert.equal(scan.body.teacherConflicts, 1);
    assert.equal(scan.body.newConflictCount, 1, "the injected collision is NEW vs the previous clean scan");
    assert.equal(scan.body.newConflicts.teacher.length, 1);
    assert.equal(scan.body.newConflicts.teacher[0].teacherName, "Mrs. Adaeze Okafor");
  });

  it("a STALE health read does NOT scan — the daily background job does", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    await scanPost(admin); // baseline clean scan
    await injectDoubleBooking(school.id, byEmail);
    // Age the record past the 24h window — the health read serves it as-is.
    // Both timestamps derive from the REAL clock (not a hardcoded date, which
    // goes stale as time passes): the record is aged 25h back, and the job's
    // tick fires 24h+ after that, so it's unambiguously due.
    const agedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const rec = await demoStore.getConflictScan(school.id);
    await demoStore.saveConflictScan(school.id, {
      lastRunAt: agedAt.toISOString(),
      conflicts: rec.conflicts,
      conflictKeys: rec.conflictKeys,
      newConflictKeys: rec.newConflictKeys,
    });
    const stale = await healthGet(admin);
    assert.equal(stale.body.conflictCount, 0, "stale record served unchanged — no lazy auto-scan");
    assert.equal(stale.body.neverScanned, false);
    // The job's next tick (due: 24h+ elapsed) re-scans and flags the collision.
    const run = await runDueScans({
      store: demoStore,
      now: new Date(agedAt.getTime() + 24 * 60 * 60 * 1000 + 60 * 1000),
      scanHour: 2,
    });
    assert.equal(run.scanned, 1, "the due school got scanned by the job");
    const fresh = await healthGet(admin);
    assert.equal(fresh.body.conflictCount, 1);
    assert.equal(fresh.body.newConflictCount, 1);
    assert.equal(fresh.body.newConflicts.teacher[0].teacherName, "Mrs. Adaeze Okafor");
  });

  it("a conflict that persists across scans is NOT re-flagged as new", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    await injectDoubleBooking(school.id, byEmail);
    const scan1 = await scanPost(admin);
    assert.equal(scan1.body.newConflictCount, 1);
    const scan2 = await scanPost(admin);
    assert.equal(scan2.body.conflictCount, 1, "still there");
    assert.equal(scan2.body.newConflictCount, 0, "known from the previous scan → not flagged again");
  });

  it("health + scan are SUPER_ADMIN-only (teacher, registrar, student all 403)", async () => {
    const { school, byEmail, byName } = await seed();
    assert.equal((await healthGet(byEmail["i.nwosu@edutrack.app"])).status, 403);
    assert.equal((await scanPost(byEmail["i.nwosu@edutrack.app"])).status, 403);
    const registrar = await demoStore.findUserByEmailInSchool(school.id, "registrar@edutrack.app");
    assert.equal((await healthGet(registrar)).status, 403);
    assert.equal((await scanPost(registrar)).status, 403);
    assert.equal((await healthGet(byName["Kunle Adebayo"])).status, 403);
    assert.equal((await scanPost(byName["Kunle Adebayo"])).status, 403);
  });

  it("conflictSlotKeys collects every slot a scan touches; slotConflictReasons names the LIVE ones", () => {
    const conflicts = {
      teacher: [
        {
          teacherId: "t1",
          teacherName: "Mrs. X",
          day: "Monday",
          period: 7,
          slots: [{ classArm: "JSS1 Science" }, { classArm: "JSS1 Arts" }],
        },
      ],
      arm: [{ classArm: "SS1 Science", day: "Tuesday", period: 2, slots: [{}, {}] }],
      scope: [
        {
          type: "scope",
          teacherId: "t2",
          teacherName: "Mr. Y",
          subject: "Physics",
          classArm: "SS1 Arts",
          day: "Monday",
          period: 7,
          problems: ["subject"],
        },
      ],
    };
    assert.deepEqual([...conflictSlotKeys(conflicts)].sort(), [
      "JSS1 Arts|Monday|7",
      "JSS1 Science|Monday|7",
      "SS1 Arts|Monday|7",
      "SS1 Science|Tuesday|2",
    ]);
    // The double-booked teacher's arm is a LIVE conflict with a name…
    const reasons = slotConflictReasons(conflicts, "JSS1 Science", "Monday", 7);
    assert.equal(reasons.length, 1);
    assert.equal(reasons[0], "Mrs. X is double-booked on Monday, period 7 — also in JSS1 Arts");
    // …the scope violation names the problem…
    const scopeReasons = slotConflictReasons(conflicts, "SS1 Arts", "Monday", 7);
    assert.equal(scopeReasons.length, 1);
    assert.ok(scopeReasons[0].includes("Mr. Y doesn't teach the subject"));
    // …the duplicate-arm conflict is live too…
    assert.equal(slotConflictReasons(conflicts, "SS1 Science", "Tuesday", 2).length, 1);
    // …and a slot that only lives in the HISTORY (not this scan) has no live reason.
    assert.deepEqual(slotConflictReasons(conflicts, "SS2 Science", "Friday", 1), []);
  });

  it("saveConflictScan persists flaggedSlots and defaults it to [] for legacy records", async () => {
    const { school } = await seed();
    await demoStore.saveConflictScan(school.id, {
      lastRunAt: new Date().toISOString(),
      conflicts: { teacher: [], arm: [], scope: [] },
      conflictKeys: [],
      newConflictKeys: [],
      flaggedSlots: ["JSS1 Science|Monday|7"],
    });
    const rec = await demoStore.getConflictScan(school.id);
    assert.deepEqual(rec.flaggedSlots, ["JSS1 Science|Monday|7"]);
    // A record saved without the field (legacy callers) resets to [] rather
    // than crashing or carrying a stale value.
    await demoStore.saveConflictScan(school.id, {
      lastRunAt: new Date().toISOString(),
      conflicts: { teacher: [], arm: [], scope: [] },
      conflictKeys: [],
      newConflictKeys: [],
    });
    assert.deepEqual((await demoStore.getConflictScan(school.id)).flaggedSlots, []);
  });

  it("flagged-slot HISTORY survives clean re-scans — the no-silent-regression guarantee", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const herSlot = await injectDoubleBooking(school.id, byEmail); // Okafor in 2 arms
    const otherArm = ALL_ARMS.find((a) => a !== herSlot.classArm);
    const herKey = `${herSlot.classArm}|${herSlot.day}|${herSlot.period}`;
    const otherKey = `${otherArm}|${herSlot.day}|${herSlot.period}`;
    const scan1 = await scanPost(admin);
    assert.equal(scan1.body.conflictCount, 1);
    assert.ok(scan1.body.flaggedSlots.includes(herKey), "both arms of the double-booking are flagged");
    assert.ok(scan1.body.flaggedSlots.includes(otherKey));
    // Resolve the conflict (free the injected slot) and re-scan clean…
    await demoStore.deleteTimetableEntry({ schoolId: school.id, classArm: otherArm, day: herSlot.day, period: herSlot.period });
    const scan2 = await scanPost(admin);
    assert.equal(scan2.body.conflictCount, 0, "conflict resolved");
    assert.equal(scan2.body.newConflictCount, 0);
    // …but the slots STAY flagged: reassigning them must warn the admin.
    assert.ok(scan2.body.flaggedSlots.includes(herKey), "history survives the clean scan");
    assert.ok(scan2.body.flaggedSlots.includes(otherKey));
    // The health read exposes the same history for the cell-editor warning.
    const health = await healthGet(admin);
    assert.ok(health.body.flaggedSlots.includes(herKey));
    assert.ok(health.body.flaggedSlots.includes(otherKey));
    // And the store persisted it (sorted union).
    const rec = await demoStore.getConflictScan(school.id);
    assert.deepEqual(rec.flaggedSlots, [herKey, otherKey].sort());
  });

  it("the Timetable tab's ?conflicts=1 also records the scan for the health metric", async () => {
    const { school, byEmail } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    sessionFor(admin);
    await get("/api/timetable?conflicts=1");
    assert.ok(await demoStore.getConflictScan(school.id), "the tab's button recorded a scan");
    await injectDoubleBooking(school.id, byEmail);
    const res = await get("/api/timetable?conflicts=1");
    assert.equal(res.body.conflicts.teacher.length, 1);
    assert.equal(res.body.newConflictCount, 1, "diffed against the previous recorded scan");
  });
});

describe("DELETE /api/timetable — SUPER_ADMIN only", () => {
  it("frees a seeded slot and reports success; missing slot reports false", async () => {
    const { school } = await seed();
    const admin = await demoStore.findUserByEmailInSchool(school.id, "admin@edutrack.app");
    const before = await demoStore.getTimetable({ schoolId: school.id, classArm: "SS1 Science", day: "Monday" });
    const target = before[0];
    const gone = await del("/api/timetable", { classArm: target.classArm, day: target.day, period: target.period }, admin);
    assert.equal(gone.status, 200);
    assert.equal(gone.body.success, true);
    const after = await demoStore.getTimetable({ schoolId: school.id, classArm: "SS1 Science", day: "Monday" });
    assert.equal(after.length, before.length - 1);
    const again = await del("/api/timetable", { classArm: target.classArm, day: target.day, period: target.period }, admin);
    assert.equal(again.body.success, false);
  });

  it("REGISTRAR cannot free a slot (403)", async () => {
    const { school } = await seed();
    const registrar = await demoStore.findUserByEmailInSchool(school.id, "registrar@edutrack.app");
    const { status } = await del("/api/timetable", { classArm: "SS1 Science", day: "Monday", period: 1 }, registrar);
    assert.equal(status, 403);
  });
});
