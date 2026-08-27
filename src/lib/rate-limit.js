/**
 * Fixed-window rate limiter for public endpoints — Redis-backed, with an
 * in-memory fallback for demo/dev and Redis outages.
 *
 * When REDIS_URL is set, buckets live in Redis (incr + expire on a fixed
 * window slot), so the budgets are SHARED across every app instance — N
 * servers can no longer multiply an attacker's budget by N, and one school's
 * scripted attack can't burn the shared budget for other tenants (per-school
 * buckets in the login route). When REDIS_URL is unset — demo mode, tests,
 * single-instance deploys — a per-process Map provides the same interface.
 *
 * The client IP is read from `x-forwarded-for` (set by the hosting proxy),
 * then `x-real-ip`, then falls back to "local". Trusting these headers
 * assumes a correctly configured reverse proxy strips user-supplied values.
 */
import { createClient } from "redis";

// Lazy: no connection attempt at all when Redis isn't configured. A failed
// connect logs nothing and leaves `redis` unusable — every request falls
// back to the in-memory map rather than 500ing.
const redis = process.env.REDIS_URL ? createClient({ url: process.env.REDIS_URL }) : null;
if (redis) redis.connect().catch(() => {});

// In-memory fallback buckets (demo/dev/tests, and Redis outages).
const fallbackBuckets = new Map();
// Hard lockouts (1h blocks after repeated failures) — a SEPARATE map so a
// lockout survives its window slot rotating. Mirrors the Redis lockout key.
const lockouts = new Map(); // bucketKey -> until (ms epoch)
// IP-independent account lockouts - survives IP rotation.
const accountLockouts = new Map(); // accountKey -> { until, count }
const SWEEP_AT = 2000; // prune expired entries once the map grows this large
const SWEEP_INTERVAL = 60 * 1000; // …but at most once per minute, so the sweep stays amortized
let lastSweep = 0;

function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

/** Test seam: clear all buckets and lockouts (each suite resets state). */
export function __resetRateLimits() {
  fallbackBuckets.clear();
  lockouts.clear();
  accountLockouts.clear();
  lastSweep = 0;
}

/** Test seam: close the Redis client (lets a suite exit cleanly). */
export function __redisDisconnect() {
  if (redis) redis.disconnect();
}

function tooMany(retryAfterMs, max) {
  const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return Response.json(
    { error: "Too many requests. Please try again later.", retryAfter },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(max),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}

/**
 * Is this (IP[, key]) bucket currently hard-locked? Returns the remaining
 * lockout seconds (rounded up, ≥ 1) when locked, otherwise 0.
 * Redis-backed when REDIS_URL is set, in-memory otherwise.
 */
export async function isLockedOut({ request, prefix = "rl", key = "" }) {
  const bucketKey = key ? `${prefix}:${clientIp(request)}:${key}` : `${prefix}:${clientIp(request)}`;

  if (redis?.isReady) {
    try {
      const exists = await redis.exists(`${bucketKey}:lockout`);
      if (!exists) return 0;
      const ttl = await redis.ttl(`${bucketKey}:lockout`);
      return ttl > 0 ? ttl : 1;
    } catch {
      // Redis hiccup: fall through to the in-memory map.
    }
  }

  const until = lockouts.get(bucketKey);
  if (!until) return 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Enforce a fixed-window limit for the request's IP (plus an optional second
 * dimension that compounds with the IP — e.g. an account or school id — so
 * one account's failures never lock out the rest of the school).
 *
 * Returns a 429 Response when the limit is hit, otherwise null so the route
 * can continue. Usage in a route handler:
 *
 *   const limited = await checkRateLimit({ request, windowMs: 15 * 60 * 1000, max: 10, prefix: "auth-login" });
 *   if (limited) return limited;
 *
 * @param {Object}   opts
 * @param {Request}  opts.request   Next.js route-handler request
 * @param {number}   opts.windowMs  window length in milliseconds
 * @param {number}   opts.max       max requests per (IP[, key]) per window
 * @param {string}   [opts.prefix]  namespaced bucket key (e.g. "auth-login")
 * @param {string}   [opts.key]     optional SECOND dimension that compounds
 *                                  with the IP (e.g. an account or school id)
 * @param {number}   [opts.lockoutMs] when the limit is exceeded, hard-block
 *                                  this (IP[, key]) bucket for lockoutMs —
 *                                  survives the window rotating, and is
 *                                  checked by isLockedOut() before any work
 *                                  (e.g. before bcrypt) so a locked account
 *                                  costs nothing to reject.
 * @returns {Promise<Response|null>}
 */
export async function checkRateLimit({ request, windowMs, max, prefix = "rl", key = "", lockoutMs = 0 }) {
  const now = Date.now();
  const base = `${prefix}:${clientIp(request)}`;
  const bucketKey = key ? `${base}:${key}` : base;

  if (redis?.isReady) {
    try {
      // Fixed window: the slot index derives from the clock, so different
      // instances agree on the same bucket for the same moment. incr is
      // atomic — a concurrent burst can never double-count or race.
      const slot = Math.floor(now / windowMs);
      const rk = `${bucketKey}:${slot}`;
      const count = await redis.incr(rk);
      if (count === 1) await redis.expire(rk, Math.ceil(windowMs / 1000));
      if (count > max) {
        // Hard lockout (e.g. 1h after 10 failed logins) — a separate key so
        // it outlives this window slot.
        if (lockoutMs > 0) {
          await redis.set(`${bucketKey}:lockout`, "1", { EX: Math.ceil(lockoutMs / 1000) });
        }
        const retryAfterMs = (slot + 1) * windowMs - now; // time left in this slot
        return tooMany(retryAfterMs, max);
      }
      return null;
    } catch {
      // Redis hiccup (connection dropped mid-request): fall through to the
      // per-process map rather than fail the login/lead/register request.
    }
  }

  // An active hard lockout beats everything — even a fresh window slot.
  const lockedUntil = lockouts.get(bucketKey);
  if (lockedUntil && lockedUntil > now) {
    return tooMany(lockedUntil - now, max);
  }

  let entry = fallbackBuckets.get(bucketKey);
  if (!entry || now - entry.start >= entry.windowMs) {
    entry = { start: now, count: 0, windowMs };
    fallbackBuckets.set(bucketKey, entry);
  }

  if (entry.count >= max) {
    if (lockoutMs > 0) lockouts.set(bucketKey, now + lockoutMs);
    const retryAfterMs = entry.start + entry.windowMs - now;
    return tooMany(retryAfterMs, max);
  }

  entry.count += 1;

  // Lazy sweep so a busy endpoint can't grow the maps forever — time-throttled
  // so a large map never makes every request pay a full O(n) scan.
  if (fallbackBuckets.size + lockouts.size >= SWEEP_AT && now - lastSweep >= SWEEP_INTERVAL) {
    lastSweep = now;
    for (const [k, e] of fallbackBuckets) {
      if (now - e.start >= e.windowMs) fallbackBuckets.delete(k);
    }
    for (const [k, until] of lockouts) {
      if (until <= now) lockouts.delete(k);
    }
  }

  return null;
}

/**
 * IP-independent account rate limit — catches distributed brute-force attacks
 * where an attacker rotates source IPs to bypass per-IP buckets.
 *
 * The bucket key is purely the account identifier (email/name + school), so
 * failures from ANY IP count toward the same limit. Uses escalating backoff:
 * the first lockout lasts 10 minutes, the second 30 minutes, then 1 hour.
 *
 * This is deliberately more lenient than the per-IP buckets (30 failures vs
 * 10-20) to reduce false positives from legitimate users on shared networks
 * (NAT, VPNs, corporate proxies). The trade-off is intentional per P1.4's
 * security review: a distributed attack against one account is caught, but a
 * single-IP targeted attack is still caught by the tighter per-IP account
 * bucket (10 failures -> 1h lockout).
 *
 * @param {Object}  opts
 * @param {string}  opts.accountKey  account identifier (email/name + school)
 * @param {number}  [opts.windowMs]  window length (default 15 min)
 * @param {number}  [opts.max]       max failures per window (default 30)
 * @param {string}  [opts.prefix]    bucket prefix (default "auth-account")
 * @returns {Promise<Response|null>}  429 Response when limit hit, null otherwise
 */
export async function checkAccountRateLimit({
  accountKey,
  windowMs = 15 * 60 * 1000,
  max = 30,
  prefix = "auth-account",
}) {
  if (!accountKey) return null;
  const now = Date.now();
  const bucketKey = `${prefix}:${accountKey}`;

  // -- Escalating lockout check --
  const lock = accountLockouts.get(bucketKey);
  if (lock && lock.until > now) {
    const retryAfterMs = lock.until - now;
    const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return Response.json(
      { error: "Too many failed attempts for this account. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter), "X-RateLimit-Limit": String(max), "X-RateLimit-Remaining": "0" } }
    );
  }

  // -- Fixed window count --
  let entry = fallbackBuckets.get(bucketKey);
  if (!entry || now - entry.start >= entry.windowMs) {
    entry = { start: now, count: 0, windowMs };
    fallbackBuckets.set(bucketKey, entry);
  }

  if (entry.count >= max) {
    // Escalating lockout: 10min -> 30min -> 1h (cap)
    const LOCKOUT_TIERS = [10, 30, 60]; // minutes
    const prevCount = lock ? lock.count : 0;
    const tier = Math.min(prevCount, LOCKOUT_TIERS.length - 1);
    const lockoutMs = LOCKOUT_TIERS[tier] * 60 * 1000;
    accountLockouts.set(bucketKey, { until: now + lockoutMs, count: prevCount + 1 });
    const retryAfterMs = entry.start + entry.windowMs - now;
    const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return Response.json(
      { error: "Too many failed attempts for this account. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter), "X-RateLimit-Limit": String(max), "X-RateLimit-Remaining": "0" } }
    );
  }

  entry.count += 1;
  return null;
}


/**
 * Check if an account is globally locked out (IP-independent).
 * Used as a pre-check before bcrypt so a locked account costs nothing.
 *
 * @param {Object} opts
 * @param {string} opts.accountKey  account identifier (email/name + school)
 * @param {string} [opts.prefix]    bucket prefix (default "auth-account")
 * @returns {Promise<number>}  remaining lockout seconds (>= 1) or 0
 */
export async function isAccountLockedOut({ accountKey, prefix = "auth-account" }) {
  if (!accountKey) return 0;
  const bucketKey = `${prefix}:${accountKey}`;
  const lock = accountLockouts.get(bucketKey);
  if (!lock) return 0;
  const remaining = Math.ceil((lock.until - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

