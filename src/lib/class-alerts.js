/**
 * Class-alert scheduling core — PURE functions with no React or fetch, so
 * the "is it time to ring?" math is deterministic and unit-testable. The
 * client hook (src/hooks/useClassAlerts.js) is a thin shell over this.
 *
 * Semantics:
 *  - A slot is ALERTABLE while `now` is inside [start - leadMinutes,
 *    start + 15min): it fires for a class about to start, and still fires if
 *    the teacher looks at their phone a few minutes late.
 *  - Each slot alerts ONCE per occurrence (the caller keeps a flagged set of
 *    `${YYYY-MM-DD}|${period}` keys); keys expire once their window passes.
 */

import { schoolDayOf } from "@/lib/timetable";

// Re-export for callers that imported it from here before it moved home.
export { schoolDayOf };

/** \"HH:MM\" (zero-padded) → minutes since midnight; null when malformed. */
export function toMinutes(hhmm) {
  if (typeof hhmm !== "string") return null;
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null; // strict "08:40" — no "8:40"
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(3, 5));
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Minutes since midnight → \"HH:MM\". */
export function minutesToLabel(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Local YYYY-MM-DD — used to make flagged keys unique per occurrence. */
export function isoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Alert stays live for 15 minutes past the period's start. */
export const ALERT_GRACE_MINUTES = 15;

/**
 * The teacher's slots that need an alarm RIGHT NOW (never more than one per
 * period). Returns enriched entries (with `startMinutes`) for slots inside
 * the alert window and not already flagged.
 *
 * @param {Object} o
 * @param {Array}  o.entries       the teacher's timetable entries
 * @param {Array}  o.periodTimes   [{period,start,end}] — see getPeriodTimes()
 * @param {Date}   [o.now]         the clock (injectable for tests)
 * @param {number} [o.leadMinutes] how early to ring (0 = at start)
 * @param {Set}    [o.alreadyAlerted] flagged `${isoDay}|${period}` keys
 */
export function findSlotsToAlert({
  entries = [],
  periodTimes = [],
  now = new Date(),
  leadMinutes = 5,
  alreadyAlerted = new Set(),
}) {
  const day = schoolDayOf(now);
  if (!day) return [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = isoDay(now);
  const result = [];
  for (const entry of entries) {
    if (entry.day !== day) continue;
    const pt = periodTimes.find((p) => Number(p.period) === Number(entry.period));
    if (!pt) continue;
    const start = toMinutes(pt.start);
    if (start === null) continue;
    const key = `${today}|${entry.period}`;
    if (alreadyAlerted.has(key)) continue;
    if (nowMin >= start - leadMinutes && nowMin < start + ALERT_GRACE_MINUTES) {
      result.push({ ...entry, startMinutes: start });
    }
  }
  return result;
}

/**
 * Drop flagged keys that can never fire again: keys from a previous day and
 * today's keys whose alert window has fully passed. Called every tick so a
 * slot alerts exactly once per occurrence (never suppressed next week).
 */
export function pruneExpiredAlerts({
  periodTimes = [],
  now = new Date(),
  alreadyAlerted = new Set(),
}) {
  const today = isoDay(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const day = schoolDayOf(now);
  for (const key of [...alreadyAlerted]) {
    const [datePart, periodPart] = key.split("|");
    if (datePart !== today) {
      alreadyAlerted.delete(key);
      continue;
    }
    if (day) {
      const pt = periodTimes.find((p) => Number(p.period) === Number(periodPart));
      const start = pt ? toMinutes(pt.start) : null;
      // No bell time for this period → it can never ring → the key is dead.
      if (start === null || nowMin >= start + ALERT_GRACE_MINUTES) {
        alreadyAlerted.delete(key);
      }
    }
  }
  return alreadyAlerted;
}

/**
 * The class coming up next for a teacher (or in progress): the earliest
 * today slot that has not finished yet. Returns an enriched entry with
 * `startMinutes`, `endMinutes` and `startsInMin` (negative = already
 * started), or null on weekends / when the day is over.
 */
export function nextUpClass({ entries = [], periodTimes = [], now = new Date() }) {
  const day = schoolDayOf(now);
  if (!day) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const entry of entries) {
    if (entry.day !== day) continue;
    const pt = periodTimes.find((p) => Number(p.period) === Number(entry.period));
    if (!pt) continue;
    const start = toMinutes(pt.start);
    const end = toMinutes(pt.end);
    if (start === null || end === null) continue;
    if (end <= nowMin) continue; // already finished
    if (!best || start < best.startMinutes) {
      best = {
        ...entry,
        startMinutes: start,
        endMinutes: end,
        startsInMin: start - nowMin,
      };
    }
  }
  return best;
}
