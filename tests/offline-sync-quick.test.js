/**
 * Quick tests for offline sync core functionality.
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
  __resetForTesting,
} from "../src/lib/offline-db.js";

describe("offline-sync-quick", () => {
  beforeEach(async () => {
    await __resetForTesting();
  });

  it("queues a change with idempotency key", async () => {
    const id = await queueChange({
      type: "attendance",
      endpoint: "/api/attendance",
      method: "POST",
      body: { classArm: "JSS1" },
    });

    const pending = await getPendingChanges();
    const record = pending.find((c) => c.id === id);
    
    assert.ok(record.idempotencyKey, "has idempotency key");
    assert.equal(typeof record.idempotencyKey, "string");
  });

  it("generates unique idempotency keys", async () => {
    const id1 = await queueChange({ type: "a", endpoint: "/api/a", method: "POST", body: {} });
    const id2 = await queueChange({ type: "b", endpoint: "/api/b", method: "POST", body: {} });

    const pending = await getPendingChanges();
    const key1 = pending.find((c) => c.id === id1).idempotencyKey;
    const key2 = pending.find((c) => c.id === id2).idempotencyKey;

    assert.notEqual(key1, key2, "keys are unique");
  });

  it("marks change as synced", async () => {
    const id = await queueChange({ type: "a", endpoint: "/api/a", method: "POST", body: {} });
    await markSynced(id);

    const pending = await getPendingChanges();
    assert.equal(pending.length, 0);
  });

  it("removes synced change", async () => {
    const id = await queueChange({ type: "a", endpoint: "/api/a", method: "POST", body: {} });
    await markSynced(id);
    await removeSynced(id);

    const summary = await getPendingSummary();
    assert.equal(summary.total, 0);
  });

  it("caches and retrieves data", async () => {
    await cacheData("test-key", { value: 42 }, 60000);
    const cached = await getCachedData("test-key");
    assert.deepEqual(cached, { value: 42 });
  });

  it("deletes cached data", async () => {
    await cacheData("test-key", { value: 42 }, 60000);
    await deleteCachedData("test-key");
    const cached = await getCachedData("test-key");
    assert.equal(cached, null);
  });

  it("returns null for expired cache", async () => {
    await cacheData("expired", { value: 1 }, -1);
    const cached = await getCachedData("expired");
    assert.equal(cached, null);
  });

  it("filters items by retryCount", async () => {
    const id1 = await queueChange({ type: "a", endpoint: "/api/a", method: "POST", body: {} });
    const id2 = await queueChange({ type: "b", endpoint: "/api/b", method: "POST", body: {} });

    // Set retry counts via IndexedDB
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("edutrack-offline", 1);
      request.onsuccess = () => resolve(request.result);
    });

    await new Promise((resolve) => {
      const tx = db.transaction("pendingChanges", "readwrite");
      const store = tx.objectStore("pendingChanges");
      store.get(id1).onsuccess = (e) => {
        const record = e.target.result;
        record.retryCount = 3;
        store.put(record);
        tx.oncomplete = () => resolve();
      };
    });

    await new Promise((resolve) => {
      const tx = db.transaction("pendingChanges", "readwrite");
      const store = tx.objectStore("pendingChanges");
      store.get(id2).onsuccess = (e) => {
        const record = e.target.result;
        record.retryCount = 6;
        store.put(record);
        tx.oncomplete = () => resolve();
      };
    });

    const pending = await getPendingChanges();
    const retryable = pending.filter((c) => (c.retryCount || 0) < 5);
    const deadLettered = pending.filter((c) => (c.retryCount || 0) >= 5);

    assert.equal(retryable.length, 1, "1 retryable");
    assert.equal(deadLettered.length, 1, "1 dead-lettered");
  });

  it("simulates full offline-to-online sync", async () => {
    // Queue changes
    const id1 = await queueChange({ type: "attendance", endpoint: "/api/attendance", method: "POST", body: {} });
    const id2 = await queueChange({ type: "grade", endpoint: "/api/scores", method: "POST", body: {} });

    // Verify both pending
    let summary = await getPendingSummary();
    assert.equal(summary.total, 2);

    // Sync first
    await markSynced(id1);
    summary = await getPendingSummary();
    assert.equal(summary.total, 1);

    // Sync second
    await markSynced(id2);
    summary = await getPendingSummary();
    assert.equal(summary.total, 0);

    // Cleanup
    await removeSynced(id1);
    await removeSynced(id2);

    assert.equal(await getPendingSummary().then(s => s.total), 0);
  });

  it("handles session cache lifecycle", async () => {
    // Cache session
    const session = { user: { id: "u1", name: "Teacher" } };
    await cacheData("session", session, 60000);

    // Verify cached
    let cached = await getCachedData("session");
    assert.deepEqual(cached, session);

    // Delete on logout
    await deleteCachedData("session");
    cached = await getCachedData("session");
    assert.equal(cached, null);

    // Cache new session
    const newSession = { user: { id: "u2", name: "New Teacher" } };
    await cacheData("session", newSession, 60000);
    cached = await getCachedData("session");
    assert.deepEqual(cached, newSession);
  });
});
