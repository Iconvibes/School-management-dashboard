import { useState, useEffect, useRef } from "react";
import { warn } from "@/lib/log";

/**
 * Tab-gated data fetching with automatic abort, loading state, and error
 * handling.  Replaces the ad-hoc `if (tab !== "X") return; fetch(...).then(...).catch(...)`
 * pattern found in every dashboard tab.
 *
 * @param {string|null} url    — URL to fetch. Pass null (or a falsy value)
 *   to skip the fetch entirely.
 * @param {object}      opts
 * @param {boolean}     opts.enabled   — gate the fetch (e.g. `tab === "fees"`).
 *   When false the hook resets data/loading/error and skips the request.
 * @param {any[]}       opts.deps      — extra dependencies that should trigger
 *   a re-fetch (beyond `url` and `enabled`).  Useful for filter params that
 *   are baked into the URL.
 * @param {function}    opts.transform — optional (json) => value applied to the
 *   parsed JSON before setting `data`.  Use this to pluck a sub-key, e.g.
 *   `(json) => json.students || []`.
 * @param {function}    opts.onData    — alternative to `transform`: called with
 *   the full parsed JSON when the response arrives.  Useful when one fetch
 *   needs to set multiple state variables (the caller reads the JSON directly
 *   inside this callback).  When provided, `data` stays null.
 *
 * @returns {{ data: any, loading: boolean, error: Error|null }}
 */
export function useTabFetch(
  url,
  { enabled = true, deps = [], transform, onData } = {}
) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  // Keep callback refs so the effect body is stable across renders.
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!enabled || !url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Request failed (" + res.status + ")");
        }
        return res.json();
      })
      .then((json) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        const result = transformRef.current
          ? transformRef.current(json)
          : json;
        if (onDataRef.current) {
          onDataRef.current(result);
        } else {
          setData(result);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!mountedRef.current || err.name === "AbortError") return;
        warn("useTabFetch", (url || "") + " failed:", err?.message);
        setError(err);
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, ...deps]);

  // Track mounted state for cleanup.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { data, loading, error };
}
