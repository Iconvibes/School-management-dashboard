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
 *  - RUN_JOBS !== "none": background jobs run on EXACTLY ONE instance. The
 *    default is "primary" (unset → jobs run) so single-instance deploys, dev
 *    and demo are unchanged; every additional replica sets RUN_JOBS=none so N
 *    servers never run N conflict scans / deletion sweeps.
 *  - globalThis handles: dev hot-reloads re-run register(); the new instance
 *    stops the old tickers instead of stacking second ones.
 */

const g = globalThis;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // REDIS_URL is REQUIRED in production: the shared rate-limit buckets and
  // the auth/stats/timetable caches depend on it (a multi-instance deploy
  // with per-process buckets would let an attacker multiply their budget by
  // the server count). Fail the boot loudly instead of degrading silently.
  // Dev/demo/tests (NODE_ENV != production) keep the in-memory fallbacks.
  if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
    throw new Error(
      "REDIS_URL is required in production. EduTrack needs Redis for shared " +
        "rate-limit buckets and caching (traffic audit §6). Set REDIS_URL and restart."
    );
  }
  // DATA_ENC_KEY is REQUIRED in production: without it, PII field encryption
  // silently falls back to a KNOWN dev key (src/lib/field-crypto.js) — a
  // leaked DB would decrypt emails/phones. Refuse to boot rather than ship
  // data-at-rest with a public key.
  if (process.env.NODE_ENV === "production" && !process.env.DATA_ENC_KEY) {
    throw new Error(
      "DATA_ENC_KEY is required in production: it seeds the AES-256-GCM key " +
        "that encrypts emails/phones at rest. Generate one (e.g. `openssl rand " +
        "-base64 32`) and ESCROW it — losing it makes the stored PII unreadable. " +
        "See docs/disaster-recovery.md."
    );
  }
  // RUN_JOBS gate: only the designated primary replica starts the timers. A
  // non-primary instance skips even the scheduler imports — no timers, no
  // duplicate scans, no duplicate sweeps.
  const isPrimary = process.env.RUN_JOBS !== "none";
  if (isPrimary) {
    // Lazy imports: the Edge runtime ALSO evaluates instrumentation.js, and
    // the scheduler modules pull in the store (node:crypto, fs, filesystem
    // paths) which the Edge bundle can't load. Importing inside register()
    // means the Edge compile never sees them — and this branch returns before
    // they're needed.
    const { startConflictScheduler } = await import("@/lib/conflict-scheduler");
    const { startDeletionSweeper } = await import("@/lib/deletion-sweeper");
    const { store } = await import("@/lib/store");
    if (g.__conflictScheduler) g.__conflictScheduler.stop();
    g.__conflictScheduler = startConflictScheduler({ store });
    if (g.__deletionSweeper) g.__deletionSweeper.stop();
    g.__deletionSweeper = startDeletionSweeper({ store });
  }

  // Graceful shutdown (self-hosted `next start`): an orchestrator's SIGTERM
  // stops the background tickers and closes the Mongo connection before the
  // process exits. Wired via a Node-only module (`@/lib/shutdown`) — keeping
  // the SIGTERM handler OUT of this file stops Next's dev Edge-compatibility
  // check from warning on every compile (it flooded the dev log under load).
  const { wireShutdown } = await import("@/lib/shutdown");
  wireShutdown();
}
