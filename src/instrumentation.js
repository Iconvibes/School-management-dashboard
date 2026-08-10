/**
 * Server-boot hook (Next 16 App Router, Node runtime only).
 *
 * Registers the daily timetable-conflict-scan background job — a setInterval
 * ticker that runs the scan at a fixed hour (CONFLICT_SCAN_HOUR, default
 * 02:00 server-local) for every school. This is what replaced the lazy
 * "auto-scan on first Overview load": the Schedule Health metric is now
 * refreshed by the job, never by dashboard traffic.
 *
 * Guard rails:
 *  - NEXT_RUNTIME === "nodejs": register() also runs in the Edge runtime —
 *    the scheduler needs Node timers + the full store, so Edge skips it.
 *  - NEXT_PHASE === "phase-production-build": skip during `next build` so a
 *    build never scans/writes the live demo store.
 *  - globalThis handle: dev hot-reloads re-run register(); the new instance
 *    stops the old ticker instead of stacking a second one.
 */

import { startConflictScheduler } from "@/lib/conflict-scheduler";
import { store } from "@/lib/store";

const g = globalThis;

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (g.__conflictScheduler) g.__conflictScheduler.stop();
  g.__conflictScheduler = startConflictScheduler({ store });
}
