/**
 * Server-boot hook (Next 16 App Router, Node runtime only).
 *
 * Registers the background jobs:
 *  - the daily timetable-conflict-scan ticker (CONFLICT_SCAN_HOUR, default
 *    02:00 server-local) — the Schedule Health metric is refreshed by the
 *    job, never by dashboard traffic;
 *  - the deleted-school grace-period sweeper (hourly) — permanently wipes
 *    tenants whose 30-day recovery window has lapsed.
 *
 * Guard rails:
 *  - NEXT_RUNTIME === "nodejs": register() also runs in the Edge runtime —
 *    the schedulers need Node timers + the full store, so Edge skips them.
 *  - NEXT_PHASE === "phase-production-build": skip during `next build` so a
 *    build never scans/writes the live demo store.
 *  - globalThis handles: dev hot-reloads re-run register(); the new instance
 *    stops the old tickers instead of stacking second ones.
 */

const g = globalThis;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Lazy imports: the Edge runtime ALSO evaluates instrumentation.js, and the
  // scheduler modules pull in the store (node:crypto, fs, process.cwd()) which
  // the Edge bundle can't load. Importing inside register() means the Edge
  // compile never sees them — and this branch returns before they're needed.
  const { startConflictScheduler } = await import("@/lib/conflict-scheduler");
  const { startDeletionSweeper } = await import("@/lib/deletion-sweeper");
  const { store } = await import("@/lib/store");
  if (g.__conflictScheduler) g.__conflictScheduler.stop();
  g.__conflictScheduler = startConflictScheduler({ store });
  if (g.__deletionSweeper) g.__deletionSweeper.stop();
  g.__deletionSweeper = startDeletionSweeper({ store });

  // Graceful shutdown (self-hosted `next start`): an orchestrator's SIGTERM
  // stops the background tickers and closes the Mongo connection before the
  // process exits. Next.js runs its own SIGTERM handling — this listener just
  // cleans up first; SIGINT (Ctrl+C in dev) is left to Next alone. Wired once
  // (dev hot-reloads re-run register()).
  if (!g.__shutdownWired) {
    g.__shutdownWired = true;
    process.on("SIGTERM", () => {
      if (g.__conflictScheduler) g.__conflictScheduler.stop();
      if (g.__deletionSweeper) g.__deletionSweeper.stop();
      // Fire-and-forget: mongoose.disconnect() may not finish before exit,
      // but the driver closes connections on process exit regardless.
      import("@/lib/db")
        .then(({ closeDB }) => closeDB())
        .catch(() => {});
    });
  }
}
