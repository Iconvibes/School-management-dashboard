/**
 * Timetable domain constants — the school week shape both stores, the API
 * route and the dashboards share. Pure data with NO imports, so it can be
 * used server-side (route validation, demo seed) and client-side (grid
 * rendering) without pulling Next.js server bits in.
 */

/** Days of the school week, in display order. */
export const DAYS = Object.freeze([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
]);

/** Period slots in a school day (1-based). */
export const PERIODS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

export const MAX_PERIOD = PERIODS.length;

/** True for a valid school day name. */
export function isSchoolDay(day) {
  return DAYS.includes(day);
}

/**
 * "Monday".."Friday" for a Date, or null on weekends. The single source of
 * truth for "which school day is today" — the class-alert scheduler and the
 * teacher/student timetable grids both use it so the math can never drift.
 */
export function schoolDayOf(date) {
  const di = (date.getDay() + 6) % 7;
  return di < DAYS.length ? DAYS[di] : null;
}

/** True for an integer period in [1, MAX_PERIOD] (accepts numeric strings). */
export function isPeriod(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PERIOD;
}

/**
 * The school-wide mid-day break. Nigerian schools run morning lessons, a
 * break, then afternoon lessons — the break sits between period 4 and
 * period 5 (position "5" of the day). It is NOT a timetable entry: no
 * teacher or subject is assigned to it, so the class-alert scheduler never
 * rings during it (alerts only read teaching-period bells via
 * getPeriodTimes). Default times match the gap already in
 * DEFAULT_PERIOD_TIMES (period 4 ends 10:40, period 5 starts 11:00) — this
 * just makes the previously-implicit break explicit and editable.
 */
export const DEFAULT_BREAK_TIME = Object.freeze({
  start: "10:40",
  end: "11:00",
});

/**
 * The school's break window, or the default. `breakTimes` is optional on the
 * school doc ({ start, end } "HH:MM") — a missing or malformed value keeps
 * the standard 10:40-11:00 break. Passing a `day` resolves that weekday's
 * per-day override first (see `dailySchedules`), falling back to the
 * school-wide value.
 * @param {Object} [school]
 * @param {string} [day]  a weekday name from DAYS — resolves that day's
 *   override; omit for the school-wide schedule
 * @returns {{start:string, end:string}}
 */
export function getBreakTime(school, day) {
  const b =
    (day && school?.dailySchedules?.[day]?.breakTimes) || school?.breakTimes;
  const valid = (t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t);
  if (b && valid(b.start) && valid(b.end)) {
    return { start: b.start, end: b.end };
  }
  return { ...DEFAULT_BREAK_TIME };
}

/**
 * The full school day in display order: teaching periods, the mid-day break
 * between periods 4 and 5, then the afternoon periods. Each block is
 * { period, start, end, type: "teaching" | "break" } — grids iterate this
 * instead of bare PERIODS so the timetable shows the realistic Nigerian
 * school day (times on every row, a break band between morning and afternoon
 * lessons) rather than bare period numbers.
 *
 * Passing a `day` resolves THAT weekday's bell schedule (see
 * `dailySchedules`), so a short day like Friday-ending-at-period-6 renders
 * its own timeline; omit `day` for the school-wide schedule.
 * @param {Object} [school]  may carry periodTimes / breakTimes / dailySchedules
 * @param {string} [day]     a weekday name from DAYS
 * @returns {Array<{period:number|string,start:string,end:string,type:string}>}
 */
export function getDayTimeline(school, day) {
  const times = getPeriodTimes(school, day);
  const breakTime = getBreakTime(school, day);
  const timeline = [];
  for (const pt of times) {
    if (Number(pt.period) === 5) {
      timeline.push({ period: "break", ...breakTime, type: "break" });
    }
    timeline.push({ ...pt, type: "teaching" });
  }
  return timeline;
}

/**
 * Resolve ONE weekday's full bell schedule: which periods run, their times,
 * and the break — with every piece falling back to the school-wide value and
 * then to the defaults. `overridden` is true when the day has ANY per-day
 * override (period times or break) on the school doc.
 * @param {Object} [school]
 * @param {string} day  a weekday name from DAYS
 * @returns {{periodTimes:Array, breakTimes:{start:string,end:string}, overridden:boolean}}
 */
export function getDaySchedule(school, day) {
  const override = school?.dailySchedules?.[day];
  return {
    periodTimes: getPeriodTimes(school, day),
    breakTimes: getBreakTime(school, day),
    overridden: Boolean(
      override &&
        (override.periodTimes !== undefined || override.breakTimes !== undefined)
    ),
  };
}

/** True when a day-timeline block (or period number) is the break. */
export function isBreakBlock(block) {
  return block?.type === "break" || block?.period === "break";
}

/**
 * The default school day: 8 periods of 40 minutes with a 20-minute break
 * before period 5. A school can override these (School.periodTimes — edited
 * in the admin Timetable tab); the class-alert scheduler uses whichever the
 * school has set to know when a period actually starts.
 */
export const DEFAULT_PERIOD_TIMES = Object.freeze([
  { period: 1, start: "08:00", end: "08:40" },
  { period: 2, start: "08:40", end: "09:20" },
  { period: 3, start: "09:20", end: "10:00" },
  { period: 4, start: "10:00", end: "10:40" },
  { period: 5, start: "11:00", end: "11:40" },
  { period: 6, start: "11:40", end: "12:20" },
  { period: 7, start: "12:20", end: "13:00" },
  { period: 8, start: "13:00", end: "13:40" },
]);

/**
 * The school's period schedule, or the defaults when none is configured.
 * Passing a `day` resolves that weekday's per-day override first (see
 * `dailySchedules` — e.g. a Friday that ends at period 6), falling back to
 * the school-wide `periodTimes` and then to DEFAULT_PERIOD_TIMES.
 * @param {Object} [school]  school doc (may carry `periodTimes` / `dailySchedules`)
 * @param {string} [day]     a weekday name from DAYS; omit for school-wide
 * @returns {Array<{period:number,start:string,end:string}>}
 */
/**
 * Scan a school's timetable entries for collisions, including pre-existing
 * data (legacy imports, manual edits, anything already in the store). Pure
 * data processing with NO imports, so the admin dashboard can run the same
 * logic the API does.
 *
 * Two kinds of conflict are reported:
 *   - teacherConflicts: the SAME teacher is booked in ≥2 different class
 *     arms at the same day + period (they physically cannot be in two
 *     classes at once).
 *   - armConflicts:     the SAME class arm holds ≥2 entries at the same
 *     day + period (normally impossible — the upsert keeps one slot per
 *     period — but legacy/duplicated data can slip in).
 *
 * @param {Array<{id:string,classArm:string,day:string,period:number,teacherId:string,subject:string,teacherName?:string}>} entries
 * @returns {{ teacher: Array<{teacherId:string,teacherName?:string,day:string,period:number,slots:Array}>,
 *             arm: Array<{classArm:string,day:string,period:number,slots:Array}> }}
 */
export function findTimetableConflicts(entries) {
  const byTeacherKey = new Map(); // `${teacherId}|${day}|${period}` -> slots
  const byArmKey = new Map(); // `${classArm}|${day}|${period}` -> slots

  for (const e of entries) {
    if (!e || e.teacherId === undefined || e.teacherId === null || e.teacherId === "") continue;
    const tKey = `${e.teacherId}|${e.day}|${e.period}`;
    if (!byTeacherKey.has(tKey)) byTeacherKey.set(tKey, []);
    byTeacherKey.get(tKey).push(e);

    const aKey = `${e.classArm}|${e.day}|${e.period}`;
    if (!byArmKey.has(aKey)) byArmKey.set(aKey, []);
    byArmKey.get(aKey).push(e);
  }

  const dayOrder = Object.fromEntries(DAYS.map((d, i) => [d, i]));
  const byDay = (a, b) => (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99) || a.period - b.period;

  const teacher = [];
  for (const [key, slots] of byTeacherKey) {
    if (slots.length < 2) continue;
    const [teacherId, day, period] = key.split("|");
    teacher.push({
      teacherId,
      teacherName: slots[0].teacherName || undefined,
      day,
      period: Number(period),
      slots: [...slots],
    });
  }
  teacher.sort(
    (a, b) =>
      byDay(a, b) || (a.teacherName || a.teacherId).localeCompare(b.teacherName || b.teacherId)
  );

  const arm = [];
  for (const [key, slots] of byArmKey) {
    if (slots.length < 2) continue;
    const [classArm, day, period] = key.split("|");
    arm.push({ classArm, day, period: Number(period), slots: [...slots] });
  }
  arm.sort(byDay);

  return { teacher, arm };
}

/**
 * A stable identity for one conflict (teacher or arm), so consecutive scans
 * can be diffed: "what's NEW since the last scan?". The slot list is sorted
 * before hashing so the key never changes just because entry order shifted.
 * @param {Object} c  a conflict from findTimetableConflicts()
 * @returns {string}  e.g. "t|usr_5|Monday|7|JSS1 Arts~JSS1 Science"
 */
export function conflictKey(c) {
  if (!c) return "";
  // Scope violations are keyed by the entry itself — a stable per-slot id.
  if (c.problems !== undefined || c.type === "scope") {
    return `s|${c.entryId || `${c.teacherId}|${c.day}|${c.period}|${c.classArm}|${c.subject}`}`;
  }
  if (c.teacherId !== undefined) {
    const arms = (c.slots || []).map((s) => s.classArm).sort().join("~");
    return `t|${c.teacherId}|${c.day}|${c.period}|${arms}`;
  }
  const teachers = (c.slots || []).map((s) => s.teacherId).sort().join("~");
  return `a|${c.classArm}|${c.day}|${c.period}|${teachers}`;
}

/**
 * The subset of the current scan that did NOT exist in the previous scan —
 * the "new collisions" a daily health check should flag. O(n) over the
 * (small) conflict lists; pure for unit tests.
 * @param {Set<string>} prevKeys   conflictKey()s recorded at the last scan
 * @param {Array} conflicts        teacher OR arm conflicts from this scan
 * @returns {Array}                the conflicts that are new since last scan
 */
export function newConflictsSince(prevKeys, conflicts) {
  return (conflicts || []).filter((c) => !(prevKeys instanceof Set && prevKeys.has(conflictKey(c))));
}

/**
 * Every slot key (`classArm|day|period`) touched by a scan's conflicts — the
 * union of every arm a double-booked teacher occupies, every duplicated arm
 * slot, and every scope-violating entry. This is the persisted "flagged
 * history": once a slot appears here it stays flagged across clean re-scans,
 * so a resolved conflict can never be silently reintroduced.
 * @param {{teacher?:Array, arm?:Array, scope?:Array}} conflicts
 * @returns {Set<string>}
 */
export function conflictSlotKeys(conflicts) {
  const keys = new Set();
  for (const t of conflicts?.teacher || []) {
    for (const s of t.slots || []) keys.add(`${s.classArm}|${t.day}|${t.period}`);
  }
  for (const a of conflicts?.arm || []) {
    keys.add(`${a.classArm}|${a.day}|${a.period}`);
  }
  for (const s of conflicts?.scope || []) {
    keys.add(`${s.classArm}|${s.day}|${s.period}`);
  }
  return keys;
}

/**
 * Human-readable reasons a specific slot is part of the CURRENT scan's
 * conflicts — the "live" half of the reassignment warning. Empty when the
 * slot only appears in the persisted history (resolved) rather than live.
 * @param {Object}  conflicts  a scan's { teacher, arm, scope }
 * @param {string}  classArm
 * @param {string}  day
 * @param {number|string} period
 * @returns {Array<string>}
 */
export function slotConflictReasons(conflicts, classArm, day, period) {
  const reasons = [];
  for (const t of conflicts?.teacher || []) {
    if (t.day !== day || Number(t.period) !== Number(period)) continue;
    const arms = (t.slots || []).filter((s) => s.classArm === classArm);
    if (!arms.length) continue;
    const others = (t.slots || [])
      .filter((s) => s.classArm !== classArm)
      .map((s) => s.classArm);
    reasons.push(
      `${t.teacherName || "The assigned teacher"} is double-booked on ${day}, period ${period}${others.length ? ` — also in ${others.join(", ")}` : ""}`
    );
  }
  for (const s of conflicts?.scope || []) {
    if (s.classArm !== classArm || s.day !== day || Number(s.period) !== Number(period)) continue;
    const bits = (s.problems || []).map((p) => (p === "teacher" ? "not in the roster" : p === "subject" ? "doesn't teach the subject" : "not assigned to this arm"));
    reasons.push(`${s.teacherName || "The assigned teacher"} ${bits.join(" and ") || "is out of scope"}`);
  }
  for (const a of conflicts?.arm || []) {
    if (a.classArm !== classArm || a.day !== day || Number(a.period) !== Number(period)) continue;
    reasons.push(`This arm holds ${(a.slots || []).length} entries at ${day}, period ${period} — duplicate slots`);
  }
  return reasons;
}

/**
 * Scope violations — timetable entries whose assigned teacher does not teach
 * the subject, is not assigned to the arm, or no longer exists in the roster.
 * The assignment API refuses all of these on write, so they only appear in
 * pre-existing data (legacy imports, manual data surgery, a roster edit that
 * outlived the schedule). Empty subjects/assignedClasses mean "unrestricted"
 * (legacy parity with the assign API), so a scoped teacher with data is
 * checked, an unscoped one is not.
 *
 * @param {Array} entries        timetable entries (teacherName optional)
 * @param {Object} teachersById  map id -> { name, subjects, assignedClasses }
 * @returns {Array<{type:"scope", entryId, teacherId, teacherName, subject,
 *                   classArm, day, period, problems: string[]}>}
 *          problems ⊆ ["teacher" (not in roster), "subject", "arm"]
 */
export function findScopeViolations(entries, teachersById = {}) {
  const dayOrder = Object.fromEntries(DAYS.map((d, i) => [d, i]));
  const violations = [];
  for (const e of entries) {
    if (!e || e.teacherId === undefined || e.teacherId === null || e.teacherId === "") continue;
    const teacher = teachersById[e.teacherId];
    const problems = [];
    if (!teacher) {
      problems.push("teacher");
    } else {
      const subjects = Array.isArray(teacher.subjects) ? teacher.subjects : [];
      const arms = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : [];
      if (subjects.length && !subjects.includes(e.subject)) problems.push("subject");
      if (arms.length && !arms.includes(e.classArm)) problems.push("arm");
    }
    if (!problems.length) continue;
    violations.push({
      type: "scope",
      entryId: e.id,
      teacherId: e.teacherId,
      teacherName: e.teacherName || teacher?.name,
      subject: e.subject,
      classArm: e.classArm,
      day: e.day,
      period: Number(e.period),
      problems,
    });
  }
  violations.sort(
    (a, b) => (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99) || a.period - b.period
  );
  return violations;
}

/**
 * "Unassigned periods" integrity check: an arm × school-day with ZERO
 * scheduled classes. Individual empty periods are NOT flagged — arms are not
 * expected to fill every period of the day (the König coloring legitimately
 * spreads an arm's slots across the week), so the bounded, meaningful case is
 * a whole day with nothing at all (a deleted day's worth of entries, an arm
 * added to the roster but never scheduled, a day accidentally cleared).
 *
 * @param {Array<Object>} entries resolved timetable entries
 * @param {string[]} arms the school's activeArms
 * @param {string[]} [days] school days to check (default DAYS)
 * @returns {Array<{classArm, day}>} sorted by arm, then day order
 */
export function findUnassignedPeriods(entries = [], arms = [], days = DAYS) {
  const dayOrder = Object.fromEntries(DAYS.map((d, i) => [d, i]));
  const byArmDay = new Set();
  for (const e of entries) byArmDay.add(`${e.classArm}|${e.day}`);
  const out = [];
  for (const arm of arms) {
    for (const day of days) {
      if (!byArmDay.has(`${arm}|${day}`)) out.push({ classArm: arm, day });
    }
  }
  out.sort(
    (a, b) => a.classArm.localeCompare(b.classArm) || (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99)
  );
  return out;
}

/**
 * "Unstaffed teachers" integrity check: roster teachers with ZERO timetable
 * slots anywhere. A teacher on the payroll who is never scheduled is either
 * newly hired and forgotten, or was un-assigned and the roster wasn't cleaned.
 *
 * @param {Array<Object>} entries resolved timetable entries
 * @param {Array<{id, name}>} teachers the school's TEACHER users
 * @returns {Array<{teacherId, teacherName}>} in roster order
 */
export function findUnstaffedTeachers(entries = [], teachers = []) {
  const scheduled = new Set(entries.map((e) => e.teacherId));
  return teachers
    .filter((t) => !scheduled.has(t.id))
    .map((t) => ({ teacherId: t.id, teacherName: t.name }));
}

/**
 * "Orphaned entries" integrity check: timetable slots pointing at an arm the
 * school no longer has in activeArms (deactivated or renamed — the entries
 * were left behind). Entries whose TEACHER is missing are NOT duplicated
 * here: they are already surfaced as scope violations ("no longer in the
 * staff list"), so each defect is counted exactly once.
 *
 * @param {Array<Object>} entries resolved timetable entries (with teacherName)
 * @param {string[]} activeArms the school's activeArms
 * @returns {Array<{entryId, classArm, day, period, subject, teacherId, teacherName}>}
 */
export function findOrphanedEntries(entries = [], activeArms = []) {
  const active = new Set(activeArms);
  return entries
    .filter((e) => e && e.teacherId !== undefined && !active.has(e.classArm))
    .map((e) => ({
      entryId: e.id,
      classArm: e.classArm,
      day: e.day,
      period: Number(e.period),
      subject: e.subject,
      teacherId: e.teacherId,
      teacherName: e.teacherName,
    }));
}

/**
 * Valid teachers to swap into a scope-violating slot: anyone who — matching
 * the assign API's EXACT semantics — teaches the subject (or is unscoped),
 * is assigned to the arm (or is unscoped), and is not already booked at that
 * day + period in ANY arm (no double-booking). The violating teacher can never
 * qualify (they fail the subject/arm check or are absent from the roster).
 *
 * @param {Object}  o
 * @param {Array}   o.entries        all of the school's timetable entries
 * @param {Object}  o.teachersById   map id -> { name, subjects, assignedClasses }
 * @param {string}  o.subject        the slot's subject (kept after the swap)
 * @param {string}  o.classArm       the slot's arm (kept after the swap)
 * @param {string}  o.day
 * @param {number}  o.period
 * @returns {Array<{id:string,name:string}>} sorted by name
 */
export function validSubstitutes({ entries = [], teachersById = {}, subject, classArm, day, period }) {
  const periodNum = Number(period);
  const busy = new Set();
  for (const e of entries) {
    if (e && e.day === day && Number(e.period) === periodNum && e.teacherId) {
      busy.add(e.teacherId);
    }
  }
  return Object.values(teachersById)
    .filter((t) => {
      if (busy.has(t.id)) return false;
      const subjects = Array.isArray(t.subjects) ? t.subjects : [];
      const arms = Array.isArray(t.assignedClasses) ? t.assignedClasses : [];
      if (subjects.length && !subjects.includes(subject)) return false;
      if (arms.length && !arms.includes(classArm)) return false;
      return true;
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((t) => ({ id: t.id, name: t.name }));
}

/**
 * The school's bell schedule, completed against the defaults: a school that
 * saved only SOME periods (partial or legacy data) keeps the default times
 * for the rest — a missing period must never silently disable its alarms.
 */
export function getPeriodTimes(school, day) {
  const dayOverride = day ? school?.dailySchedules?.[day]?.periodTimes : undefined;
  const saved = dayOverride || school?.periodTimes;
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_PERIOD_TIMES;
  const validTime = (t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t);
  const clean = saved
    .filter((p) => p && p.period !== undefined && validTime(p.start) && validTime(p.end))
    .map((p) => ({ period: Number(p.period), start: p.start, end: p.end }))
    .sort((a, b) => a.period - b.period);
  // A per-day override IS that day's schedule (e.g. a Friday that ends at
  // period 6) — return exactly what the school configured, in period order.
  // Padding it back to 8 would silently resurrect the periods the school
  // deliberately removed.
  if (dayOverride) return clean;
  // School-wide: partial/legacy data keeps the default times for the rest —
  // a missing period must never silently disable its alarms.
  const byPeriod = Object.fromEntries(clean.map((p) => [p.period, p]));
  return DEFAULT_PERIOD_TIMES.map((d) => byPeriod[Number(d.period)] || d);
}
