/**
 * Graceful-shutdown wiring (Node runtime only).
 *
 * Lives in its OWN module on purpose: `process.on` is not an Edge API, and
 * Next statically checks instrumentation.js against the Edge runtime — a
 * bare `process.on` in that file makes the dev server re-emit
 * "A Node.js API is used (process.on) … not supported in the Edge Runtime"
 * on every compile, flooding the log under load. instrumentation.js
 * dynamically imports this file ONLY inside its Node-runtime branch, so the
 * Edge bundle never contains it and the check stays quiet.
 *
 * Stopping the background tickers and closing the DB connection on SIGTERM
 * (orchestrator shutdown of self-hosted `next start`) is Node-only work —
 * the Edge runtime never runs these jobs.
 */

const g = globalThis;

/** Wire the SIGTERM cleanup once (dev hot-reloads re-run register()). */
export function wireShutdown() {
  if (g.__shutdownWired) return;
  g.__shutdownWired = true;

  // Next.js runs its own SIGTERM handling — this listener just cleans up
  // first; SIGINT (Ctrl+C in dev) is left to Next alone.
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
