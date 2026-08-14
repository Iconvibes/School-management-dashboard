/**
 * Cache facade — the DEFAULT driver is "off".
 *
 * No REDIS_URL and no CACHE_MODE (the state every other test file runs
 * under) must mean "no caching": cacheGet -> null, cacheSet/cacheDel are
 * safe no-ops. This is what keeps the existing suite's revocation, freeze
 * and role-change tests running against the live store exactly as before.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Deliberately NOT setting CACHE_MODE or REDIS_URL in this process.
const { cacheGet, cacheSet, cacheDel, cacheDriverName } = await import("../src/lib/cache.js");

describe("cache (default)", () => {
  it("driver is off when neither REDIS_URL nor CACHE_MODE is set", () => {
    assert.equal(cacheDriverName(), "off");
  });

  it("off driver: get returns null and writes are safe no-ops", async () => {
    await cacheSet("auth:u1", { role: "STUDENT" }, 60);
    assert.equal(await cacheGet("auth:u1"), null);
    await cacheDel("auth:u1"); // must not throw
    assert.equal(await cacheGet("auth:u1"), null);
  });
});
