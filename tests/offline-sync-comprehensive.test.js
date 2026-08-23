/**
 * Comprehensive tests for offline sync functionality.
 *
 * Covers:
 *   - Idempotency key generation and uniqueness
 *   - Retry count tracking and MAX_RETRIES behavior
 *   - Dead-letter handling (items exceeding MAX_RETRIES)
 *   - Session caching and fallback behavior
 *   - Edge cases: concurrent operations, error handling
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
  deleteCachedData,
  getPendingSummary,
  getPendingCount,
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

describe("offline-sync-comprehensive", () => {
  beforeEach(async () => {
    await resetDB();
  });

  // ---- Idempotency keys --------------------------------------------------

  describe("Idempotency Keys", () => {
    it("generates an idempotency key for each queued change", async () => {
      const id = await queueSample();
      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);
      
      assert.ok(record.idempotencyKey, "idempotency key is generated");
      assert.equal(typeof record.idempotencyKey, "string");
      assert.ok(record.idempotencyKey.length > 0);
    });

    it("generates unique idempotency keys for different changes", async () => {
      const id1 = await queueSample({ type: "attendance" });
      const id2 = await queueSample({ type: "grade" });
      const id3 = await queueSample({ type: "resource" });

      const pending = await getPendingChanges();
      const key1 = pending.find((c) => c.id === id1).idempotencyKey;
      const key2 = pending.find((c) => c.id === id2).idempotencyKey;
      const key3 = pending.find((c) => c.id === id3).idempotencyKey;

      assert.notEqual(key1, key2, "keys are unique");
      assert.notEqual(key2, key3, "keys are unique");
      assert.notEqual(key1, key3, "keys are unique");
    });

    it("preserves provided idempotency key if given", async () => {
      const customKey = "custom-idempotency-key-123";
      const id = await queueSample({ idempotencyKey: customKey });
      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);

      assert.equal(record.idempotencyKey, customKey);
    });

    it("idempotency key is a valid UUID format (or fallback)", async () => {
      const id = await queueSample();
      const pending = await getPendingChanges();
      const key = pending.find((c) => c.id === id).idempotencyKey;

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      // OR fallback format: timestamp-randomstring
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
      const isFallback = /^\d+-[a-z0-9]+$/.test(key);
      
      assert.ok(isUUID || isFallback, `key is valid format: ${key}`);
    });
  });

  // ---- Retry count tracking ----------------------------------------------

  describe("Retry Count Tracking", () => {
    it("initializes retryCount to 0", async () => {
      const id = await queueSample();
      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);

      assert.equal(record.retryCount, 0);
    });

    it("can update retry count via direct IndexedDB access", async () => {
      const id = await queueSample();
      
      // Simulate what useOfflineSync.updateRetryCount does
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("edutrack-offline", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise((resolve) => {
        const tx = db.transaction("pendingChanges", "readwrite");
        const store = tx.objectStore("pendingChanges");
        store.get(id).onsuccess = (e) => {
          const record = e.target.result;
          record.retryCount = 3;
          store.put(record);
          tx.oncomplete = () => resolve();
        };
      });

      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);
      assert.equal(record.retryCount, 3);
    });
  });

  // ---- Dead-letter handling (MAX_RETRIES) --------------------------------

  describe("Dead-Letter Handling (MAX_RETRIES)", () => {
    const MAX_RETRIES = 5;

    it("items with retryCount < MAX_RETRIES are still pending", async () => {
      const id = await queueSample();
      
      // Set retry count to MAX_RETRIES - 1
      const db = await new Promise((resolve) => {
        const request = indexedDB.open("edutrack-offline", 1);
        request.onsuccess = () => resolve(request.result);
      });

      await new Promise((resolve) => {
        const tx = db.transaction("pendingChanges", "readwrite");
        const store = tx.objectStore("pendingChanges");
        store.get(id).onsuccess = (e) => {
          const record = e.target.result;
          record.retryCount = MAX_RETRIES - 1;
          store.put(record);
          tx.oncomplete = () => resolve();
        };
      });

      const pending = await getPendingChanges();
      assert.equal(pending.length, 1);
      assert.equal(pending[0].retryCount, MAX_RETRIES - 1);
    });

    it("items with retryCount >= MAX_RETRIES can be filtered out", async () => {
      // Queue multiple items
      const id1 = await queueSample({ type: "attendance" });
      const id2 = await queueSample({ type: "grade" });
      const id3 = await queueSample({ type: "resource" });

      // Set retry counts
      const db = await new Promise((resolve) => {
        const request = indexedDB.open("edutrack-offline", 1);
        request.onsuccess = () => resolve(request.result);
      });

      const updates = [
        { id: id1, retryCount: 3 }, // still retrying
        { id: id2, retryCount: MAX_RETRIES }, // dead-lettered
        { id: id3, retryCount: MAX_RETRIES + 2 }, // dead-lettered
      ];

      for (const { id, retryCount } of updates) {
        await new Promise((resolve) => {
          const tx = db.transaction("pendingChanges", "readwrite");
          const store = tx.objectStore("pendingChanges");
          store.get(id).onsuccess = (e) => {
            const record = e.target.result;
            record.retryCount = retryCount;
            store.put(record);
            tx.oncomplete = () => resolve();
          };
        });
      }

      // Filter like useOfflineSync does
      const pending = await getPendingChanges();
      const retryable = pending.filter((c) => (c.retryCount || 0) < MAX_RETRIES);
      const deadLettered = pending.filter((c) => (c.retryCount || 0) >= MAX_RETRIES);

      assert.equal(retryable.length, 1, "only 1 item is retryable");
      assert.equal(deadLettered.length, 2, "2 items are dead-lettered");
      assert.equal(retryable[0].id, id1);
    });

    it("dead-lettered items can be removed via removeSynced", async () => {
      const id1 = await queueSample({ type: "attendance" });
      const id2 = await queueSample({ type: "grade" });

      // Mark one as synced (simulating successful sync)
      await markSynced(id1);
      await removeSynced(id1);

      const pending = await getPendingChanges();
      assert.equal(pending.length, 1);
      assert.equal(pending[0].id, id2);
    });

    it("discardFailed removes all items with retryCount >= MAX_RETRIES", async () => {
      const id1 = await queueSample({ type: "attendance" });
      const id2 = await queueSample({ type: "grade" });
      const id3 = await queueSample({ type: "resource" });

      // Set retry counts
      const db = await new Promise((resolve) => {
        const request = indexedDB.open("edutrack-offline", 1);
        request.onsuccess = () => resolve(request.result);
      });

      const updates = [
        { id: id1, retryCount: 2 }, // keep
        { id: id2, retryCount: MAX_RETRIES }, // discard
        { id: id3, retryCount: MAX_RETRIES + 1 }, // discard
      ];

      for (const { id, retryCount } of updates) {
        await new Promise((resolve) => {
          const tx = db.transaction("pendingChanges", "readwrite");
          const store = tx.objectStore("pendingChanges");
          store.get(id).onsuccess = (e) => {
            const record = e.target.result;
            record.retryCount = retryCount;
            store.put(record);
            tx.oncomplete = () => resolve();
          };
        });
      }

      // Simulate discardFailed logic
      const pending = await getPendingChanges();
      const failed = pending.filter((c) => (c.retryCount || 0) >= MAX_RETRIES);
      for (const change of failed) {
        await removeSynced(change.id);
      }

      // Verify only non-failed items remain
      const remaining = await getPendingChanges();
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].id, id1);
      assert.equal(remaining[0].retryCount, 2);
    });
  });

  // ---- Session caching and fallback --------------------------------------

  describe("Session Caching and Fallback", () => {
    it("caches session data with specified TTL", async () => {
      const sessionData = { user: { id: "u1", name: "Test User", role: "TEACHER" } };
      await cacheData("session", sessionData, 60000);

      const cached = await getCachedData("session");
      assert.deepEqual(cached, sessionData);
    });

    it("returns null for expired session cache", async () => {
      const sessionData = { user: { id: "u1", name: "Test User" } };
      await cacheData("session", sessionData, -1); // already expired

      const cached = await getCachedData("session");
      assert.equal(cached, null);
    });

    it("deletes session cache on logout", async () => {
      const sessionData = { user: { id: "u1", name: "Test User" } };
      await cacheData("session", sessionData, 60000);

      // Verify cached
      let cached = await getCachedData("session");
      assert.deepEqual(cached, sessionData);

      // Delete (simulating logout)
      await deleteCachedData("session");

      // Verify deleted
      cached = await getCachedData("session");
      assert.equal(cached, null);
    });

    it("session cache deletion does not affect other cached data", async () => {
      const sessionData = { user: { id: "u1" } };
      const gradesData = { grades: [{ id: "g1", score: 95 }] };

      await cacheData("session", sessionData, 60000);
      await cacheData("grades-JSS1-Math", gradesData, 60000);

      // Delete session
      await deleteCachedData("session");

      // Session is gone
      assert.equal(await getCachedData("session"), null);

      // Grades are still there
      assert.deepEqual(await getCachedData("grades-JSS1-Math"), gradesData);
    });

    it("handles concurrent cache operations", async () => {
      // Simulate multiple rapid cache operations
      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(cacheData(`key-${i}`, { value: i }, 60000));
      }
      await Promise.all(operations);

      // Verify all are cached
      for (let i = 0; i < 10; i++) {
        const cached = await getCachedData(`key-${i}`);
        assert.deepEqual(cached, { value: i });
      }
    });
  });

  // ---- Edge cases --------------------------------------------------------

  describe("Edge Cases", () => {
    it("handles empty body in queued change", async () => {
      const id = await queueChange({
        type: "attendance",
        endpoint: "/api/attendance",
        method: "POST",
        body: {},
      });

      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);
      assert.deepEqual(record.body, {});
    });

    it("handles very large body in queued change", async () => {
      const largeBody = { rows: Array(1000).fill({ studentId: "s1", present: true }) };
      const id = await queueChange({
        type: "attendance",
        endpoint: "/api/attendance",
        method: "POST",
        body: largeBody,
      });

      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);
      assert.equal(record.body.rows.length, 1000);
    });

    it("handles special characters in endpoint", async () => {
      const id = await queueChange({
        type: "grade",
        endpoint: "/api/scores?class=JSS1&subject=Math%20101",
        method: "POST",
        body: { score: 85 },
      });

      const pending = await getPendingChanges();
      const record = pending.find((c) => c.id === id);
      assert.equal(record.endpoint, "/api/scores?class=JSS1&subject=Math%20101");
    });

    it("handles concurrent queue operations", async () => {
      // Queue multiple changes concurrently
      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(queueSample({ type: `type-${i}` }));
      }
      const ids = await Promise.all(operations);

      // Verify all are queued
      const pending = await getPendingChanges();
      assert.equal(pending.length, 5);

      // Verify all have unique IDs
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, 5);
    });

    it("handles rapid sync cycles", async () => {
      // Queue, sync, queue, sync pattern
      for (let i = 0; i < 5; i++) {
        const id = await queueSample({ type: `cycle-${i}` });
        await markSynced(id);
        await removeSynced(id);
      }

      const pending = await getPendingChanges();
      assert.equal(pending.length, 0);
    });

    it("handles cache with zero TTL (immediate expiry)", async () => {
      await cacheData("zero-ttl", { data: "test" }, 0);
      const cached = await getCachedData("zero-ttl");
      assert.equal(cached, null);
    });

    it("handles cache with very large TTL", async () => {
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      await cacheData("long-ttl", { data: "test" }, oneYear);
      const cached = await getCachedData("long-ttl");
      assert.deepEqual(cached, { data: "test" });
    });
  });

  // ---- Summary and counting ----------------------------------------------

  describe("Summary and Counting", () => {
    it("getPendingSummary groups by type correctly", async () => {
      await queueSample({ type: "attendance" });
      await queueSample({ type: "attendance" });
      await queueSample({ type: "grade" });
      await queueSample({ type: "grade" });
      await queueSample({ type: "grade" });
      await queueSample({ type: "resource" });

      const summary = await getPendingSummary();
      assert.equal(summary.total, 6);
      assert.equal(summary.byType.attendance, 2);
      assert.equal(summary.byType.grade, 3);
      assert.equal(summary.byType.resource, 1);
    });

    it("getPendingSummary excludes synced items", async () => {
      const id1 = await queueSample({ type: "attendance" });
      const id2 = await queueSample({ type: "grade" });
      await queueSample({ type: "resource" });

      await markSynced(id1);
      await markSynced(id2);

      const summary = await getPendingSummary();
      assert.equal(summary.total, 1);
      assert.equal(summary.byType.resource, 1);
      assert.equal(summary.byType.attendance, undefined);
      assert.equal(summary.byType.grade, undefined);
    });

    it("getPendingCount matches summary total", async () => {
      await queueSample({ type: "a" });
      await queueSample({ type: "b" });
      await queueSample({ type: "c" });

      const count = await getPendingCount();
      const summary = await getPendingSummary();

      assert.equal(count, summary.total);
    });
  });

  // ---- Full lifecycle test -----------------------------------------------

  describe("Full Lifecycle: Queue → Sync → Cleanup", () => {
    it("simulates complete offline-to-online sync with retries", async () => {
      // 1. Teacher goes offline and marks attendance
      const attendanceId = await queueSample({
        type: "attendance",
        endpoint: "/api/attendance",
        body: { classArm: "JSS1", rows: [{ studentId: "s1", present: true }] },
      });

      // 2. Network fails twice, then succeeds
      const db = await new Promise((resolve) => {
        const request = indexedDB.open("edutrack-offline", 1);
        request.onsuccess = () => resolve(request.result);
      });

      // Simulate 2 failed attempts
      for (let i = 0; i < 2; i++) {
        await new Promise((resolve) => {
          const tx = db.transaction("pendingChanges", "readwrite");
          const store = tx.objectStore("pendingChanges");
          store.get(attendanceId).onsuccess = (e) => {
            const record = e.target.result;
            record.retryCount = i + 1;
            store.put(record);
            tx.oncomplete = () => resolve();
          };
        });
      }

      // 3. Verify retry count
      let pending = await getPendingChanges();
      let record = pending.find((c) => c.id === attendanceId);
      assert.equal(record.retryCount, 2);

      // 4. Sync succeeds on third attempt
      await markSynced(attendanceId);
      await removeSynced(attendanceId);

      // 5. Verify clean state
      pending = await getPendingChanges();
      assert.equal(pending.length, 0);
    });

    it("handles mixed success and failure in batch sync", async () => {
      // Queue multiple changes
      const id1 = await queueSample({ type: "attendance", endpoint: "/api/attendance" });
      const id2 = await queueSample({ type: "grade", endpoint: "/api/scores" });
      const id3 = await queueSample({ type: "resource", endpoint: "/api/resources" });

      // Sync first two, fail third
      await markSynced(id1);
      await markSynced(id2);

      // Third one fails - increment retry count
      const db = await new Promise((resolve) => {
        const request = indexedDB.open("edutrack-offline", 1);
        request.onsuccess = () => resolve(request.result);
      });

      await new Promise((resolve) => {
        const tx = db.transaction("pendingChanges", "readwrite");
        const store = tx.objectStore("pendingChanges");
        store.get(id3).onsuccess = (e) => {
          const record = e.target.result;
          record.retryCount = 1;
          store.put(record);
          tx.oncomplete = () => resolve();
        };
      });

      // Verify state
      const pending = await getPendingChanges();
      assert.equal(pending.length, 1);
      assert.equal(pending[0].id, id3);
      assert.equal(pending[0].retryCount, 1);
    });

    it("handles session cache with offline fallback", async () => {
      // 1. Cache session data (simulating successful login)
      const sessionData = {
        user: { id: "u1", name: "Teacher", role: "TEACHER" },
        school: { id: "s1", name: "Test School" },
      };
      await cacheData("session", sessionData, 24 * 60 * 60 * 1000);

      // 2. Simulate offline - read from cache
      let cached = await getCachedData("session");
      assert.deepEqual(cached, sessionData);

      // 3. Simulate logout - clear cache
      await deleteCachedData("session");
      cached = await getCachedData("session");
      assert.equal(cached, null);

      // 4. New user logs in - cache new session
      const newSession = {
        user: { id: "u2", name: "New Teacher", role: "TEACHER" },
        school: { id: "s1", name: "Test School" },
      };
      await cacheData("session", newSession, 24 * 60 * 60 * 1000);

      // 5. Verify new session is cached
      cached = await getCachedData("session");
      assert.deepEqual(cached, newSession);
    });
  });
});
