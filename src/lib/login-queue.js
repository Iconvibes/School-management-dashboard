/**
 * Login queue — BullMQ-backed bcrypt verification for the 08:00 login storm.
 *
 * When QUEUE_REDIS_URL is set, the login route enqueues bcrypt comparisons
 * to this queue instead of running them inline. A BullMQ Worker processes
 * jobs with bounded concurrency (50) and rate limiting (200/sec), so a
 * 100k-user login burst is absorbed as a controlled stream instead of
 * saturating the Node.js event loop.
 *
 * When QUEUE_REDIS_URL is NOT set, getLoginQueue() returns null and the
 * login route falls back to inline bcrypt — zero behavior change for
 * single-instance, demo, or test environments.
 *
 * Architecture:
 *   - Queue + Worker live in the SAME process (started by instrumentation.js)
 *   - No separate BullMQ worker process needed for day-one deployment
 *   - The Worker does bcrypt.compare + parent-child name matching + school-name
 *     fallback — everything the inline path does, just offloaded
 *   - Jobs time out after 10s; the login route falls back to inline on timeout
 *
 * Usage in the login route:
 *   const queue = getLoginQueue();
 *   if (queue) {
 *     const job = await queue.add("verify", { userId, password, role, ... });
 *     const result = await job.waitUntilFinished(queue.events, 10_000);
 *   } else {
 *     // inline bcrypt (current behavior)
 *   }
 */
import { Queue, Worker } from "bullmq";
import * as log from "@/lib/log";

const QUEUE_NAME = "login-verify";
const QUEUE_REDIS_URL = process.env.QUEUE_REDIS_URL;

// ── Queue (producer side — used by the login route) ────────────────

let _queue = null;

/**
 * Get the login queue instance. Returns null when QUEUE_REDIS_URL is not set
 * (the login route falls back to inline bcrypt in that case).
 */
export function getLoginQueue() {
  if (!QUEUE_REDIS_URL) return null;
  if (_queue) return _queue;
  try {
    _queue = new Queue(QUEUE_NAME, {
      connection: { url: QUEUE_REDIS_URL },
      defaultJobOptions: {
        removeOnComplete: 100,  // keep last 100 for debugging
        removeOnFail: 50,
        attempts: 1,            // no retries — a failed login is a failed login
      },
    });
    return _queue;
  } catch {
    return null;
  }
}

// ── Worker (consumer side — started by instrumentation.js) ──────────

let _worker = null;

/**
 * Start the login verification worker. Called once by instrumentation.js
 * on the primary instance. Returns the worker instance (for shutdown).
 *
 * @param {Object} store — the data-access store (demo or Mongo)
 * @returns {Worker|null}
 */
export function startLoginWorker(store) {
  if (!QUEUE_REDIS_URL) return null;
  if (_worker) return _worker;

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { userId, password, role, schoolId } = job.data;
      return verifyLogin(store, job.data);
    },
    {
      connection: { url: QUEUE_REDIS_URL },
      concurrency: 50,  // 50 concurrent bcrypt compares
      limiter: {
        max: 200,        // 200 logins/sec max throughput
        duration: 1000,
      },
    }
  );

  _worker.on("failed", (job, err) => {
    log.warn("login-queue", `job ${job?.id} failed:`, err?.message);
  });

  return _worker;
}

/**
 * Stop the worker gracefully (called during shutdown).
 */
export function stopLoginWorker() {
  if (_worker) {
    _worker.close();
    _worker = null;
  }
  if (_queue) {
    _queue.close();
    _queue = null;
  }
}

// ── Verification logic (extracted from login route) ─────────────────
// This mirrors the inline bcrypt path in src/app/api/auth/login/route.js.
// It receives the user object (already looked up) and the raw password.

/**
 * Verify a login attempt. Called by the BullMQ worker.
 *
 * @param {Object} store — data-access store
 * @param {Object} data — { userId, password, role, schoolId, user? }
 * @returns {Promise<{ok: boolean, error?: string, status?: number}>}
 */
async function verifyLogin(store, data) {
  const { userId, password, role, schoolId } = data;

  // Re-lookup the user (the worker may process this seconds after the route
  // looked it up — the user could have been deleted in the meantime).
  const user = await store.findUserById(userId);
  if (!user) {
    return { ok: false, status: 401, error: "Session no longer valid. Please sign in again." };
  }

  // Role mismatch guard (user may have been re-rolled between enqueue and process)
  if (role && user.role !== role) {
    return { ok: false, status: 401, error: "Session no longer valid. Please sign in again." };
  }

  // bcrypt.compare — the expensive operation that we offload from the main thread
  const bcrypt = await import("bcrypt");
  let ok = await bcrypt.compare(password, user.password);

  // Parent: accept any linked child's name as password
  if (!ok && user.role === "PARENT") {
    const { matchesChildName } = await import("@/lib/passwords");
    const children = await store.getChildren(user.id);
    ok = matchesChildName(password, children);
  }

  // Teacher: accept school name as password (bootstrap credential)
  if (!ok && user.role === "TEACHER" && !user.passwordSet) {
    const { matchesSchoolName } = await import("@/lib/passwords");
    const schoolRec = await store.getSchoolById(user.schoolId);
    ok = matchesSchoolName(password, schoolRec?.name);
  }

  if (!ok) {
    return {
      ok: false,
      status: 401,
      error: "Sorry, those details didn't match what we have on file. Please double-check your email or name and password, then try again.",
    };
  }

  // Frozen or deleted school check
  const schoolRec = await store.getSchoolById(user.schoolId);
  if (schoolRec?.status === "frozen" && user.role !== "SUPER_ADMIN") {
    return {
      ok: false,
      status: 403,
      error: "This school's account has been deactivated. Please contact your school administrator.",
    };
  }
  // Billing enforcement — expired/paused subscription blocks non-admin logins.
  // Trials past their end date are treated as expired. Active subscriptions
  // past their renewal date get a grace period of 3 days, then block.
  // "paused" subscriptions (Paystack auto-pause on failed retries) block immediately.
  // "past_due" subscriptions (failed payment, still retrying) get a warning.
  if (schoolRec && user.role !== "SUPER_ADMIN") {
    const billingStatus = schoolRec.subscriptionStatus || "trial";
    let billingExpired = false;
    let billingPaused = false;
    if (billingStatus === "expired" || billingStatus === "paused") {
      billingExpired = true;
      billingPaused = billingStatus === "paused";
    } else if (billingStatus === "trial" && schoolRec.trialEnd) {
      billingExpired = Date.now() > Date.parse(schoolRec.trialEnd);
    } else if (billingStatus === "active" && schoolRec.currentPeriodEnd) {
      const overdue = Date.now() - Date.parse(schoolRec.currentPeriodEnd);
      billingExpired = overdue > 3 * 24 * 60 * 60 * 1000; // 3-day grace
    }
    if (billingExpired) {
      return {
        ok: false,
        status: 402,
        error: billingPaused
          ? "This school's subscription has been paused due to failed payments. Please contact your school administrator to update the payment method."
          : "This school's subscription has expired. Please contact your school administrator to renew.",
        billingExpired: true,
      };
    }
  }
  if (schoolRec?.status === "deleted") {
    const graceOver =
      !schoolRec.deletedAt ||
      Date.parse(schoolRec.deletedAt) + (store.SCHOOL_DELETION_GRACE_MS || 30 * 24 * 60 * 60 * 1000) <= Date.now();
    if (graceOver) {
      await store.purgeSchool(user.schoolId).catch(() => {});
      return {
        ok: false,
        status: 403,
        error: "This school's account was permanently deleted. Please contact support if this is a mistake.",
      };
    }
    if (user.role !== "SUPER_ADMIN") {
      return {
        ok: false,
        status: 403,
        error: "This school's account has been deleted and can still be restored by the school administrator.",
      };
    }
  }

  return { ok: true };
}
