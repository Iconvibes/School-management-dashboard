/**
 * Headless verification of the offline sync lifecycle.
 * Exercises: queueChange → getPendingChanges → markSynced → removeSynced,
 * cacheData → getCachedData → clearExpiredCache, getPendingSummary,
 * and the boolean-key fix (synced: 0/1 instead of false/true).
 *
 * Run: node --import ./tests/register-aliases.js tests/verify-offline-sync.mjs
 */
import assert from "node:assert/strict";
import "fake-indexeddb/auto";

import {
  queueChange,
  getPendingChanges,
  markSynced,
  removeSynced,
  cacheData,
  getCachedData,
  clearExpiredCache,
  getPendingSummary,
  getPendingCount,
  getSyncStatus,
  setSyncStatus,
  isOnline,
  __resetForTesting,
} from "../src/lib/offline-db.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n🔌 Boolean key fix (synced: 0/1)");
// ---------------------------------------------------------------------------

await asyncTest("synced=0 is a valid IndexedDB key", async () => {
  await __resetForTesting();
  const id = await queueChange({
    type: "attendance",
    endpoint: "/api/attendance",
    method: "POST",
    body: { classArm: "JSS1", date: "2026-08-23", rows: [] },
    description: "Boolean key test",
  });
  const pending = await getPendingChanges();
  const record = pending.find((c) => c.id === id);
  assert.equal(record.synced, 0, "synced should be 0 (not false)");
  assert.equal(typeof record.synced, "number", "synced must be a number, not boolean");
});

await asyncTest("markSynced sets synced=1 (not true)", async () => {
  await __resetForTesting();
  const id = await queueChange({
    type: "grade",
    endpoint: "/api/scores",
    method: "POST",
    body: {},
    description: "Mark synced test",
  });
  await markSynced(id);
  const pending = await getPendingChanges();
  assert.equal(pending.length, 0, "marked record should not appear in pending");
});

// ---------------------------------------------------------------------------
console.log("\n📦 Queue → Sync → Cleanup lifecycle");
// ---------------------------------------------------------------------------

await asyncTest("queue 3 changes, sync 2, verify 1 remains", async () => {
  await __resetForTesting();
  const id1 = await queueChange({ type: "a", endpoint: "/a", method: "POST", body: {} });
  const id2 = await queueChange({ type: "b", endpoint: "/b", method: "POST", body: {} });
  const id3 = await queueChange({ type: "c", endpoint: "/c", method: "POST", body: {} });

  let pending = await getPendingChanges();
  assert.equal(pending.length, 3, "should have 3 pending");

  await markSynced(id1);
  await markSynced(id2);

  pending = await getPendingChanges();
  assert.equal(pending.length, 1, "should have 1 pending after syncing 2");
  assert.equal(pending[0].id, id3, "remaining should be id3");
  assert.equal(pending[0].type, "c");
});

await asyncTest("removeSynced deletes the record entirely", async () => {
  await __resetForTesting();
  const id = await queueChange({ type: "d", endpoint: "/d", method: "POST", body: {} });
  await markSynced(id);
  await removeSynced(id);
  const count = await getPendingCount();
  assert.equal(count, 0, "should be 0 after removal");
});

await asyncTest("getPendingSummary groups by type", async () => {
  await __resetForTesting();
  await queueChange({ type: "attendance", endpoint: "/a", method: "POST", body: {} });
  await queueChange({ type: "attendance", endpoint: "/a", method: "POST", body: {} });
  await queueChange({ type: "grade", endpoint: "/g", method: "POST", body: {} });

  const summary = await getPendingSummary();
  assert.equal(summary.total, 3);
  assert.equal(summary.byType.attendance, 2);
  assert.equal(summary.byType.grade, 1);
});

// ---------------------------------------------------------------------------
console.log("\n💾 Cache operations");
// ---------------------------------------------------------------------------

await asyncTest("cacheData + getCachedData round-trip", async () => {
  await __resetForTesting();
  const data = { user: { id: "u1", name: "Alice", role: "TEACHER" } };
  await cacheData("session", data, 60000);
  const cached = await getCachedData("session");
  assert.deepEqual(cached, data, "cached data should match original");
});

await asyncTest("expired cache returns null", async () => {
  await cacheData("stale", { old: true }, -1); // already expired
  const cached = await getCachedData("stale");
  assert.equal(cached, null, "expired cache should return null");
});

await asyncTest("clearExpiredCache removes expired but keeps valid", async () => {
  await __resetForTesting();
  await cacheData("expired", { x: 1 }, -1);
  await cacheData("valid", { y: 2 }, 60000);

  await clearExpiredCache();

  assert.equal(await getCachedData("expired"), null, "expired should be gone");
  assert.deepEqual(await getCachedData("valid"), { y: 2 }, "valid should survive");
});

await asyncTest("cache overwrite (same key)", async () => {
  await cacheData("key", { v: 1 });
  await cacheData("key", { v: 2 });
  const cached = await getCachedData("key");
  assert.deepEqual(cached, { v: 2 }, "should have latest value");
});

// ---------------------------------------------------------------------------
console.log("\n🔄 Sync status");
// ---------------------------------------------------------------------------

await asyncTest("getSyncStatus returns null when unset", async () => {
  await __resetForTesting();
  const ts = await getSyncStatus("last-sync");
  assert.equal(ts, null);
});

await asyncTest("setSyncStatus + getSyncStatus round-trip", async () => {
  const now = Date.now();
  await setSyncStatus("last-sync", now);
  const ts = await getSyncStatus("last-sync");
  assert.equal(ts, now);
});

await asyncTest("setSyncStatus defaults to Date.now()", async () => {
  const before = Date.now();
  await setSyncStatus("auto");
  const ts = await getSyncStatus("auto");
  assert.ok(ts >= before && ts <= Date.now(), "timestamp should be between before and now");
});

// ---------------------------------------------------------------------------
console.log("\n🌐 isOnline");
// ---------------------------------------------------------------------------

test("isOnline returns falsy in Node.js (no navigator.onLine)", () => {
  const result = isOnline();
  assert.ok(!result, "isOnline() should be falsy in Node.js");
});

// ---------------------------------------------------------------------------
console.log("\n🔗 End-to-end: full offline→online→cleanup cycle");
// ---------------------------------------------------------------------------

await asyncTest("simulates a teacher going offline, marking attendance + grades, then syncing", async () => {
  await __resetForTesting();

  // 1. Teacher goes offline, marks attendance
  const attId = await queueChange({
    type: "attendance",
    endpoint: "/api/attendance",
    method: "POST",
    body: { classArm: "JSS1", date: "2026-08-23", rows: [{ studentId: "s1", present: true }] },
    description: "Mark attendance offline",
  });

  // 2. Teacher enters grades
  const gradeId = await queueChange({
    type: "grade",
    endpoint: "/api/scores",
    method: "POST",
    body: { classArm: "JSS1", subject: "Math", rows: [{ studentId: "s1", ca1: 15 }] },
    description: "Enter grades offline",
  });

  // 3. Verify both are pending
  let summary = await getPendingSummary();
  assert.equal(summary.total, 2, "should have 2 pending changes");
  assert.equal(summary.byType.attendance, 1);
  assert.equal(summary.byType.grade, 1);

  // 4. Cache some data for offline viewing
  await cacheData("students-JSS1", [{ id: "s1", name: "Alice" }], 60000);
  const cached = await getCachedData("students-JSS1");
  assert.equal(cached.length, 1, "cached student data should be available");

  // 5. Internet returns — sync attendance first
  await markSynced(attId);
  summary = await getPendingSummary();
  assert.equal(summary.total, 1, "should have 1 pending after syncing attendance");
  assert.equal(summary.byType.grade, 1);

  // 6. Sync grades
  await markSynced(gradeId);
  summary = await getPendingSummary();
  assert.equal(summary.total, 0, "should have 0 pending after full sync");
  assert.deepEqual(summary.byType, {}, "byType should be empty");

  // 7. Cleanup
  await removeSynced(attId);
  await removeSynced(gradeId);
  assert.equal(await getPendingCount(), 0, "count should be 0 after cleanup");

  // 8. Cached data is still available
  const stillCached = await getCachedData("students-JSS1");
  assert.equal(stillCached.length, 1, "cache should survive sync cleanup");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All verifications passed ✅\n");
}
