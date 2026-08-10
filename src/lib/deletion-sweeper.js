/**
 * The deleted-school GRACE-PERIOD SWEEPER (background job).
 *
 * Deleting a school is no longer an instant wipe: the tenant is marked
 * "deleted" with a deletedAt stamp and stays fully recoverable for
 * SCHOOL_DELETION_GRACE_MS (30 days), so the SUPER_ADMIN can restore it. This
 * module is the job that makes the wipe real once the grace period lapses —
 * a setInterval ticker registered at server boot from src/instrumentation.js.
 *
 * Design notes:
 *  - purgeExpiredDeletedSchools is idempotent (expired schools are matched by
 *    status + deletedAt, so a purged school is simply skipped), which keeps
 *    multi-instance deployments safe: every server runs the ticker, but only
 *    one purge happens per school.
 *  - The login route ALSO purges lazily when someone tries to sign into an
 *    expired school, so the wipe never depends on the scheduler alone.
 *  - The first tick runs immediately on boot so a long-idle server doesn't
 *    wait a full hour to sweep a school that lapsed while it was down.
 */

import { store } from "@/lib/store";

/** How often the sweeper checks for newly-expired tenants. */
export const SWEEPER_TICK_MS = 60 * 60 * 1000; // hourly

export function startDeletionSweeper({ store: st = store, tickMs = SWEEPER_TICK_MS } = {}) {
  const run = () => {
    st.purgeExpiredDeletedSchools().catch((err) => {
      // A failed sweep must never take the loop down — log and retry next tick.
      console.error("[deletion-sweeper] purge failed:", err?.message || err);
    });
  };

  // Sweep once on boot, then every tick.
  run();
  const id = setInterval(run, tickMs);

  return {
    stop() {
      clearInterval(id);
    },
  };
}
