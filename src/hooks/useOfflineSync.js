"use client";

import { useState, useEffect, useCallback } from "react";
import { isOnline, getPendingSummary, queueChange } from "@/lib/offline-db";

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
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

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
  }, []);

  /**
   * Queue a change for later sync (call this instead of fetch when offline).
   */
  const queueOfflineChange = useCallback(async (change) => {
    await queueChange(change);
    const s = await getPendingSummary();
    setPendingCount(s.total);
  }, []);

  /**
   * Sync all pending changes to the server.
   */
  const syncPending = useCallback(async () => {
    if (syncing || !isOnline()) return;
    setSyncing(true);

    try {
      const { getPendingChanges, markSynced } = await import("@/lib/offline-db");
      const changes = await getPendingChanges();

      for (const change of changes) {
        try {
          const response = await fetch(change.endpoint, {
            method: change.method || "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(change.body),
          });

          if (response.ok) {
            await markSynced(change.id);
          }
        } catch {
          // Will retry on next sync
        }
      }

      // Clean up synced changes
      const remaining = await getPendingChanges();
      setPendingCount(remaining.length);
      setLastSync(Date.now());
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  /**
   * Make a request that works offline (queues if offline).
   */
  const offlineFetch = useCallback(async (endpoint, options = {}) => {
    if (isOnline()) {
      return fetch(endpoint, options);
    }

    // Queue for later sync
    await queueOfflineChange({
      type: options.syncType || "generic",
      endpoint,
      method: options.method || "POST",
      body: options.body ? JSON.parse(options.body) : {},
      description: options.description || `Sync: ${endpoint}`,
    });

    // Return a mock success response
    return new Response(JSON.stringify({ ok: true, offline: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }, [queueOfflineChange]);

  return {
    isOffline: !online,
    isOnline: online,
    pendingCount,
    syncing,
    lastSync,
    syncPending,
    queueOfflineChange,
    offlineFetch,
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
      {sync.pendingCount > 0 && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {sync.pendingCount} change{sync.pendingCount !== 1 ? "s" : ""} pending sync
          {!sync.isOffline && (
            <button onClick={sync.syncPending} className="ml-2 underline">
              {sync.syncing ? "Syncing..." : "Sync now"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
