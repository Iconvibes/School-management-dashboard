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

/** Test seam: clear all buckets (each suite resets state in beforeEach). */
export function __resetRateLimits() {
  fallbackBuckets.clear();
  lastSweep = 0;
}

/** Test seam: close the Redis client (lets a suite exit cleanly). */
export function __redisDisconnect() {
  if (redis) redis.disconnect();
}

function tooMany(windowMs, retryAfterMs, max) {
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
 * @returns {Promise<Response|null>}
 */
export async function checkRateLimit({ request, windowMs, max, prefix = "rl", key = "" }) {
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
        const retryAfterMs = (slot + 1) * windowMs - now; // time left in this slot
        return tooMany(windowMs, retryAfterMs, max);
      }
      return null;
    } catch {
      // Redis hiccup (connection dropped mid-request): fall through to the
      // per-process map rather than fail the login/lead/register request.
    }
  }

  let entry = fallbackBuckets.get(bucketKey);
  if (!entry || now - entry.start >= entry.windowMs) {
    entry = { start: now, count: 0, windowMs };
    fallbackBuckets.set(bucketKey, entry);
  }

  if (entry.count >= max) {
    const retryAfterMs = entry.start + entry.windowMs - now;
    return tooMany(windowMs, retryAfterMs, max);
  }

  entry.count += 1;

  // Lazy sweep so a busy endpoint can't grow the map forever — time-throttled
  // so a large map never makes every request pay a full O(n) scan.
  if (fallbackBuckets.size >= SWEEP_AT && now - lastSweep >= SWEEP_INTERVAL) {
    lastSweep = now;
    for (const [k, e] of fallbackBuckets) {
      if (now - e.start >= e.windowMs) fallbackBuckets.delete(k);
    }
  }

  return null;
}
