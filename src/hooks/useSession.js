"use client";

import { useState, useEffect } from "react";
import { cacheData, getCachedData } from "@/lib/offline-db";

/**
 * Shared hook for offline-aware session loading.
 *
 * Fetches /api/auth/me, caches the result in IndexedDB, and falls back
 * to the cache when offline or when the network request fails.
 *
 * @param {Object} [options]
 * @param {number} [options.ttlMs=86400000] — Cache TTL (default 24 hours)
 * @returns {{ meData, loading, error, refetch }}
 */
export function useSession({ ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  const [meData, setMeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSession = async () => {
    try {
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        throw new Error(`Session check failed: ${response.status}`);
      }
      const data = await response.json();

      if (data.user) {
        // Cache successful session for offline use
        setMeData(data);
        cacheData("session", data, ttlMs).catch(() => {});
      } else {
        setMeData(data);
      }
      setError(null);
    } catch (err) {
      // Network error — try cached session
      try {
        const cached = await getCachedData("session");
        if (cached) {
          setMeData(cached);
          setError(null); // Clear error since we have cached data
        } else {
          setError(err);
        }
      } catch {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  return { meData, loading, error, refetch: fetchSession };
}

export default useSession;
