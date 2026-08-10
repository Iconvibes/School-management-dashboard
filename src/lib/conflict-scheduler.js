/**
 * The daily timetable-conflict-scan BACKGROUND JOB.
 *
 * The scan used to be triggered lazily by the first Overview load of the day
 * (the health read's 24h staleness check). That made the metric's freshness
 * depend on admin traffic. This module replaces it with a real in-process
 * scheduler: a setInterval ticker, registered once at server boot from
 * src/instrumentation.js, that runs the scan at a fixed hour (CONFLICT_SCAN_HOUR,
 * default 02:00 server-local) for every school.
 *
 * Design notes:
 *  - The WHEN is a pure policy (isScanDue in conflict-scan.js), fully
 *    unit-tested without timers; this module only owns the loop.
 *  - Never-scanned schools are scanned on the FIRST tick after boot (the
 *    "never scanned → due" rule), so a fresh demo/tenant gets a populated
 *    Schedule Health metric without any dashboard load.
 *  - A manual "Scan now" updates lastRunAt, which satisfies the day's run —
 *    the ticker sees a fresh record and skips (no double scan).
 *  - Ticks never overlap: a slow scan (10k-student school) simply means the
 *    next check waits. Failures are logged and the loop continues.
 *  - Multi-instance: every server runs the ticker, but isScanDue makes the
 *    run idempotent — the first instance to scan updates lastRunAt, the
 *    others skip. A same-instant race can double-scan a school once, which
 *    only rewrites an identical record (acceptable at this stage).
 */

import { isScanDue, resolveScanHour, runConflictScan } from "@/lib/conflict-scan";

/** How often the ticker checks whether the fixed hour has arrived. */
export const SCHEDULER_TICK_MS = 60 * 1000;

/**
 * Build the admin inbox notification for a scan that found NEW collisions.
 * Pure — takes the scan result, returns the createNotification payload. Only
 * the NEW conflicts (result.newConflicts) are listed; conflicts the admin
 * already saw in a previous scan are not re-reported.
 */
export function buildConflictScanNotification(result) {
  const n = result?.newConflictCount || 0;
  const noun = n === 1 ? "collision" : "collisions";
  const lines = [];
  for (const c of result?.newConflicts?.teacher || []) {
    const arms = (c.slots || []).map((s) => s.classArm).filter(Boolean).join(", ");
    lines.push(
      `• ${c.teacherName || c.teacherId} is booked in ${c.slots?.length || 2} classes on ${c.day}, period ${c.period}${arms ? `: ${arms}` : ""}`
    );
  }
  for (const c of result?.newConflicts?.arm || []) {
    const subs = (c.slots || [])
      .map((s) => `${s.subject || "?"}${s.teacherName ? ` (${s.teacherName})` : ""}`)
      .join(", ");
    lines.push(`• ${c.classArm} has ${c.slots?.length || 2} subjects at ${c.day}, period ${c.period}: ${subs}`);
  }
  for (const v of result?.newConflicts?.scope || []) {
    const what = v.problems?.includes("teacher")
      ? "is no longer in the staff list"
      : `isn't assigned to teach ${v.subject} in ${v.classArm}`;
    lines.push(`• ${v.teacherName || v.teacherId} ${what} (${v.day}, period ${v.period})`);
  }
  return {
    kind: "timetable_conflict",
    subject: `${n} new timetable ${noun}`,
    preview: `${n} new ${noun} since the last daily scan — review them in the Timetable tab.`,
    body: lines.length ? lines.join("\n") : `The daily scan found ${n} new timetable ${noun}.`,
  };
}

/**
 * Push the collision notification to EVERY SUPER_ADMIN of the school (the
 * role that owns timetable.manage and sees the Schedule Health card). Never
 * throws — a notification failure must not abort the scan loop or be
 * mistaken for a scan failure.
 * @returns {Promise<number>} how many admins were notified (0 on failure)
 */
export async function notifyAdminsOfNewConflicts({ store, schoolId, result, logger = console }) {
  try {
    const admins = await store.listUsers({ schoolId, role: "SUPER_ADMIN" });
    if (!admins.length) return 0;
    await store.createNotification({
      schoolId,
      to: admins.map((a) => a.email),
      ...buildConflictScanNotification(result),
    });
    return admins.length;
  } catch (err) {
    logger.error(`[conflict-scheduler] conflict notification failed for school ${schoolId}:`, err);
    return 0;
  }
}

/**
 * Check every school and scan the ones whose daily run is due. Pure-ish —
 * takes the store so it runs under demo/mongo and in tests; `now` and
 * `scanHour` are injectable for deterministic tests.
 *
 * @returns {Promise<{scanned: number, skipped: number, results: Array}>}
 */
export async function runDueScans({
  store,
  now = new Date(),
  scanHour = resolveScanHour(),
  logger = console,
}) {
  const schoolIds = await store.listSchoolIds();
  const results = [];
  let skipped = 0;
  for (const schoolId of schoolIds) {
    const prev = await store.getConflictScan(schoolId);
    const lastRunAtMs = prev?.lastRunAt ? new Date(prev.lastRunAt).getTime() : 0;
    if (!isScanDue({ lastRunAtMs, now, scanHour })) {
      skipped += 1;
      continue;
    }
    try {
      const result = await runConflictScan({ store, schoolId, now });
      // New collisions since the last scan → tell every admin (the job's
      // push). Manual scans don't notify — the admin is already watching.
      if (result.newConflictCount > 0) {
        await notifyAdminsOfNewConflicts({ store, schoolId, result, logger });
      }
      results.push({ schoolId, ...result });
    } catch (err) {
      logger.error(`[conflict-scheduler] scan failed for school ${schoolId}:`, err);
    }
  }
  return { scanned: results.length, skipped, results };
}

/**
 * Start the daily loop. Returns { stop } — the instrumentation keeps the
 * handle on globalThis so dev hot-reloads replace (not stack) schedulers.
 *
 * @param {Object} o
 * @param {Object} o.store       the active store (demo or mongo)
 * @param {number} [o.tickMs]    check interval (default 60s)
 * @param {number} [o.scanHour]  fixed daily hour (default from env / 02:00)
 * @param {() => Date} [o.now]   injectable clock
 * @param {Object} [o.logger]
 * @param {boolean} [o.immediate] run the first check right away (default true)
 */
export function startConflictScheduler({
  store,
  tickMs = SCHEDULER_TICK_MS,
  scanHour = resolveScanHour(),
  now = () => new Date(),
  logger = console,
  immediate = true,
}) {
  let running = false;
  let stopped = false;
  let firstTimer = null;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await runDueScans({ store, now: now(), scanHour, logger });
    } catch (err) {
      logger.error("[conflict-scheduler] tick failed:", err);
    } finally {
      running = false;
    }
  };

  if (immediate) firstTimer = setTimeout(() => void tick(), 0);
  const id = setInterval(() => void tick(), tickMs);

  return {
    stop() {
      stopped = true;
      if (firstTimer) clearTimeout(firstTimer);
      clearInterval(id);
    },
  };
}
