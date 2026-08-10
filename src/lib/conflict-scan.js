/**
 * Timetable conflict-scan runner — the engine behind the admin Overview's
 * Schedule Health metric. Scans every arm for collisions (the same
 * findTimetableConflicts the assignment API enforces, but over ALL data,
 * including legacy imports and manual edits), diffs the result against the
 * school's previous scan, and persists the record so "new since last scan"
 * survives restarts and the daily auto-scan doesn't re-run every request.
 *
 * Shared by:
 *   - GET  /api/timetable/health  — cached READ ONLY (the scan is driven by
 *     the daily background job in src/instrumentation.js, never by loads)
 *   - POST /api/timetable/scan    — the admin's manual "Scan now"
 *   - GET  /api/timetable?conflicts=1 — the Timetable tab's button (records too)
 *   - src/lib/conflict-scheduler.js  — the daily fixed-hour background job
 *
 * Pure-ish: no Next/React imports, takes the store so it works under both
 * stores and in tests.
 */
import {
  DAYS,
  conflictKey,
  conflictSlotKeys,
  findOrphanedEntries,
  findScopeViolations,
  findTimetableConflicts,
  findUnassignedPeriods,
  findUnstaffedTeachers,
  newConflictsSince,
  validSubstitutes,
} from "@/lib/timetable";

/** How often a school must be re-scanned (once per day). */
export const CONFLICT_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Total issues across every check group. `conflicts` carries the three
 * collision lists (teacher/arm/scope) PLUS the integrity lists
 * (unassignedPeriods/unstaffedTeachers/orphanedEntries), each counted once.
 */
export function countIssues(conflicts = {}) {
  return (
    (conflicts.teacher?.length || 0) +
    (conflicts.arm?.length || 0) +
    (conflicts.scope?.length || 0) +
    (conflicts.unassignedPeriods?.length || 0) +
    (conflicts.unstaffedTeachers?.length || 0) +
    (conflicts.orphanedEntries?.length || 0)
  );
}

// ---- Daily-scan schedule (the background job) --------------------------------
//
// The conflict scan runs ONCE PER DAY at a fixed hour from a real background
// job (setInterval registered in src/instrumentation.js) — never lazily from
// a dashboard load. These helpers are pure so the policy is unit-testable.

/** Default daily scan hour (server-local 24h clock). */
export const DEFAULT_SCAN_HOUR = 2;

/**
 * The fixed hour the daily scan runs at, from CONFLICT_SCAN_HOUR (0–23).
 * Anything unset, blank, or invalid falls back to DEFAULT_SCAN_HOUR.
 */
export function resolveScanHour() {
  const s = (process.env.CONFLICT_SCAN_HOUR || "").trim();
  if (!s) return DEFAULT_SCAN_HOUR;
  const raw = Number(s);
  return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : DEFAULT_SCAN_HOUR;
}

/** "02:00"-style label for the UI. */
export function formatScanHour(scanHour) {
  return `${String(scanHour).padStart(2, "0")}:00`;
}

// ---- Per-day conflict history (the Schedule Health sparkline) ----------------

/** How many daily points the history keeps (a month at one scan per day). */
export const SCAN_HISTORY_LIMIT = 30;

/**
 * Append today's point to the per-day history. ONE point per day — a second
 * scan on the same day (manual "Scan now") replaces the day's entry with the
 * newest count, so the series stays a true daily trend even with manual runs
 * mixed in. Sorted ascending by date; capped at SCAN_HISTORY_LIMIT.
 *
 * @param {Array<{date, conflictCount, newCount}>} [history]
 * @param {Date} now
 * @param {number} conflictCount
 * @param {number} newCount
 */
export function appendScanHistory(history, now, conflictCount, newCount) {
  const date = now.toISOString().slice(0, 10);
  const rest = (history || []).filter((h) => h.date !== date);
  return [...rest, { date, conflictCount, newCount }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-SCAN_HISTORY_LIMIT);
}

/**
 * Map the per-day history to an SVG polyline for the health card's sparkline.
 * Y is inverted (0 conflicts at the bottom, the max at the top) and
 * normalized to the series' min..max so a constant count reads as a flat line
 * while real changes pop. Returns null when there are fewer than 2 points.
 *
 * @param {Array<{date, conflictCount}>} [history] ascending by date
 * @param {{width?: number, height?: number, maxPoints?: number}} [o]
 * @returns {string|null} "x,y x,y …"
 */
export function sparklinePoints(
  history = [],
  { width = 120, height = 28, maxPoints = SCAN_HISTORY_LIMIT } = {}
) {
  const counts = (history || []).slice(-maxPoints).map((h) => h.conflictCount);
  if (counts.length < 2) return null;
  const min = Math.min(...counts);
  const span = Math.max(1, Math.max(...counts) - min);
  const stepX = width / (counts.length - 1);
  return counts
    .map((v, i) => {
      const x = Math.round(i * stepX);
      const y = Math.round(height - ((v - min) / span) * (height - 2) - 1);
      return `${x},${y}`;
    })
    .join(" ");
}

/**
 * When a scan is due, at tick time `now`:
 *   - never scanned                         → due (populates the metric after boot)
 *   - last run 24h+ ago                     → due (catch-up when the process was
 *     down during the fixed hour, or the hour changed)
 *   - now is the fixed hour AND the last run predates this hour → due (the
 *     daily run itself — a manual "Scan now" during the hour satisfies it,
 *     because it updates lastRunAt to within the hour)
 *   - otherwise                             → not due (a fresh scan never
 *     re-runs on the next tick, and non-fixed hours never scan)
 *
 * @param {Object} o
 * @param {number} o.lastRunAtMs   epoch ms of the school's last scan, 0 when never
 * @param {Date}   [o.now]
 * @param {number} [o.scanHour]
 */
export function isScanDue({ lastRunAtMs, now = new Date(), scanHour = resolveScanHour() }) {
  if (!lastRunAtMs || lastRunAtMs <= 0) return true;
  if (now.getTime() - lastRunAtMs >= CONFLICT_SCAN_INTERVAL_MS) return true;
  if (now.getHours() === scanHour) {
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);
    return lastRunAtMs < hourStart.getTime();
  }
  return false;
}

/**
 * The next fixed-hour instant at or after `now` (today, or tomorrow if the
 * hour has already passed). Used by the health read's `nextScanAt`.
 */
export function nextScheduledScan(now, scanHour = resolveScanHour()) {
  const d = new Date(now);
  d.setHours(scanHour, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Run a scan now: read every arm's entries, resolve teacher names, diff
 * against the previous scan's keys, persist, and return the full result.
 *
 * @param {Object}  o
 * @param {Object}  o.store       the active store (demo or mongo)
 * @param {string}  o.schoolId
 * @param {Date}    [o.now]       injectable clock for tests
 * @returns {Promise<{scannedAt, conflicts, conflictCount, teacherConflicts,
 *                    armConflicts, newConflicts, newConflictCount}>}
 */
export async function runConflictScan({ store, schoolId, now = new Date() }) {
  const [all, teachers, school, prev] = await Promise.all([
    store.getTimetable({ schoolId }),
    store.listUsers({ schoolId, role: "TEACHER" }),
    store.getSchoolById(schoolId),
    store.getConflictScan(schoolId),
  ]);
  const nameById = Object.fromEntries(teachers.map((t) => [t.id, t.name]));
  const teachersById = Object.fromEntries(teachers.map((t) => [t.id, t]));
  const resolved = all.map((e) => ({ ...e, teacherName: nameById[e.teacherId] }));
  const conflicts = findTimetableConflicts(resolved);
  // Scope violations — a teacher scheduled for a subject/arm they don't teach
  // (or no longer in the roster). Each carries its valid swap-in candidates.
  conflicts.scope = findScopeViolations(resolved, teachersById).map((v) => ({
    ...v,
    candidates: validSubstitutes({
      entries: all,
      teachersById,
      subject: v.subject,
      classArm: v.classArm,
      day: v.day,
      period: v.period,
    }),
  }));
  // Other integrity checks, surfaced alongside the collisions:
  //   - unassignedPeriods  — an arm with ZERO classes on a school day
  //   - unstaffedTeachers  — roster teachers with no timetable slots at all
  //   - orphanedEntries    — slots pointing at an arm no longer in activeArms
  //     (dangling teacher entries already live under scope violations, so
  //     every defect is counted exactly once)
  const activeArms = school?.activeArms || [];
  conflicts.unassignedPeriods = findUnassignedPeriods(resolved, activeArms, DAYS);
  conflicts.unstaffedTeachers = findUnstaffedTeachers(resolved, teachers);
  conflicts.orphanedEntries = findOrphanedEntries(resolved, activeArms);
  const prevKeys = new Set(prev?.conflictKeys || []);
  const newTeacher = newConflictsSince(prevKeys, conflicts.teacher);
  const newArm = newConflictsSince(prevKeys, conflicts.arm);
  const newScope = newConflictsSince(prevKeys, conflicts.scope);
  const allKeys = [...conflicts.teacher, ...conflicts.arm, ...conflicts.scope].map(conflictKey);
  const newKeys = [...newTeacher, ...newArm, ...newScope].map(conflictKey);
  // Flagged-slot HISTORY: union of every slot this scan touches with every
  // slot ever flagged before. Kept across clean re-scans on purpose — once a
  // slot is flagged, reassigning it must never silently regress the fix.
  const flaggedSlots = Array.from(
    new Set([...(prev?.flaggedSlots || []), ...conflictSlotKeys(conflicts)])
  ).sort();
  // Per-day conflict HISTORY for the sparkline: one point per day (a same-day
  // manual scan replaces the day's point), capped at SCAN_HISTORY_LIMIT.
  const conflictCount = conflicts.teacher.length + conflicts.arm.length + conflicts.scope.length;
  const issueCount = countIssues(conflicts);
  const history = appendScanHistory(prev?.history, now, conflictCount, newKeys.length);
  const record = {
    lastRunAt: now.toISOString(),
    conflicts,
    conflictKeys: allKeys,
    newConflictKeys: newKeys,
    flaggedSlots,
    history,
  };
  await store.saveConflictScan(schoolId, record);
  return {
    scannedAt: record.lastRunAt,
    conflicts,
    conflictCount,
    issueCount,
    teacherConflicts: conflicts.teacher.length,
    armConflicts: conflicts.arm.length,
    scopeConflicts: conflicts.scope.length,
    unassignedPeriods: conflicts.unassignedPeriods,
    unassignedPeriodCount: conflicts.unassignedPeriods.length,
    unstaffedTeachers: conflicts.unstaffedTeachers,
    unstaffedTeacherCount: conflicts.unstaffedTeachers.length,
    orphanedEntries: conflicts.orphanedEntries,
    orphanedEntryCount: conflicts.orphanedEntries.length,
    newConflicts: { teacher: newTeacher, arm: newArm, scope: newScope },
    newConflictCount: newKeys.length,
    flaggedSlots,
    history,
  };
}

/**
 * The health read: a pure lookup of the school's most recent scan. READ ONLY
 * — scanning is the background job's (and the admin's manual "Scan now")
 * job, never a side effect of a dashboard load, so the fixed daily hour is
 * the single cadence and an Overview view can never trigger one.
 *
 * @returns {Promise<{scannedAt, neverScanned, fresh, scanHour, nextScanAt,
 *                    conflicts, conflictCount, issueCount, teacherConflicts,
 *                    armConflicts, newConflicts, newConflictCount,
 *                    flaggedSlots, history, unassignedPeriods,
 *                    unassignedPeriodCount, unstaffedTeachers,
 *                    unstaffedTeacherCount, orphanedEntries,
 *                    orphanedEntryCount}>}
 */
export async function readConflictHealth({ store, schoolId, now = new Date(), scanHour = resolveScanHour() }) {
  const prev = await store.getConflictScan(schoolId);
  const lastRun = prev?.lastRunAt ? new Date(prev.lastRunAt).getTime() : 0;
  const fresh = Number.isFinite(lastRun) && lastRun > 0 && now.getTime() - lastRun < CONFLICT_SCAN_INTERVAL_MS;
  return {
    scannedAt: lastRun > 0 ? new Date(lastRun).toISOString() : null,
    neverScanned: lastRun <= 0,
    fresh,
    scanHour,
    nextScanAt: nextScheduledScan(now, scanHour).toISOString(),
    conflicts: prev?.conflicts || { teacher: [], arm: [], scope: [] },
    conflictCount:
      (prev?.conflicts?.teacher?.length || 0) +
      (prev?.conflicts?.arm?.length || 0) +
      (prev?.conflicts?.scope?.length || 0),
    teacherConflicts: prev?.conflicts?.teacher?.length || 0,
    armConflicts: prev?.conflicts?.arm?.length || 0,
    scopeConflicts: prev?.conflicts?.scope?.length || 0,
    newConflicts: {
      teacher: (prev?.conflicts?.teacher || []).filter((c) => prev.newConflictKeys?.includes(conflictKey(c))),
      arm: (prev?.conflicts?.arm || []).filter((c) => prev.newConflictKeys?.includes(conflictKey(c))),
      scope: (prev?.conflicts?.scope || []).filter((c) => prev.newConflictKeys?.includes(conflictKey(c))),
    },
    newConflictCount: prev?.newConflictKeys?.length || 0,
    flaggedSlots: prev?.flaggedSlots || [],
    // Per-day counts (ascending by date) — the card's sparkline source.
    history: prev?.history || [],
    // Integrity checks beyond collisions (legacy records default to none).
    unassignedPeriods: prev?.conflicts?.unassignedPeriods || [],
    unassignedPeriodCount: prev?.conflicts?.unassignedPeriods?.length || 0,
    unstaffedTeachers: prev?.conflicts?.unstaffedTeachers || [],
    unstaffedTeacherCount: prev?.conflicts?.unstaffedTeachers?.length || 0,
    orphanedEntries: prev?.conflicts?.orphanedEntries || [],
    orphanedEntryCount: prev?.conflicts?.orphanedEntries?.length || 0,
    issueCount: countIssues(prev?.conflicts),
  };
}
