/**
 * P0.1 — JWT_SECRET boot check regression guard.
 *
 * src/instrumentation.js must throw at boot when NODE_ENV=production and
 * JWT_SECRET is unset. Without this check, src/lib/token.js falls back to
 * a hardcoded dev literal — sessions become forgeable by anyone who reads
 * the source code.
 *
 * These tests drive the REAL register() hook, following the same pattern
 * as tests/run-jobs-gate.test.js.
 *
 * NOTE: the JWT_SECRET check in instrumentation.js comes AFTER the REDIS_URL
 * and DATA_ENC_KEY checks, so those must be set to pass through to the
 * JWT_SECRET validation. We also set RUN_JOBS=none to avoid starting real
 * background timers in the test.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

// Preserve originals so afterEach can restore them.
const ORIG = {
  NEXT_RUNTIME: process.env.NEXT_RUNTIME,
  NEXT_PHASE: process.env.NEXT_PHASE,
  RUN_JOBS: process.env.RUN_JOBS,
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  REDIS_URL: process.env.REDIS_URL,
  DATA_ENC_KEY: process.env.DATA_ENC_KEY,
};

const { register } = await import("../src/instrumentation.js");

afterEach(() => {
  const setOrDelete = (k, v) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  setOrDelete("NEXT_RUNTIME", ORIG.NEXT_RUNTIME);
  setOrDelete("NEXT_PHASE", ORIG.NEXT_PHASE);
  setOrDelete("RUN_JOBS", ORIG.RUN_JOBS);
  setOrDelete("NODE_ENV", ORIG.NODE_ENV);
  setOrDelete("JWT_SECRET", ORIG.JWT_SECRET);
  setOrDelete("REDIS_URL", ORIG.REDIS_URL);
  setOrDelete("DATA_ENC_KEY", ORIG.DATA_ENC_KEY);
  delete globalThis.__conflictScheduler;
  delete globalThis.__deletionSweeper;
  delete globalThis.__shutdownWired;
});

describe("JWT_SECRET boot check in instrumentation.js", () => {
  it("throws when NODE_ENV=production and JWT_SECRET is unset", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.NEXT_PHASE;
    process.env.NODE_ENV = "production";
    process.env.RUN_JOBS = "none"; // skip background jobs for this test
    // Set the OTHER required secrets so we reach the JWT_SECRET check.
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.DATA_ENC_KEY = "test-enc-key";
    delete process.env.JWT_SECRET;

    await assert.rejects(
      () => register(),
      {
        message: /JWT_SECRET is required in production/,
      },
      "register() must throw when JWT_SECRET is missing in production"
    );
  });

  it("does NOT throw when JWT_SECRET is set in production", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.NEXT_PHASE;
    process.env.NODE_ENV = "production";
    process.env.RUN_JOBS = "none";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.DATA_ENC_KEY = "test-enc-key";
    process.env.JWT_SECRET = "a-real-secret-for-testing";

    // Should not throw — all secrets are present.
    // Use NEXT_RUNTIME !== nodejs to skip the dynamic imports that need
    // the @/ alias (which is a Next.js bundler feature, not available in bare node).
    process.env.NEXT_RUNTIME = "edge";
    await register();
  });
});
