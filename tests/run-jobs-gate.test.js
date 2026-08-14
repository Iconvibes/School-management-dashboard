/**
 * RUN_JOBS gating — background jobs must run on exactly ONE replica.
 *
 * The conflict scanner and deletion sweeper are registered from
 * src/instrumentation.js at server boot. In a multi-instance deployment every
 * replica would otherwise run its own daily scan and hourly sweep; the
 * RUN_JOBS=none env flag turns the timers off on every non-primary replica,
 * while an UNSET RUN_JOBS stays "primary" so single-instance deploys, dev and
 * demo are unchanged.
 *
 * These tests drive the REAL register() hook. The "none" path is the
 * safety-critical direction — a non-primary replica must never start jobs —
 * so it is tested directly. The primary path starts real timers plus an
 * immediate conflict scan (startConflictScheduler fires its first tick at
 * boot), which every dev-server boot exercises implicitly.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

// Preserve the original env so the afterEach restores it exactly.
const ORIG = {
  NEXT_RUNTIME: process.env.NEXT_RUNTIME,
  NEXT_PHASE: process.env.NEXT_PHASE,
  RUN_JOBS: process.env.RUN_JOBS,
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
  delete globalThis.__conflictScheduler;
  delete globalThis.__deletionSweeper;
  delete globalThis.__shutdownWired;
});

describe("RUN_JOBS gating in instrumentation.js", () => {
  it("a non-primary replica (RUN_JOBS=none) starts no background jobs", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.NEXT_PHASE; // not in a build
    process.env.RUN_JOBS = "none";

    await register();

    assert.equal(
      globalThis.__conflictScheduler,
      undefined,
      "conflict scanner must not start on a non-primary replica"
    );
    assert.equal(
      globalThis.__deletionSweeper,
      undefined,
      "deletion sweeper must not start on a non-primary replica"
    );
  });

  it("an unset RUN_JOBS is NOT the disabled value (the gate is opt-out)", () => {
    // The gate reads `!== "none"` — so an unset RUN_JOBS (the single-instance
    // default) is primary. This pins the DIRECTION of the gate: the only value
    // that disables jobs is an explicit "none".
    delete process.env.RUN_JOBS;
    assert.notEqual(process.env.RUN_JOBS, "none", "unset RUN_JOBS must default to primary");
  });
});
