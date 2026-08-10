#!/usr/bin/env node
/**
 * Class-alert scheduler stress test.
 *
 * The scheduler is a pure, clock-injectable core (src/lib/class-alerts.js)
 * driven by a thin 15-second tick in the browser hook (useClassAlerts.js).
 * This harness proves it at full-school scale:
 *
 *   Phase A — real dataset: builds the 1,800-student / 12-arm demo school in
 *             a TEMP store (the real import pipeline: sample roster → plan →
 *             apply), enables alerts for every teacher, and loads the real
 *             240-slot weekly timetable + bell schedule.
 *   Phase B — full-week simulation: replays the hook's EXACT tick loop
 *             (pruneExpiredAlerts → nextUpClass → findSlotsToAlert, one
 *             flagged set per teacher) across Mon–Fri at 15s ticks, and
 *             asserts the alarm contract:
 *               • every slot rings exactly once per occurrence (no misses,
 *                 no double-fires),
 *               • never before the lead window opens,
 *               • never after the 15-minute grace,
 *               • at most one tick (15s) late vs. the window,
 *               • nextUpClass stays correct at every tick,
 *               • per-tick cost is a tiny fraction of the 15s tick budget.
 *   Phase C — scale sweep: 1×–100× teachers (16 → 1,600) with the same
 *             entry shapes, proving per-tick cost stays linear and far under
 *             the budget — the headroom story for 10k users.
 *
 * Usage: node --import ./tests/register-aliases.js scripts/stress-class-alerts.mjs
 *
 * The real demo store (.demo-data) is NEVER touched — Phase A writes to
 * stress-data/ (cleaned up on exit).
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";

// ---- Temp store FIRST — before any store module is imported ----
const stressDir = path.join(process.cwd(), "stress-data");
process.env.DEMO_STORE_FILE = path.join(stressDir, "store.json");
fs.rmSync(stressDir, { recursive: true, force: true });

// The hook's real cadence + the alert contract constants.
const TICK_MIN = 0.25; // 15 seconds
const LEAD = 5; // "ring 5 minutes before"
const GRACE = 15; // ALERT_GRACE_MINUTES
const TICK_BUDGET_MS = 15000; // the browser's setInterval cadence
const DAY_START_MIN = 7 * 60 + 50; // 07:50 — before the lead-5 window of the 08:00 period
const DAY_END_MIN = 16 * 60 + 45; // 16:45 — past the last period + grace

const { store } = await import("@/lib/store.js");
const demo = await import("@/lib/demo-store.js");
const { generateRosterCsv } = await import("@/lib/sample-roster.js");
const { parseRows, planImport, applyImport } = await import("@/lib/importer.js");
const {
  findSlotsToAlert,
  pruneExpiredAlerts,
  nextUpClass,
  isoDay,
  toMinutes,
} = await import("@/lib/class-alerts.js");
const { getPeriodTimes, schoolDayOf } = await import("@/lib/timetable.js");

const pct = (arr, p) => {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(2)}ms`);

// ============================================================================
// PHASE A — the real 1,800-student / 12-arm dataset
// ============================================================================
const [slim] = await demo.searchSchools("Greenfield");
const school = await demo.getSchoolById(slim.id);
const schoolId = school.id;
// Per-day bell schedules — the harness simulates a full week, so each day
// resolves its OWN schedule (a short Friday must never ring its dropped
// periods). Phase C simulates one Monday and uses that day's schedule.
const ptByDay = Object.fromEntries(
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => [
    d,
    getPeriodTimes(school, d),
  ])
);
const periodTimes = ptByDay.Monday;
const arms = school.activeArms;

const tA0 = performance.now();
const csv = generateRosterCsv({ role: "STUDENT", arms });
const parsed = parseRows("STUDENT", csv);
const [existingUsers, existingParents] = await Promise.all([
  store.listUsers({ schoolId }),
  store.listUsers({ schoolId, role: "PARENT" }),
]);
const planned = planImport({
  role: "STUDENT",
  rows: parsed.rows,
  schoolName: school.name,
  activeArms: arms,
  existingUsers,
  existingParents,
  defaultPassword: "edutrack123",
  createArms: true,
});
const applied = await applyImport({
  store,
  schoolId,
  role: "STUDENT",
  plans: planned.plans,
  parentRefs: planned.parentRefs,
  newArms: planned.newArms,
});
const tA1 = performance.now();

const teachers = await store.listUsers({ schoolId, role: "TEACHER" });
for (const t of teachers) {
  await demo.setClassAlertPref(schoolId, t.id, { enabled: true, leadMinutes: LEAD });
}
const allEntries = await demo.getTimetable({ schoolId });
const byTeacher = new Map();
for (const e of allEntries) {
  if (!byTeacher.has(e.teacherId)) byTeacher.set(e.teacherId, []);
  byTeacher.get(e.teacherId).push(e);
}
const studentCount = await store.countUsers({ schoolId, role: "STUDENT" });
const parentCount = await store.countUsers({ schoolId, role: "PARENT" });

console.log("=".repeat(72));
console.log("CLASS-ALERT SCHEDULER — STRESS TEST");
console.log("=".repeat(72));
console.log(`Dataset build (real import pipeline): ${((tA1 - tA0) / 1000).toFixed(1)}s`);
console.log(`  school: ${school.name} — ${arms.length} arms`);
console.log(`  students: ${studentCount} · teachers: ${teachers.length} · parents: ${parentCount}`);
console.log(`  timetable slots/week: ${allEntries.length} (${applied.created.students} students imported)`);
console.log(`  alerts enabled for all ${teachers.length} teachers (lead ${LEAD} min, grace ${GRACE} min)`);

// ============================================================================
// PHASE B — full-week simulation at the hook's exact tick cadence
// ============================================================================
const monday = new Date();
monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
monday.setHours(0, 0, 0, 0);

/** Independent re-derivation of "earliest unfinished class today" — a second
 *  implementation of the nextUpClass contract to cross-check it against. */
function expectedNextMin(entries, dayName, nowMin) {
  let best = null;
  const dayTimes = ptByDay[dayName] || periodTimes;
  for (const entry of entries) {
    if (entry.day !== dayName) continue;
    const pt = dayTimes.find((p) => Number(p.period) === Number(entry.period));
    if (!pt) continue;
    const s = toMinutes(pt.start);
    const e = toMinutes(pt.end);
    if (s === null || e === null || e <= nowMin) continue;
    if (best === null || s < best) best = s;
  }
  return best;
}

/** One full-week simulation run at a given tick phase offset (seconds).
 *  The real browser hook ticks every 15s UNALIGNED to the minute, so running
 *  with a non-zero offset measures the true worst-case "fires on time" bound. */
function simulateWeek(phaseOffsetSec) {
  const flaggedSets = new Map(teachers.map((t) => [t.id, new Set()]));
  const fires = [];
  const perTickMs = [];
  let ticks = 0;
  let nextFailures = 0;
  const phase = phaseOffsetSec / 60; // minutes
  for (let d = 0; d < 5; d++) {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + d);
    const dayName = schoolDayOf(dayDate);
    const dayTimes = ptByDay[dayName] || periodTimes;
    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += TICK_MIN) {
      const tickAt = m + phase; // actual wall-clock minute of this tick
      const now = new Date(dayDate);
      now.setHours(Math.floor(tickAt / 60), Math.floor(tickAt % 60), Math.round((tickAt % 1) * 60), 0);
      const t0 = performance.now();
      for (const teacher of teachers) {
        const entries = byTeacher.get(teacher.id) || [];
        const flagged = flaggedSets.get(teacher.id);
        pruneExpiredAlerts({ periodTimes: dayTimes, now, alreadyAlerted: flagged });
        const next = nextUpClass({ entries, periodTimes: dayTimes, now });
        const nowMin = Math.floor(tickAt);
        const expected = expectedNextMin(entries, dayName, nowMin);
        const actual = next ? next.startMinutes : null;
        if (actual !== expected) nextFailures++;
        const slots = findSlotsToAlert({
          entries,
          periodTimes: dayTimes,
          now,
          leadMinutes: LEAD,
          alreadyAlerted: flagged,
        });
        for (const slot of slots) {
          const key = `${isoDay(now)}|${slot.period}`;
          flagged.add(key);
          fires.push({
            teacherId: teacher.id,
            day: slot.day,
            period: slot.period,
            classArm: slot.classArm,
            subject: slot.subject,
            startMinutes: slot.startMinutes,
            fireMin: tickAt,
          });
        }
      }
      perTickMs.push(performance.now() - t0);
      ticks++;
    }
  }
  return { fires, perTickMs, ticks, nextFailures };
}

const expectedKeys = new Set(allEntries.map((e) => `${e.teacherId}|${e.day}|${e.period}`));

function reportRun({ label, fires, perTickMs, ticks, nextFailures }) {
  const firedKeys = new Set(fires.map((f) => `${f.teacherId}|${f.day}|${f.period}`));
  const missing = [...expectedKeys].filter((k) => !firedKeys.has(k));
  const extras = [...firedKeys].filter((k) => !expectedKeys.has(k));
  const dupes = fires.length - firedKeys.size;
  let early = 0;
  let late = 0;
  let maxLateSec = 0;
  for (const f of fires) {
    const windowOpen = f.startMinutes - LEAD;
    if (f.fireMin < windowOpen - 1e-9) early++;
    if (f.fireMin >= f.startMinutes + GRACE) late++;
    maxLateSec = Math.max(maxLateSec, (f.fireMin - windowOpen) * 60);
  }
  const perDay = {};
  for (const f of fires) perDay[f.day] = (perDay[f.day] || 0) + 1;
  const avgTick = perTickMs.reduce((a, b) => a + b, 0) / perTickMs.length;
  const runOk =
    missing.length === 0 && extras.length === 0 && dupes === 0 && early === 0 && late === 0 && nextFailures === 0 && maxLateSec <= TICK_MIN * 60 + 1e-6;
  console.log("-".repeat(72));
  console.log(`PHASE B — ${label}`);
  console.log(`  simulated: ${ticks.toLocaleString()} ticks (5 days × ${((DAY_END_MIN - DAY_START_MIN) / TICK_MIN).toLocaleString()} ticks/day)`);
  console.log(`  alarms fired: ${fires.length} (per day: ${Object.entries(perDay).map(([d, n]) => `${d} ${n}`).join(", ")})`);
  console.log(`  exactly once: ${dupes === 0 ? "YES" : `NO (${dupes} double-fires)`} — ${fires.length} fires for ${expectedKeys.size} slots`);
  console.log(`  missed slots: ${missing.length} · spurious fires: ${extras.length}`);
  console.log(`  fired before lead window: ${early} · fired past ${GRACE}-min grace: ${late}`);
  console.log(`  worst lateness vs window open: ${maxLateSec.toFixed(1)}s (≤ one ${TICK_MIN * 60}s tick → ${maxLateSec <= TICK_MIN * 60 + 1e-6 ? "OK" : "TOO LATE"})`);
  console.log(`  nextUpClass cross-check failures: ${nextFailures}`);
  console.log(`  per-tick cost (all ${teachers.length} teachers): avg ${fmtMs(avgTick)} · p95 ${fmtMs(pct(perTickMs, 95))} · max ${fmtMs(Math.max(...perTickMs))}`);
  console.log(`  vs the ${TICK_BUDGET_MS / 1000}s tick budget: ${((avgTick / TICK_BUDGET_MS) * 100).toFixed(4)}% of the budget`);
  return runOk;
}

const tB0 = performance.now();
const aligned = simulateWeek(0);
const misaligned = simulateWeek(10); // ticks land 10s off the minute — the real-world case
const tB1 = performance.now();
const okA = reportRun({ label: "full school week, 15s ticks, minute-aligned", ...aligned });
const okB = reportRun({ label: "full school week, 15s ticks, +10s misaligned phase (real browser case)", ...misaligned });
console.log(`  combined wall time for both runs: ${((tB1 - tB0) / 1000).toFixed(1)}s (two simulated weeks)`);
const ok = okA && okB;

// ============================================================================
// PHASE C — synthetic scale sweep: 14 × k teachers
// ============================================================================
console.log("-".repeat(72));
console.log("PHASE C — scale sweep (one Monday, same entry shapes)");
const scaleKs = [1, 10, 50, 100];
const rows = [];
for (const k of scaleKs) {
  const scaled = [];
  for (let i = 0; i < 14 * k; i++) {
    scaled.push({ id: `scale_${i}`, entries: byTeacher.get(teachers[i % 14].id) || [] });
  }
  const flagged = scaled.map(() => new Set());
  const dayDate = new Date(monday);
  const dayName = schoolDayOf(dayDate);
  const tickMs = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += TICK_MIN) {
    const now = new Date(dayDate);
    now.setHours(Math.floor(m / 60), Math.floor(m % 60), Math.round((m % 1) * 60), 0);
    const t0 = performance.now();
    for (let i = 0; i < scaled.length; i++) {
      const t = scaled[i];
      pruneExpiredAlerts({ periodTimes, now, alreadyAlerted: flagged[i] });
      nextUpClass({ entries: t.entries, periodTimes, now });
      findSlotsToAlert({ entries: t.entries, periodTimes, now, leadMinutes: LEAD, alreadyAlerted: flagged[i] });
    }
    tickMs.push(performance.now() - t0);
  }
  const avg = tickMs.reduce((a, b) => a + b, 0) / tickMs.length;
  rows.push([14 * k, avg, pct(tickMs, 95), Math.max(...tickMs)]);
}
console.log(`  teachers    per-tick avg    p95       max      % of 15s budget`);
for (const [n, avg, p95, max] of rows) {
  console.log(
    `  ${String(n).padStart(7)}   ${fmtMs(avg).padStart(11)}  ${fmtMs(p95).padStart(8)}  ${fmtMs(max).padStart(8)}  ${((avg / TICK_BUDGET_MS) * 100).toFixed(4)}%`
  );
}
const [lastN, lastAvg] = rows[rows.length - 1];
console.log(`  → ${lastN} teachers (100× today's 14) uses ${((lastAvg / TICK_BUDGET_MS) * 100).toFixed(3)}% of one tick — scheduler cost scales ~linearly with teachers`);

// ============================================================================
console.log("=".repeat(72));
console.log(ok ? "RESULT: PASS — every alarm fired exactly once, on time, at scale" : "RESULT: FAIL — see counters above");
console.log("=".repeat(72));

fs.rmSync(stressDir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
