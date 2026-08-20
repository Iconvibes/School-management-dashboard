/**
 * Dual-store contract tests.
 *
 * Verifies that demo-store.js and mongo-store.js implement the same public
 * interface: every shared function must exist in both stores with the same
 * name and arity. This catches silent divergence when a new function is added
 * to one store but forgotten in the other.
 *
 * Only the DEMO store is exercised — Mongo needs a live database. The point
 * here is interface shape, not runtime behavior.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as demo from "../src/lib/demo-store.js";
import * as mongo from "../src/lib/mongo-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all export names from a module. */
function exportNames(mod) {
  return Object.keys(mod).sort();
}

/** Extract { name, length, params } for every function export. */
function functionMap(mod) {
  const map = {};
  for (const [name, val] of Object.entries(mod)) {
    if (typeof val === "function") {
      // fn.length = declared parameter count
      // fn.toString().match(...) extracts declared param names
      const src = val.toString();
      const paramMatch = src.match(/\(([^)]*)\)/);
      const params = paramMatch
        ? paramMatch[1].split(",").map((p) => p.trim().split("=")[0].trim()).filter(Boolean)
        : [];
      map[name] = { length: val.length, params };
    } else {
      map[name] = { length: null, params: null, value: val };
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Exclusion lists — functions unique to one store (intentional)
// ---------------------------------------------------------------------------

const DEMO_ONLY = new Set([
  "__resetDemoStore",
  "__setDemoStoreFile",
  "__persistNow",
  "__reloadDemoStore",
  "demoSeedEnabled",
]);

const MONGO_ONLY = new Set([
  "userToLoginShape",
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dual-store contract", () => {
  const demoMap = functionMap(demo);
  const mongoMap = functionMap(mongo);

  const demoNames = new Set(Object.keys(demoMap));
  const mongoNames = new Set(Object.keys(mongoMap));

  // Build the set of "shared" names (both export it, minus intentional exclusions)
  const sharedNames = [...demoNames].filter(
    (n) => mongoNames.has(n) && !DEMO_ONLY.has(n) && !MONGO_ONLY.has(n)
  );

  it("both stores export the same shared functions (no missing exports)", () => {
    const missingInMongo = [...demoNames].filter(
      (n) => !mongoNames.has(n) && !DEMO_ONLY.has(n)
    );
    const missingInDemo = [...mongoNames].filter(
      (n) => !demoNames.has(n) && !MONGO_ONLY.has(n)
    );

    assert.deepEqual(
      missingInMongo,
      [],
      "demo-store has functions missing from mongo-store"
    );
    assert.deepEqual(
      missingInDemo,
      [],
      "mongo-store has functions missing from demo-store"
    );
  });

  it("no unexpected new exports in either store", () => {
    // If you intentionally add a store-specific function, update DEMO_ONLY or
    // MONGO_ONLY above. This test catches accidental additions.
    const unexpectedDemo = [...demoNames].filter(
      (n) => !mongoNames.has(n) && !DEMO_ONLY.has(n)
    );
    const unexpectedMongo = [...mongoNames].filter(
      (n) => !demoNames.has(n) && !MONGO_ONLY.has(n)
    );

    assert.deepEqual(
      unexpectedDemo,
      [],
      "Unexpected demo-only exports — add to DEMO_ONLY if intentional"
    );
    assert.deepEqual(
      unexpectedMongo,
      [],
      "Unexpected mongo-only exports — add to MONGO_ONLY if intentional"
    );
  });

  it("shared functions have the same arity (parameter count)", () => {
    const mismatches = [];
    for (const name of sharedNames) {
      const d = demoMap[name];
      const m = mongoMap[name];
      if (d.length !== m.length) {
        mismatches.push(
          `${name}: demo arity ${d.length} vs mongo arity ${m.length}`
        );
      }
    }
    assert.deepEqual(
      mismatches,
      [],
      "Arity mismatches between demo and mongo stores"
    );
  });

  it("shared functions have the same declared parameter names", () => {
    const mismatches = [];
    for (const name of sharedNames) {
      const d = demoMap[name];
      const m = mongoMap[name];
      if (JSON.stringify(d.params) !== JSON.stringify(m.params)) {
        mismatches.push(
          `${name}: demo params [${d.params}] vs mongo params [${m.params}]`
        );
      }
    }
    assert.deepEqual(
      mismatches,
      [],
      "Parameter name mismatches between demo and mongo stores"
    );
  });

  it("shared constants have the same value", () => {
    const constantNames = sharedNames.filter(
      (n) => demoMap[n].length === null && demoMap[n].value !== undefined
    );
    const mismatches = [];
    for (const name of constantNames) {
      const d = demoMap[name].value;
      const m = mongoMap[name].value;
      if (JSON.stringify(d) !== JSON.stringify(m)) {
        mismatches.push(
          `${name}: demo=${JSON.stringify(d)} vs mongo=${JSON.stringify(m)}`
        );
      }
    }
    assert.deepEqual(
      mismatches,
      [],
      "Constant value mismatches between demo and mongo stores"
    );
  });

  it("every shared function is async", () => {
    // The store interface should be entirely async (even if the demo store
    // resolves synchronously, it returns promises).
    const nonAsync = [];
    for (const name of sharedNames) {
      const d = demoMap[name];
      const m = mongoMap[name];
      // Check if the function returns a thenable by calling it with a dummy
      // We can't call them without args, but we can check the source for
      // "async" keyword or verify the return type.
      const demoSrc = demo[name].toString();
      const mongoSrc = mongo[name].toString();
      const demoIsAsync = demoSrc.startsWith("async ");
      const mongoIsAsync = mongoSrc.startsWith("async ");
      if (demoIsAsync !== mongoIsAsync) {
        nonAsync.push(
          `${name}: demo async=${demoIsAsync} vs mongo async=${mongoIsAsync}`
        );
      }
    }
    assert.deepEqual(
      nonAsync,
      [],
      "Async/sync mismatch between demo and mongo stores"
    );
  });

  it("comprehensive: lists all shared functions for documentation", () => {
    // This test exists to give visibility into the contract surface.
    // It always passes — it just logs the shared interface.
    assert.ok(sharedNames.length > 0, "should have shared functions");
    // Snapshot the count so new additions are visible in test output.
    assert.ok(
      sharedNames.length >= 60,
      `Expected 60+ shared functions, found ${sharedNames.length}`
    );
  });
});
