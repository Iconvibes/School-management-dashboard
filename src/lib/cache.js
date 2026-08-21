/**
 * Tiny shared cache for the hot reads that don't need to hit Mongo every time
 * (traffic audit §6.2/§6.3): the per-request auth snapshot and the admin
 * dashboard stats.
 *
 * Driver selection:
 *   - REDIS_URL set            -> Redis (get/set-with-TTL/del). Production:
 *                                 this is the shared cache across instances.
 *   - CACHE_MODE=memory        -> in-memory Map (dev/demo, and the test
 *                                 suite). Same JSON semantics as Redis so a
 *                                 driver swap never changes callers.
 *   - CACHE_MODE=off, or none  -> disabled: get -> null, set/del no-ops.
 *                                 The DEFAULT — without Redis there is no
 *                                 cache, and correctness-critical paths (the
 *                                 auth snapshot) stay exactly as they are
 *                                 today in demo/tests.
 *
 * Outage rule: a Redis error is a miss, never an exception — the caller
 * falls back to the store, exactly like the rate limiter (§6.1). Values are
 * JSON round-tripped in BOTH drivers so a cached object can never be
 * mutated through a reference the caller kept.
 */
import { createClient } from "redis";

const MODE = process.env.CACHE_MODE || "";
const USE_REDIS = !!process.env.REDIS_URL && MODE !== "off";
const USE_MEMORY = !USE_REDIS && MODE === "memory";

const redis = USE_REDIS ? createClient({ url: process.env.REDIS_URL }) : null;
if (redis) redis.connect().catch(() => {});

/** Memory driver — the Map lives only while CACHE_MODE=memory (dev/tests). */
const mem = new Map(); // key -> { expires, value } (expires = epoch ms)

/** Which driver is active — exposed for tests and log lines. */
export function cacheDriverName() {
  if (redis?.isReady) return "redis";
  if (USE_MEMORY) return "memory";
  return "off";
}

/** Test seam: clear the memory cache (each suite resets state in beforeEach). */
export function __resetCache() {
  mem.clear();
}

async function redisGet(key) {
  if (!redis?.isReady) return null;
  const raw = await redis.get(key);
  return raw == null ? null : JSON.parse(raw);
}

async function redisSet(key, value, ttlSeconds) {
  if (!redis?.isReady) return;
  // Jitter the TTL ±15% so cache expirations spread across a window
  // instead of clustering (thundering-herd prevention).
  const jittered = Math.round(ttlSeconds * (0.85 + Math.random() * 0.3));
  await redis.set(key, JSON.stringify(value), { EX: jittered });
}

async function redisDel(key) {
  if (!redis?.isReady) return;
  await redis.del(key);
}

async function redisDelMany(keys) {
  if (!redis?.isReady || !keys.length) return;
  await redis.del(keys);
}

// ── Request coalescing (thundering-herd protection) ──────────────
// When N requests miss the same cache key simultaneously, only ONE calls the
// fetcher; the others await the same in-flight Promise. This prevents a
// stampede of identical DB reads when a TTL expires for many users at once.
const inflight = new Map(); // key -> Promise<value>

/**
 * Get a cached value, or call fetchFn to populate it. Concurrent callers
 * for the same key share a single fetch — only one DB query fires.
 *
 * @param {string}   key          cache key
 * @param {Function} fetchFn      async () => value (called only on miss)
 * @param {number}   ttlSeconds   cache lifetime in seconds
 * @returns {Promise<*>} the value (from cache or fetcher), or null
 */
export async function cacheGetOrSet(key, fetchFn, ttlSeconds) {
  // Fast path: cached value exists.
  const cached = await cacheGet(key);
  if (cached !== null) return cached;

  // If another request is already fetching this key, piggyback on it.
  if (inflight.has(key)) return inflight.get(key);

  const promise = fetchFn()
    .then(async (value) => {
      if (value != null) await cacheSet(key, value, ttlSeconds);
      return value;
    })
    .catch(() => null)  // fetcher failure -> miss, not exception
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/**
 * Read a cached value.
 * @param {string} key
 * @returns {Promise<*>} the value, or null on miss / driver disabled / outage
 */
export async function cacheGet(key) {
  if (USE_MEMORY) {
    const entry = mem.get(key);
    if (!entry) return null;
    if (entry.expires <= Date.now()) {
      mem.delete(key);
      return null;
    }
    // Fresh copy per read — parity with the Redis driver, where every GET is
    // its own JSON.parse. A caller mutating what it got can't corrupt cache.
    return JSON.parse(JSON.stringify(entry.value));
  }
  try {
    return await redisGet(key);
  } catch {
    return null; // Redis hiccup -> miss, never a 500
  }
}

/**
 * Write a cached value.
 * @param {string} key
 * @param {*}      value      JSON-serializable
 * @param {number} ttlSeconds lifetime; 0 = expire immediately
 */
export async function cacheSet(key, value, ttlSeconds) {
  // Jitter the TTL ±15% so cache expirations spread across a window
  // instead of clustering at a single instant (thundering-herd prevention).
  // At 100k users with a 60s base TTL, expirations spread across a ~12s
  // window instead of all firing at once.
  const jittered = Math.round(ttlSeconds * (0.85 + Math.random() * 0.3));
  if (USE_MEMORY) {
    const fresh = JSON.parse(JSON.stringify(value)); // isolate from callers
    mem.set(key, { expires: Date.now() + jittered * 1000, value: fresh });
    return;
  }
  try {
    await redisSet(key, value, jittered);
  } catch {
    // Redis hiccup -> best-effort miss; the next read goes to the store.
  }
}

/** Remove one key (auth-snapshot invalidation on password/role change). */
export async function cacheDel(key) {
  if (USE_MEMORY) {
    mem.delete(key);
    return;
  }
  try {
    await redisDel(key);
  } catch {
    // Best-effort; the tokenVersion check in loadAuthSnapshot covers a missed DEL.
  }
}

/** Remove many keys (school freeze/restore/delete invalidates every user). */
export async function cacheDelMany(keys) {
  if (USE_MEMORY) {
    keys.forEach((k) => mem.delete(k));
    return;
  }
  try {
    await redisDelMany(keys);
  } catch {
    // Best-effort; cached entries expire on their own TTL regardless.
  }
}
