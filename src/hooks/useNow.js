"use client";

import { useEffect, useState } from "react";

/**
 * Purity-safe "current time" for relative timestamps and countdowns.
 *
 * `Date.now()` may not be called during render (react-hooks/purity), so the
 * timestamp is captured in an effect instead. Pass an interval in ms to keep
 * the value ticking so labels like "5m ago" stay fresh.
 *
 * Returns `null` before the first capture (one frame) — callers should fall
 * back gracefully, e.g. `daysLeft = now ? compute(now) : null`.
 */
export function useNow(intervalMs = 0) {
  const [now, setNow] = useState(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    // Defer the first capture to a timeout so no state is set synchronously
    // inside the effect body (react-hooks/set-state-in-effect).
    const first = setTimeout(tick, 0);
    const timer = intervalMs ? setInterval(tick, intervalMs) : null;
    return () => {
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
