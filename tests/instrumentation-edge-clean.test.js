/**
 * Regression guard: instrumentation.js must stay Edge-compatible.
 *
 * Next's dev server statically checks instrumentation.js against the Edge
 * runtime and warns on Node-only APIs there. A bare `process.on("SIGTERM", …)`
 * made it re-emit "A Node.js API is used (process.on) … not supported in the
 * Edge Runtime" on every compile — 83,000+ log lines under the k6 storm,
 * drowning real errors and costing measurable throughput.
 *
 * The graceful-shutdown wiring lives in src/lib/shutdown.js, which
 * instrumentation dynamically imports ONLY inside its `NEXT_RUNTIME ===
 * "nodejs"` branch — so the Edge bundle never contains it. These assertions
 * fail the suite if Node-only API calls (or even prose mentioning them, which
 * is the honest way to document them) ever move back into instrumentation.js.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const INSTRUMENTATION = readFileSync(
  new URL("../src/instrumentation.js", import.meta.url),
  "utf8"
);
const SHUTDOWN = readFileSync(
  new URL("../src/lib/shutdown.js", import.meta.url),
  "utf8"
);

// Any `process.<member>` other than `process.env` — in CODE or comments.
// `process.env` is the only `process.*` reference the Edge polyfill supports.
const NODE_ONLY_PROCESS_MEMBERS = /process\.(?!env\b)[A-Za-z_$][\w$]*/g;

describe("instrumentation.js stays Edge-compatible", () => {
  it("contains no Node-only process.* API reference (the warning-flood cause)", () => {
    const offenders = INSTRUMENTATION.match(NODE_ONLY_PROCESS_MEMBERS) || [];
    assert.deepEqual(
      offenders,
      [],
      "instrumentation.js may only reference process.env — found: " +
        offenders.join(", ") +
        " (move Node-only work to a dynamically imported module like src/lib/shutdown.js)"
    );
  });

  it("uses no CommonJS require() (also statically flagged for Edge)", () => {
    assert.doesNotMatch(INSTRUMENTATION, /\brequire\s*\(/);
  });

  it("still reads its guard-rail env vars (the check must not over-strip)", () => {
    assert.match(INSTRUMENTATION, /process\.env\.NEXT_RUNTIME/);
    assert.match(INSTRUMENTATION, /process\.env\.NEXT_PHASE/);
    assert.match(INSTRUMENTATION, /process\.env\.RUN_JOBS/);
  });

  it("wires graceful shutdown through the Node-only module instead", () => {
    // The fix is present (not just the absence): instrumentation dynamically
    // imports the shutdown module, and the SIGTERM handler lives THERE.
    assert.match(INSTRUMENTATION, /await import\("@\/lib\/shutdown"\)/);
    assert.match(INSTRUMENTATION, /wireShutdown\(\)/);
    assert.match(SHUTDOWN, /process\.on\("SIGTERM"/);
    assert.match(SHUTDOWN, /export function wireShutdown/);
  });
});
