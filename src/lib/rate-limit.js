/**
 * Minimal fixed-window in-memory rate limiter for public endpoints.
 *
 * Deliberate trade-offs:
 * - In-memory, per-process state: right for a single-instance deployment and
 *   for demo mode. For a multi-instance production setup, swap the bucket map
 *   for a shared cache (e.g. Redis) behind the same checkRateLimit() interface.
 * - The client IP is read from `x-forwarded-for` (set by the hosting proxy),
 *   then `x-real-ip`, then falls back to "local". Trusting these headers
 *   assumes a correctly configured reverse proxy strips user-supplied values.
 */

const buckets = new Map();
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

/**
 * Enforce a fixed-window limit for the request's IP.
 *
 * Returns a 429 Response when the limit is hit (body shaped like jsonError,
 * plus a standard `Retry-After` header), otherwise returns null so the route
 * can continue. Usage in a route handler:
 *
 *   const limited = checkRateLimit({ request, windowMs: 15 * 60 * 1000, max: 10, prefix: "auth-login" });
 *   if (limited) return limited;
 *
 * @param {Object}   opts
 * @param {Request}  opts.request   Next.js route-handler request
 * @param {number}   opts.windowMs  window length in milliseconds
 * @param {number}   opts.max       max requests per IP per window
 * @param {string}   [opts.prefix]  namespaced bucket key (e.g. "auth-login")
 * @returns {Response|null}
 */
export function checkRateLimit({ request, windowMs, max, prefix = "rl" }) {
  const now = Date.now();
  const key = `${prefix}:${clientIp(request)}`;

  let entry = buckets.get(key);
  if (!entry || now - entry.start >= entry.windowMs) {
    entry = { start: now, count: 0, windowMs };
    buckets.set(key, entry);
  }

  if (entry.count >= max) {
    const retryAfter = Math.max(1, Math.ceil((entry.start + entry.windowMs - now) / 1000));
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

  entry.count += 1;

  // Lazy sweep so a busy endpoint can't grow the map forever — time-throttled
  // so a large map never makes every request pay a full O(n) scan.
  if (buckets.size >= SWEEP_AT && now - lastSweep >= SWEEP_INTERVAL) {
    lastSweep = now;
    for (const [k, e] of buckets) {
      if (now - e.start >= e.windowMs) buckets.delete(k);
    }
  }

  return null;
}
