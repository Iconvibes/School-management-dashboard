"use client";

import { useState, useEffect, useCallback } from "react";
import { isOnline, getPendingSummary, queueChange } from "@/lib/offline-db";

// Maximum number of retry attempts before an item is considered dead-lettered
const MAX_RETRIES = 5;

/**
 * React hook for offline-first data sync.
 *
 * Tracks online/offline status, queues changes when offline,
 * and syncs pending changes when connectivity returns.
 *
 * Usage:
 *   const { isOffline, pendingCount, syncPending, queueOfflineChange } = useOfflineSync();
 */
export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  // syncPending must be declared BEFORE the useEffect that references it
  // to avoid a stale closure capturing undefined.
  const syncPending = useCallback(async () => {
    if (syncing || !isOnline()) return;
    setSyncing(true);

    try {
      const { getPendingChanges, markSynced, removeSynced } = await import("@/lib/offline-db");
      const changes = await getPendingChanges();

      for (const change of changes) {
        // Skip items that have already exceeded max retries (dead-lettered)
        if ((change.retryCount || 0) >= MAX_RETRIES) continue;

        try {
          const response = await fetch(change.endpoint, {
            method: change.method || "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Idempotency-Key": change.idempotencyKey || "",
            },
            body: JSON.stringify(change.body),
          });

          if (response.ok) {
            await markSynced(change.id);
            // Invalidate SW cache for the endpoint's API prefix
            invalidateSWCache(change.endpoint);
          } else {
            // Server returned an error — increment retry count
            const retryCount = (change.retryCount || 0) + 1;
            await updateRetryCount(change.id, retryCount);
          }
        } catch {
          // Network error — increment retry count
          const retryCount = (change.retryCount || 0) + 1;
          await updateRetryCount(change.id, retryCount);
        }
      }

      // Clean up synced changes and update counts
      const remaining = await getPendingChanges();
      setPendingCount(remaining.length);
      setFailedCount(remaining.filter((c) => (c.retryCount || 0) >= MAX_RETRIES).length);
      setLastSync(Date.now());
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  /**
   * Update retry count for a pending change.
   */
  const updateRetryCount = async (id, retryCount) => {
    const { getPendingChanges } = await import("@/lib/offline-db");
    const db = await import("@/lib/offline-db").then((m) => m.default || m);
    // Direct IndexedDB access to update retry count
    const request = indexedDB.open("edutrack-offline", 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction("pendingChanges", "readwrite");
      const store = tx.objectStore("pendingChanges");
      store.get(id).onsuccess = (e) => {
        const record = e.target.result;
        if (record) {
          record.retryCount = retryCount;
          store.put(record);
        }
      };
    };
  };

  /**
   * Invalidate SW cache for a specific API endpoint after a successful write.
   * This ensures the next read fetches fresh data from the server.
   */
  const invalidateSWCache = (endpoint) => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
    try {
      navigator.serviceWorker.controller.postMessage({
        type: "INVALIDATE_CACHE",
        url: endpoint,
      });
    } catch {
      // SW not available — ignore
    }
  };

  /**
   * Queue a change for later sync (call this instead of fetch when offline).
   */
  const queueOfflineChange = useCallback(async (change) => {
    await queueChange(change);
    const s = await getPendingSummary();
    setPendingCount(s.total);
  }, []);

  // Track online/offline status
  useEffect(() => {
    if (typeof window === "undefined") return;

    setOnline(navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      // Auto-sync when coming back online
      syncPending();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check pending count on mount
    getPendingSummary().then((s) => setPendingCount(s.total));

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPending]);

  /**
   * Make a request that works offline (queues if offline or network is unreachable).
   *
   * Catches network-level errors (TypeError from failed fetch) when the browser
   * reports online but the network is actually unreachable — e.g. DNS failure,
   * captive portal, or connection refused. HTTP errors (4xx/5xx) are NOT caught
   * because they mean the server was reachable and the error is application-level.
   */
  const offlineFetch = useCallback(async (endpoint, options = {}) => {
    try {
      const response = await fetch(endpoint, options);
      // Invalidate SW cache for successful writes (POST/PUT/PATCH/DELETE)
      if (response.ok && options.method && options.method !== "GET") {
        invalidateSWCache(endpoint);
      }
      return response;
    } catch (err) {
      // Only catch network-level errors (TypeError from failed fetch).
      // Re-throw non-network errors (programming bugs, etc.)
      if (!(err instanceof TypeError)) throw err;

      // Network unreachable — queue for later sync
      await queueOfflineChange({
        type: options.syncType || "generic",
        endpoint,
        method: options.method || "POST",
        body: options.body ? JSON.parse(options.body) : {},
        description: options.description || `Sync: ${endpoint}`,
      });

      // Return a mock success response so callers don't break
      return new Response(JSON.stringify({ ok: true, offline: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }, [queueOfflineChange]);

  /**
   * Discard all dead-lettered (failed) items from the queue.
   */
  const discardFailed = useCallback(async () => {
    const { getPendingChanges, removeSynced } = await import("@/lib/offline-db");
    const changes = await getPendingChanges();
    const failed = changes.filter((c) => (c.retryCount || 0) >= MAX_RETRIES);
    for (const change of failed) {
      await removeSynced(change.id);
    }
    const remaining = await getPendingChanges();
    setPendingCount(remaining.length);
    setFailedCount(0);
  }, []);

  return {
    isOffline: !online,
    isOnline: online,
    pendingCount,
    failedCount,
    syncing,
    lastSync,
    syncPending,
    queueOfflineChange,
    offlineFetch,
    discardFailed,
  };
}

/**
 * Provider component that wraps the app with offline sync context.
 * Not strictly needed — the hook works anywhere — but useful for
 * providing offline status to deeply nested components.
 */
export function OfflineSyncProvider({ children }) {
  const sync = useOfflineSync();

  return (
    <div data-offline={sync.isOffline || undefined} data-pending={sync.pendingCount || undefined}>
      {children}

      {/* Global offline banner — slim bar fixed to the bottom center */}
      {sync.isOffline && (
        <div className="fixed inset-x-0 bottom-0 z-[9999] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          You&apos;re offline — changes will sync when you reconnect
        </div>
      )}

      {/* Pending changes banner — bottom right, only when there are queued changes */}
      {sync.pendingCount > 0 && !sync.isOffline && (
        <div className="fixed bottom-4 right-4 z-[9999] rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {sync.pendingCount} change{sync.pendingCount !== 1 ? "s" : ""} pending sync
          <button onClick={sync.syncPending} className="ml-2 underline">
            {sync.syncing ? "Syncing..." : "Sync now"}
          </button>
        </div>
      )}

      {/* Failed items banner — show when there are dead-lettered items */}
      {sync.failedCount > 0 && (
        <div className="fixed bottom-16 right-4 z-[9999] rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {sync.failedCount} change{sync.failedCount !== 1 ? "s" : ""} failed to sync
          <button onClick={sync.discardFailed} className="ml-2 underline">
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
