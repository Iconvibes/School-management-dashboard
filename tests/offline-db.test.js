/**
 * Tests for src/lib/offline-db.js — the IndexedDB-backed offline sync layer.
 *
 * Covers:
 *   - queueChange / getPendingChanges / markSynced / removeSynced
 *   - cacheData / getCachedData / clearExpiredCache
 *   - getPendingSummary / getPendingCount
 *   - getSyncStatus / setSyncStatus
 *   - isOnline
 *
 * Uses fake-indexeddb to simulate the browser IndexedDB API in Node.js.
 */
import { describe, it, beforeEach } from "node:test";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wipe the offline DB so each test starts clean. */
async function resetDB() {
  await __resetForTesting();
}

/** Queue a sample change and return its ID. */
async function queueSample(overrides = {}) {
  return queueChange({
    type: "attendance",
    endpoint: "/api/attendance",
    method: "POST",
    body: { classArm: "JSS1", date: "2026-08-22", rows: [] },
    description: "Test attendance",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("offline-db", () => {
  beforeEach(async () => {
    await resetDB();
  });

  // ---- Queue & pending changes -------------------------------------------

  describe("queueChange", () => {
    it("returns an auto-incremented ID", async () => {
      const id1 = await queueSample();
      const id2 = await queueSample({ type: "grade" });
      assert.ok(typeof id1 === "number" || typeof id1 === "string");
      assert.notEqual(id1, id2, "each queued change gets a unique ID");
    });

    it("stores all fields from the change object", async () => {
      const id = await queueSample({
        type: "grade",
        endpoint: "/api/scores",
        method: "POST",
        body: { studentId: "s1", score: 85 },
        description: "Grade s1",
      });

      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);
      assert.ok(record, "queued record is retrievable");
      assert.equal(record.type, "grade");
      assert.equal(record.endpoint, "/api/scores");
      assert.equal(record.method, "POST");
      assert.deepEqual(record.body, { studentId: "s1", score: 85 });
      assert.equal(record.description, "Grade s1");
    });

    it("sets synced=0 and retryCount=0 by default", async () => {
      const id = await queueSample();
      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);
      assert.equal(record.synced, 0);
      assert.equal(record.retryCount, 0);
    });

    it("sets a numeric timestamp", async () => {
      const before = Date.now();
      const id = await queueSample();
      const after = Date.now();
      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);
      assert.ok(record.timestamp >= before && record.timestamp <= after);
    });
  });

  describe("getPendingChanges", () => {
    it("returns empty array when nothing is queued", async () => {
      const pending = await getPendingChanges();
      assert.deepEqual(pending, []);
    });

    it("returns only unsynced changes", async () => {
      const id1 = await queueSample({ type: "attendance" });
      const id2 = await queueSample({ type: "grade" });
      await markSynced(id1);

      const pending = await getPendingChanges();
      assert.equal(pending.length, 1);
      assert.equal(pending[0].id, id2);
    });

    it("returns multiple unsynced changes", async () => {
      await queueSample({ type: "a" });
      await queueSample({ type: "b" });
      await queueSample({ type: "c" });

      const pending = await getPendingChanges();
      assert.equal(pending.length, 3);
    });
  });

  // ---- Mark synced / remove ----------------------------------------------

  describe("markSynced", () => {
    it("sets synced=1 on the record so it no longer appears in pending", async () => {
      const id = await queueSample();
      await markSynced(id);

      const pending = await getPendingChanges();
      assert.equal(pending.length, 0);
    });

    it("is a no-op for a non-existent ID", async () => {
      await queueSample();
      await markSynced(99999); // doesn't exist
      const pending = await getPendingChanges();
      assert.equal(pending.length, 1); // original still there
    });
  });

  describe("removeSynced", () => {
    it("deletes the record from the store entirely", async () => {
      const id = await queueSample();
      await markSynced(id);
      await removeSynced(id);

      const summary = await getPendingSummary();
      assert.equal(summary.total, 0);
    });
  });

  // ---- Cache operations --------------------------------------------------

  describe("cacheData / getCachedData", () => {
    it("stores and retrieves cached data", async () => {
      const data = { students: [{ id: "s1", name: "Alice" }] };
      await cacheData("grades-JSS1-Math", data);

      const cached = await getCachedData("grades-JSS1-Math");
      assert.deepEqual(cached, data);
    });

    it("returns null for a missing key", async () => {
      const cached = await getCachedData("nonexistent-key");
      assert.equal(cached, null);
    });

    it("returns null for expired data", async () => {
      // Cache with TTL of -1ms (already expired)
      await cacheData("expired-key", { foo: "bar" }, -1);

      const cached = await getCachedData("expired-key");
      assert.equal(cached, null);
    });

    it("overwrites existing data for the same key", async () => {
      await cacheData("my-key", { version: 1 });
      await cacheData("my-key", { version: 2 });

      const cached = await getCachedData("my-key");
      assert.deepEqual(cached, { version: 2 });
    });

    it("distinguishes between different keys", async () => {
      await cacheData("key-a", { a: 1 });
      await cacheData("key-b", { b: 2 });

      assert.deepEqual(await getCachedData("key-a"), { a: 1 });
      assert.deepEqual(await getCachedData("key-b"), { b: 2 });
    });
  });

  describe("clearExpiredCache", () => {
    it("removes expired entries but keeps valid ones", async () => {
      await cacheData("expired", { x: 1 }, -1); // already expired
      await cacheData("valid", { y: 2 }, 60000); // valid for 1 min

      await clearExpiredCache();

      assert.equal(await getCachedData("expired"), null);
      assert.deepEqual(await getCachedData("valid"), { y: 2 });
    });

    it("handles an empty cache gracefully", async () => {
      await clearExpiredCache(); // no-op, should not throw
      assert.equal(await getCachedData("anything"), null);
    });
  });

  // ---- Pending summary & count -------------------------------------------

  describe("getPendingSummary", () => {
    it("returns total=0 when nothing is pending", async () => {
      const summary = await getPendingSummary();
      assert.equal(summary.total, 0);
      assert.deepEqual(summary.byType, {});
    });

    it("groups pending changes by type", async () => {
      await queueSample({ type: "attendance" });
      await queueSample({ type: "attendance" });
      await queueSample({ type: "grade" });

      const summary = await getPendingSummary();
      assert.equal(summary.total, 3);
      assert.equal(summary.byType.attendance, 2);
      assert.equal(summary.byType.grade, 1);
    });

    it("excludes synced changes from the summary", async () => {
      const id1 = await queueSample({ type: "attendance" });
      await queueSample({ type: "grade" });
      await markSynced(id1);

      const summary = await getPendingSummary();
      assert.equal(summary.total, 1);
      assert.equal(summary.byType.grade, 1);
      assert.equal(summary.byType.attendance, undefined);
    });
  });

  describe("getPendingCount", () => {
    it("returns 0 when empty", async () => {
      assert.equal(await getPendingCount(), 0);
    });

    it("returns the correct count", async () => {
      await queueSample();
      await queueSample();
      await queueSample();
      assert.equal(await getPendingCount(), 3);
    });

    it("decreases after marking synced", async () => {
      const id = await queueSample();
      await queueSample();
      assert.equal(await getPendingCount(), 2);

      await markSynced(id);
      assert.equal(await getPendingCount(), 1);
    });
  });

  // ---- Sync status -------------------------------------------------------

  describe("getSyncStatus / setSyncStatus", () => {
    it("returns null when no status is set", async () => {
      const ts = await getSyncStatus("last-sync");
      assert.equal(ts, null);
    });

    it("stores and retrieves a sync timestamp", async () => {
      const now = Date.now();
      await setSyncStatus("last-sync", now);
      const ts = await getSyncStatus("last-sync");
      assert.equal(ts, now);
    });

    it("defaults to Date.now() when no timestamp is provided", async () => {
      const before = Date.now();
      await setSyncStatus("auto-sync");
      const after = Date.now();
      const ts = await getSyncStatus("auto-sync");
      assert.ok(ts >= before && ts <= after);
    });

    it("supports multiple independent status keys", async () => {
      await setSyncStatus("sync-a", 100);
      await setSyncStatus("sync-b", 200);

      assert.equal(await getSyncStatus("sync-a"), 100);
      assert.equal(await getSyncStatus("sync-b"), 200);
    });
  });

  // ---- isOnline ----------------------------------------------------------

  describe("isOnline", () => {
    it("does not throw and returns a falsy value in Node.js", () => {
      // In Node.js (even with fake-indexeddb), navigator.onLine is undefined,
      // so the function returns undefined (falsy). In a browser it returns
      // navigator.onLine (boolean). The key contract: it never throws.
      const result = isOnline();
      assert.ok(!result, "isOnline() returns falsy in Node.js");
    });
  });

  // ---- End-to-end sync scenario ------------------------------------------

  describe("end-to-end: queue -> sync -> cleanup", () => {
    it("simulates a full offline->online sync cycle", async () => {
      // 1. Teacher goes offline and marks attendance
      const attendanceId = await queueSample({
        type: "attendance",
        endpoint: "/api/attendance",
        body: { classArm: "JSS1", date: "2026-08-22", rows: [{ studentId: "s1", present: true }] },
      });

      // 2. Teacher enters grades
      const gradeId = await queueSample({
        type: "grade",
        endpoint: "/api/scores",
        body: { classArm: "JSS1", subject: "Math", rows: [{ studentId: "s1", ca1: 10 }] },
      });

      // 3. Verify both are pending
      let summary = await getPendingSummary();
      assert.equal(summary.total, 2);
      assert.equal(summary.byType.attendance, 1);
      assert.equal(summary.byType.grade, 1);

      // 4. Internet returns — sync attendance first
      await markSynced(attendanceId);
      summary = await getPendingSummary();
      assert.equal(summary.total, 1);
      assert.equal(summary.byType.grade, 1);

      // 5. Sync grades
      await markSynced(gradeId);
      summary = await getPendingSummary();
      assert.equal(summary.total, 0);
      assert.deepEqual(summary.byType, {});

      // 6. Cleanup old synced records
      await removeSynced(attendanceId);
      await removeSynced(gradeId);

      // 7. Verify clean state
      assert.equal(await getPendingCount(), 0);
    });

    it("handles cache alongside sync queue", async () => {
      // Cache student data for offline viewing (short TTL for this test)
      await cacheData("students-JSS1", [{ id: "s1", name: "Alice" }], 60000);
      await cacheData("students-JSS2", [{ id: "s2", name: "Bob" }], 60000);

      // Queue a change while offline
      await queueSample({ type: "attendance" });

      // Both cache and pending queue coexist
      const cached = await getCachedData("students-JSS1");
      assert.equal(cached.length, 1);
      assert.equal(await getPendingCount(), 1);

      // Clear expired cache doesn't affect valid entries or pending changes
      await clearExpiredCache();
      assert.equal(await getPendingCount(), 1);
      assert.deepEqual(await getCachedData("students-JSS1"), [{ id: "s1", name: "Alice" }]);
    });

    it("expired cache entries are removed while pending changes survive", async () => {
      // Cache with immediate expiry
      await cacheData("stale-data", { old: true }, -1);
      // Queue a change
      await queueSample({ type: "grade" });

      assert.equal(await getPendingCount(), 1);

      await clearExpiredCache();

      assert.equal(await getCachedData("stale-data"), null);
      assert.equal(await getPendingCount(), 1); // pending changes unaffected
    });
  });
});
