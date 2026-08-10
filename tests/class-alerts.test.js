/**
 * Class alerts & reminders — the "ring when it's time" layer on top of the
 * weekly timetable. This suite pins:
 *
 *   - the pure scheduling core (src/lib/class-alerts.js) with an injectable
 *     clock: which slots need an alarm NOW, the next-class ticker, and the
 *     once-per-occurrence flag pruning — all deterministic
 *   - the per-teacher alert-pref store round trip
 *   - GET/PUT /api/timetable/alerts (own prefs only, leadMinutes validated)
 *   - the School PATCH accepting the period-times bell schedule
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
import { DEFAULT_PERIOD_TIMES, getPeriodTimes } from "../src/lib/timetable.js";
import {
  findSlotsToAlert,
  minutesToLabel,
  nextUpClass,
  pruneExpiredAlerts,
  schoolDayOf,
  toMinutes,
} from "../src/lib/class-alerts.js";

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
const { GET, PUT } = await import("../src/app/api/timetable/alerts/route.js");
const { PATCH: schoolPATCH } = await import("../src/app/api/school/route.js");
if (hadMongoUri !== undefined) process.env.MONGODB_URI = hadMongoUri;

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-alert-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

// ---- Fixed clock for the pure core ------------------------------------------
// Aug 10 2026 is a Monday; Aug 8 2026 is a Saturday.
const MON = (h, m) => new Date(2026, 7, 10, h, m);
const SAT = (h, m) => new Date(2026, 7, 8, h, m);

const ENTRIES = [
  { id: "e1", day: "Monday", period: 2, subject: "Physics", classArm: "SS1 Science", teacherId: "t1" },
  { id: "e2", day: "Monday", period: 5, subject: "Mathematics", classArm: "SS2 Science", teacherId: "t1" },
  { id: "e3", day: "Tuesday", period: 1, subject: "Chemistry", classArm: "SS1 Science", teacherId: "t1" },
];

describe("time helpers", () => {
  it("toMinutes parses HH:MM and rejects garbage", () => {
    assert.equal(toMinutes("08:40"), 520);
    assert.equal(toMinutes("13:05"), 785);
    assert.equal(toMinutes("8:40"), null); // needs zero padding
    assert.equal(toMinutes("25:00"), null);
    assert.equal(toMinutes("08:75"), null);
    assert.equal(toMinutes("banana"), null);
    assert.equal(toMinutes(null), null);
  });

  it("minutesToLabel round-trips", () => {
    assert.equal(minutesToLabel(520), "08:40");
    assert.equal(minutesToLabel(785), "13:05");
  });

  it("schoolDayOf maps weekdays and rejects weekends", () => {
    assert.equal(schoolDayOf(MON(8, 0)), "Monday");
    assert.equal(schoolDayOf(new Date(2026, 7, 11, 8, 0)), "Tuesday");
    assert.equal(schoolDayOf(SAT(8, 0)), null);
    assert.equal(schoolDayOf(new Date(2026, 7, 9, 8, 0)), null); // Sunday
  });
});

describe("findSlotsToAlert — the ring window", () => {
  it("rings inside [start - lead, start + 15min)", () => {
    // Period 2 starts 08:40. With a 5-min lead the window is 08:35-08:55.
    const slots = findSlotsToAlert({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: MON(8, 42) });
    assert.equal(slots.length, 1);
    assert.equal(slots[0].period, 2);
    assert.equal(slots[0].startMinutes, 520);
  });

  it("does not ring before the lead window", () => {
    const slots = findSlotsToAlert({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: MON(8, 30) });
    assert.equal(slots.length, 0);
  });

  it("stops ringing 15 minutes after the period started", () => {
    assert.equal(findSlotsToAlert({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: MON(8, 56) }).length, 0);
  });

  it("leadMinutes 0 means ring at the exact start", () => {
    const atStart = findSlotsToAlert({
      entries: ENTRIES,
      periodTimes: DEFAULT_PERIOD_TIMES,
      now: MON(8, 40),
      leadMinutes: 0,
    });
    assert.equal(atStart.length, 1);
    const before = findSlotsToAlert({
      entries: ENTRIES,
      periodTimes: DEFAULT_PERIOD_TIMES,
      now: MON(8, 39),
      leadMinutes: 0,
    });
    assert.equal(before.length, 0);
  });

  it("never rings on a weekend or for another day's slot", () => {
    assert.equal(findSlotsToAlert({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: SAT(8, 42) }).length, 0);
    assert.equal(findSlotsToAlert({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: MON(9, 30) }).length, 0); // Tuesday slot, Monday now
  });

  it("rings once per occurrence — already-alerted keys are skipped", () => {
    const flagged = new Set(["2026-08-10|2"]);
    const slots = findSlotsToAlert({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: MON(8, 42), alreadyAlerted: flagged });
    assert.equal(slots.length, 0);
  });

  it("skips slots without a matching period time", () => {
    const weird = [{ id: "x", day: "Monday", period: 9, subject: "Club", classArm: "A", teacherId: "t1" }];
    assert.deepEqual(findSlotsToAlert({ entries: weird, periodTimes: DEFAULT_PERIOD_TIMES, now: MON(8, 42) }), []);
  });
});

describe("getPeriodTimes — the bell schedule, completed with defaults", () => {
  it("returns defaults when the school never saved a schedule", () => {
    assert.deepEqual(getPeriodTimes(null), DEFAULT_PERIOD_TIMES);
    assert.deepEqual(getPeriodTimes({}), DEFAULT_PERIOD_TIMES);
    assert.deepEqual(getPeriodTimes({ periodTimes: [] }), DEFAULT_PERIOD_TIMES);
  });

  it("uses the saved times when the full schedule is set", () => {
    const full = DEFAULT_PERIOD_TIMES.map((p, i) => ({
      period: p.period,
      start: `0${i}:00`,
      end: "23:59",
    }));
    const out = getPeriodTimes({ periodTimes: full });
    assert.equal(out.length, 8);
    assert.equal(out[0].start, "00:00");
  });

  it("merges a PARTIAL schedule over the defaults — a missing period keeps ringing", () => {
    // Admin moved only period 1 to 07:30; periods 2-8 must keep defaults.
    const partial = [{ period: 1, start: "07:30", end: "08:10" }];
    const out = getPeriodTimes({ periodTimes: partial });
    assert.equal(out.length, 8);
    assert.equal(out[0].start, "07:30");
    assert.equal(out[1].start, DEFAULT_PERIOD_TIMES[1].start);
    assert.equal(out[7].start, DEFAULT_PERIOD_TIMES[7].start);
  });

  it("drops malformed entries but keeps their period's default", () => {
    const mixed = [{ period: 2, start: "oops", end: "08:40" }, { period: 3 }];
    const out = getPeriodTimes({ periodTimes: mixed });
    assert.equal(out[1].start, DEFAULT_PERIOD_TIMES[1].start);
    assert.equal(out[2].start, DEFAULT_PERIOD_TIMES[2].start);
  });
});

describe("nextUpClass — the ticker", () => {
  it("reports an in-progress class first (negative startsInMin)", () => {
    const next = nextUpClass({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: MON(8, 42) });
    assert.equal(next.period, 2);
    assert.equal(next.startsInMin, -2);
  });

  it("reports the next upcoming class once the current one ends", () => {
    const next = nextUpClass({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: MON(9, 30) });
    assert.equal(next.period, 5);
    assert.equal(next.startsInMin, 90); // 11:00 - 09:30
  });

  it("returns null when the day is over or it's the weekend", () => {
    assert.equal(nextUpClass({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: MON(13, 30) }), null);
    assert.equal(nextUpClass({ entries: ENTRIES, periodTimes: DEFAULT_PERIOD_TIMES, now: SAT(10, 0) }), null);
  });
});

describe("pruneExpiredAlerts — one ring per occurrence", () => {
  it("drops expired keys and keys from previous days", () => {
    const flagged = new Set(["2026-08-10|2", "2026-08-07|2"]);
    pruneExpiredAlerts({ periodTimes: DEFAULT_PERIOD_TIMES, now: MON(9, 0), alreadyAlerted: flagged });
    assert.equal(flagged.size, 0);
  });

  it("keeps a key whose window is still open", () => {
    const flagged = new Set(["2026-08-10|2"]);
    pruneExpiredAlerts({ periodTimes: DEFAULT_PERIOD_TIMES, now: MON(8, 40), alreadyAlerted: flagged });
    assert.equal(flagged.size, 1); // still inside the 15-min grace
  });

  it("drops today's key when its period has no bell time (can never ring again)", () => {
    const flagged = new Set(["2026-08-10|9"]); // period 9 has no schedule entry
    pruneExpiredAlerts({ periodTimes: DEFAULT_PERIOD_TIMES, now: MON(8, 40), alreadyAlerted: flagged });
    assert.equal(flagged.size, 0);
  });
});

describe("class alert prefs — store round trip", () => {
  it("defaults to off, 5-min lead, sound on; persists changes; clamps bad values", async () => {
    const [school] = await demoStore.searchSchools("Greenfield");
    const teacher = (await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" }))[0];

    const defaults = await demoStore.getClassAlertPref(school.id, teacher.id);
    assert.deepEqual(
      { enabled: defaults.enabled, leadMinutes: defaults.leadMinutes, soundOn: defaults.soundOn },
      { enabled: false, leadMinutes: 5, soundOn: true }
    );

    const updated = await demoStore.setClassAlertPref(school.id, teacher.id, { enabled: true, leadMinutes: 15, soundOn: false });
    assert.deepEqual(
      { enabled: updated.enabled, leadMinutes: updated.leadMinutes, soundOn: updated.soundOn },
      { enabled: true, leadMinutes: 15, soundOn: false }
    );

    // An unsupported lead time is ignored (stays at the previous value).
    const bad = await demoStore.setClassAlertPref(school.id, teacher.id, { leadMinutes: 12 });
    assert.equal(bad.leadMinutes, 15);

    const reread = await demoStore.getClassAlertPref(school.id, teacher.id);
    assert.equal(reread.enabled, true);
    assert.equal(reread.leadMinutes, 15);

    // Another user is untouched.
    const other = (await demoStore.listUsers({ schoolId: school.id, role: "TEACHER" }))[1];
    const otherPref = await demoStore.getClassAlertPref(school.id, other.id);
    assert.equal(otherPref.enabled, false);
  });
});

describe("GET/PUT /api/timetable/alerts", () => {
  async function seededUser(role) {
    const [match] = await demoStore.searchSchools("Greenfield");
    const [user] = await demoStore.listUsers({ schoolId: match.id, role });
    return user;
  }

  function sessionFor(user) {
    __setSessionToken(signToken({ userId: user.id, role: user.role, schoolId: user.schoolId }));
  }

  function http(method, body) {
    return new Request("http://localhost/api/timetable/alerts", {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it("GET returns the defaults for a teacher who never set prefs", async () => {
    const teacher = await seededUser("TEACHER");
    sessionFor(teacher);
    const res = await GET();
    assert.equal(res.status, 200);
    const { prefs } = await res.json();
    assert.deepEqual(
      { enabled: prefs.enabled, leadMinutes: prefs.leadMinutes, soundOn: prefs.soundOn },
      { enabled: false, leadMinutes: 5, soundOn: true }
    );
  });

  it("PUT persists a subset of prefs and GET returns them; other users are isolated", async () => {
    const teacherA = await seededUser("TEACHER");
    const teacherB = (await demoStore.listUsers({ schoolId: teacherA.schoolId, role: "TEACHER" }))[1];
    sessionFor(teacherA);
    const put = await PUT(http("PUT", { enabled: true, leadMinutes: 10 }));
    assert.equal(put.status, 200);
    const after = await (await GET()).json();
    assert.equal(after.prefs.enabled, true);
    assert.equal(after.prefs.leadMinutes, 10);

    sessionFor(teacherB);
    const other = await (await GET()).json();
    assert.equal(other.prefs.enabled, false, "teacher B's prefs are untouched");
  });

  it("PUT validates leadMinutes and coerces booleans", async () => {
    const teacher = await seededUser("TEACHER");
    sessionFor(teacher);
    const bad = await PUT(http("PUT", { leadMinutes: 7 }));
    assert.equal(bad.status, 400);
    const bad2 = await PUT(http("PUT", { leadMinutes: "soon" }));
    assert.equal(bad2.status, 400);
    const ok = await PUT(http("PUT", { leadMinutes: "15", enabled: "true", soundOn: 0 }));
    assert.equal(ok.status, 200);
    const { prefs } = await (await GET()).json();
    assert.equal(prefs.leadMinutes, 15);
    assert.equal(prefs.enabled, true, "\"true\" coerces to boolean true");
    assert.equal(prefs.soundOn, false, "0 coerces to boolean false");
  });

  it("requires authentication", async () => {
    const res = await GET();
    assert.equal(res.status, 401);
  });
});

describe("School PATCH — period times (the bell schedule)", () => {
  async function seededUser(role) {
    const [match] = await demoStore.searchSchools("Greenfield");
    const [user] = await demoStore.listUsers({ schoolId: match.id, role });
    return user;
  }

  function sessionFor(user) {
    __setSessionToken(signToken({ userId: user.id, role: user.role, schoolId: user.schoolId }));
  }

  async function patchSchool(body, actor) {
    sessionFor(actor);
    const res = await schoolPATCH(
      new Request("http://localhost/api/school", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("SUPER_ADMIN can set the bell schedule; it round-trips", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const schedule = [
      { period: 1, start: "07:45", end: "08:25" },
      { period: 2, start: "08:25", end: "09:05" },
      { period: 3, start: "09:05", end: "09:45" },
      { period: 4, start: "09:45", end: "10:25" },
      { period: 5, start: "10:45", end: "11:25" },
      { period: 6, start: "11:25", end: "12:05" },
      { period: 7, start: "12:05", end: "12:45" },
      { period: 8, start: "12:45", end: "13:25" },
    ];
    const { status, body } = await patchSchool({ periodTimes: schedule }, admin);
    assert.equal(status, 200);
    assert.deepEqual(body.school.periodTimes, schedule);
  });

  it("rejects malformed schedules", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const badTime = await patchSchool({ periodTimes: [{ period: 1, start: "08:00", end: "oops" }] }, admin);
    assert.equal(badTime.status, 400);
    const badPeriod = await patchSchool({ periodTimes: [{ period: 9, start: "08:00", end: "08:40" }] }, admin);
    assert.equal(badPeriod.status, 400);
    const notArray = await patchSchool({ periodTimes: "08:00" }, admin);
    assert.equal(notArray.status, 400);
  });

  it("SUPER_ADMIN can set the mid-day break window; it round-trips", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const { status, body } = await patchSchool(
      { breakTimes: { start: "11:00", end: "11:20" } },
      admin
    );
    assert.equal(status, 200);
    assert.deepEqual(body.school.breakTimes, { start: "11:00", end: "11:20" });
    // And it actually persisted to the store.
    const [school] = await demoStore.searchSchools("Greenfield");
    assert.deepEqual((await demoStore.getSchoolById(school.id)).breakTimes, {
      start: "11:00",
      end: "11:20",
    });
  });

  it("rejects a malformed break window (bad HH:MM)", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const bad = await patchSchool({ breakTimes: { start: "oops", end: "11:00" } }, admin);
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /HH:MM/);
  });

  it("accepts a per-weekday bell override — a Friday that ends at period 6 round-trips", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const friday = {
      periodTimes: [
        { period: 1, start: "08:00", end: "08:40" },
        { period: 2, start: "08:40", end: "09:20" },
        { period: 3, start: "09:20", end: "10:00" },
        { period: 4, start: "10:00", end: "10:40" },
        { period: 5, start: "11:00", end: "11:40" },
        { period: 6, start: "11:40", end: "12:20" },
      ],
      breakTimes: { start: "11:15", end: "11:35" },
    };
    const { status, body } = await patchSchool({ dailySchedules: { Friday: friday } }, admin);
    assert.equal(status, 200);
    assert.deepEqual(body.school.dailySchedules.Friday, friday);
    // And it persisted, resolving through the day-aware helpers.
    const [school] = await demoStore.searchSchools("Greenfield");
    const stored = await demoStore.getSchoolById(school.id);
    assert.equal(getPeriodTimes(stored, "Friday").length, 6);
    assert.equal(getPeriodTimes(stored, "Monday").length, 8, "other days keep the full week");
  });

  it("rejects malformed dailySchedules: bad day key, gaps, empty, bad times, non-object", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    const friday6 = [
      { period: 1, start: "08:00", end: "08:40" },
      { period: 2, start: "08:40", end: "09:20" },
      { period: 3, start: "09:20", end: "10:00" },
      { period: 4, start: "10:00", end: "10:40" },
      { period: 5, start: "11:00", end: "11:40" },
      { period: 6, start: "11:40", end: "12:20" },
    ];
    const badDay = await patchSchool({ dailySchedules: { Saturnday: { periodTimes: friday6 } } }, admin);
    assert.equal(badDay.status, 400);
    assert.match(badDay.body.error, /not a school day/);
    const gap = await patchSchool(
      { dailySchedules: { Friday: { periodTimes: friday6.slice(0, 5).concat([{ period: 8, start: "13:00", end: "13:40" }]) } } },
      admin
    );
    assert.equal(gap.status, 400);
    assert.match(gap.body.error, /contiguous/);
    const empty = await patchSchool({ dailySchedules: { Friday: { periodTimes: [] } } }, admin);
    assert.equal(empty.status, 400);
    const badTime = await patchSchool(
      { dailySchedules: { Friday: { periodTimes: [{ period: 1, start: "08:00", end: "oops" }] } } },
      admin
    );
    assert.equal(badTime.status, 400);
    const notObj = await patchSchool({ dailySchedules: "Friday" }, admin);
    assert.equal(notObj.status, 400);
    const badBreak = await patchSchool(
      { dailySchedules: { Friday: { breakTimes: { start: "nope", end: "11:35" } } } },
      admin
    );
    assert.equal(badBreak.status, 400);
  });

  it("a null dailySchedules entry clears the day's override", async () => {
    const admin = await seededUser("SUPER_ADMIN");
    await patchSchool(
      { dailySchedules: { Friday: { periodTimes: [{ period: 1, start: "08:00", end: "08:40" }] } } },
      admin
    );
    const [school] = await demoStore.searchSchools("Greenfield");
    assert.ok((await demoStore.getSchoolById(school.id)).dailySchedules?.Friday);
    const cleared = await patchSchool({ dailySchedules: { Friday: null } }, admin);
    assert.equal(cleared.status, 200);
    const after = await demoStore.getSchoolById(school.id);
    assert.equal(after.dailySchedules?.Friday, undefined, "the override is gone — Friday falls back");
    assert.equal(getPeriodTimes(after, "Friday").length, 8);
  });

  it("BURSAR cannot touch the bell schedule (school.edit is SUPER_ADMIN-only)", async () => {
    const bursar = await seededUser("BURSAR");
    const { status } = await patchSchool({ periodTimes: [{ period: 1, start: "08:00", end: "08:40" }] }, bursar);
    assert.equal(status, 403);
  });
});

describe("class alerts respect a short Friday (periods 1-6, no 7/8)", () => {
  // A Friday that ends at period 6 — the dropped periods have NO bell, so
  // they can never ring, appear in the next-class ticker, or keep flags.
  const shortFridayTimes = DEFAULT_PERIOD_TIMES.slice(0, 6).map((p) => ({ ...p }));
  const entries = [
    { id: "e6", day: "Friday", period: 6, subject: "Mathematics" },
    { id: "e7", day: "Friday", period: 7, subject: "English Language" },
  ];
  // 2026-08-14 is a Friday (local time).
  const fridayAt = (hh, mm) => new Date(2026, 7, 14, hh, mm);

  it("findSlotsToAlert never rings a dropped period, even inside its default window", () => {
    assert.equal(schoolDayOf(fridayAt(12, 20)), "Friday");
    const now = fridayAt(12, 20); // inside P7's window under the FULL schedule
    const short = findSlotsToAlert({
      entries,
      periodTimes: shortFridayTimes,
      now,
      leadMinutes: 5,
      alreadyAlerted: new Set(),
    });
    assert.equal(short.length, 0, "no P7 bell on Friday → nothing rings (P6 window closed)");
    // Sanity: with the full 8-period schedule the P7 entry WOULD ring now.
    const full = findSlotsToAlert({
      entries,
      periodTimes: DEFAULT_PERIOD_TIMES,
      now,
      leadMinutes: 5,
      alreadyAlerted: new Set(),
    });
    assert.equal(full.length, 1);
    assert.equal(full[0].period, 7);
  });

  it("nextUpClass treats a dropped period as the end of the day", () => {
    const late = fridayAt(12, 25); // P6 finished, P7 would be next under the full schedule
    const short = nextUpClass({ entries, periodTimes: shortFridayTimes, now: late });
    assert.equal(short, null, "the short Friday is over at 12:25");
    const full = nextUpClass({ entries, periodTimes: DEFAULT_PERIOD_TIMES, now: late });
    assert.equal(full.period, 7, "under the full schedule P7 is next");
    // And in-progress P6 IS the next class on a short Friday.
    const mid = nextUpClass({ entries, periodTimes: shortFridayTimes, now: fridayAt(11, 50) });
    assert.equal(mid.period, 6);
  });

  it("pruneExpiredAlerts drops a flagged key for a period with no bell today", () => {
    const flagged = new Set(["2026-08-14|7"]);
    pruneExpiredAlerts({ periodTimes: shortFridayTimes, now: fridayAt(12, 20), alreadyAlerted: flagged });
    assert.equal(flagged.size, 0, "a flag for a period that can never ring is pruned");
  });
});
