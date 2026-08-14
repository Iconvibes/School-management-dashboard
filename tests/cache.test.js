/**
 * Cache facade — memory driver (CACHE_MODE=memory).
 *
 * This file runs in its OWN process (node --test spawns one per file), so the
 * CACHE_MODE set below binds at import time. The memory driver must behave
 * exactly like the Redis driver — JSON round-trip semantics, TTL expiry,
 * cacheDel / cacheDelMany — so a driver swap never changes callers.
 *
 * The "off" default (no REDIS_URL, no CACHE_MODE) is the state every other
 * test file runs under and is pinned in cache-default-off.test.js.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.CACHE_MODE = "memory";

const { cacheGet, cacheSet, cacheDel, cacheDelMany, __resetCache, cacheDriverName } =
  await import("../src/lib/cache.js");

beforeEach(() => {
  __resetCache();
});

describe("cache (memory driver)", () => {
  it("active driver is memory", () => {
    assert.equal(cacheDriverName(), "memory");
  });

  it("round-trips JSON values and isolates them from callers", async () => {
    const payload = { role: "STUDENT", schoolId: "s1", tokenVersion: 0, arms: ["JSS1"] };
    await cacheSet("auth:u1", payload, 60);

    const got = await cacheGet("auth:u1");
    assert.deepEqual(got, payload);

    // Mutating the returned object must not corrupt the cached copy.
    got.role = "HACKED";
    got.arms.push("SS3");
    const again = await cacheGet("auth:u1");
    assert.equal(again.role, "STUDENT", "cached value is a fresh copy");
    assert.deepEqual(again.arms, ["JSS1"]);
  });

  it("returns null for a missing key and after cacheDel", async () => {
    assert.equal(await cacheGet("nope"), null);
    await cacheSet("auth:u2", { v: 1 }, 60);
    await cacheDel("auth:u2");
    assert.equal(await cacheGet("auth:u2"), null);
  });

  it("cacheDelMany removes every listed key, leaves others", async () => {
    await cacheSet("auth:a", { v: 1 }, 60);
    await cacheSet("auth:b", { v: 2 }, 60);
    await cacheSet("auth:c", { v: 3 }, 60);
    await cacheDelMany(["auth:a", "auth:c"]);
    assert.equal(await cacheGet("auth:a"), null);
    assert.deepEqual(await cacheGet("auth:b"), { v: 2 });
    assert.equal(await cacheGet("auth:c"), null);
  });

  it("expires entries after their TTL (0 = immediately)", async () => {
    await cacheSet("auth:u3", { v: 1 }, 0);
    assert.equal(await cacheGet("auth:u3"), null, "zero TTL must not be readable");

    await cacheSet("auth:u4", { v: 2 }, 60);
    assert.deepEqual(await cacheGet("auth:u4"), { v: 2 });
    // A second write with TTL 0 overwrites and expires the entry.
    await cacheSet("auth:u4", { v: 3 }, 0);
    assert.equal(await cacheGet("auth:u4"), null);
  });
});
