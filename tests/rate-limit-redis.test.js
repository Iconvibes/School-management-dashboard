/**
 * Redis-backed checkRateLimit — outage behavior.
 *
 * This file runs in its OWN process (node --test spawns one per file), so the
 * REDIS_URL set below binds at import time: the module sees a configured
 * Redis that is unreachable (port 1 — nothing listens there). The guarantee
 * under test: a Redis outage must NEVER fail the login/lead/register request
 * — the limiter falls back to the per-process map instead of throwing.
 *
 * The live-Redis path itself (incr + expire on a fixed window slot) is
 * exercised in the deployment load test; without a Redis server on the
 * machine it cannot be integration-tested here.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

// Configure Redis BEFORE the module import binds its client.
process.env.REDIS_URL = "redis://127.0.0.1:1"; // connection refused / unreachable

const { checkRateLimit, __resetRateLimits, __redisDisconnect } = await import("../src/lib/rate-limit.js");

after(() => {
  __redisDisconnect(); // no lingering client handles — lets the process exit
});

describe("checkRateLimit with Redis configured but down", () => {
  it("falls back to the in-memory map instead of throwing", async () => {
    __resetRateLimits();
    const req = () => new Request("http://localhost/x", { method: "POST" });

    // If the Redis path threw, this would reject — it must resolve null.
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit({ request: req(), windowMs: 60000, max: 5, prefix: "t", key: "a" });
      assert.equal(r, null);
    }
    // The fallback map still enforces the limit (429 at the 6th call).
    const blocked = await checkRateLimit({ request: req(), windowMs: 60000, max: 5, prefix: "t", key: "a" });
    assert.equal(blocked?.status, 429);
  });
});
