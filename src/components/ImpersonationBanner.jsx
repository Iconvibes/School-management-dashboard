"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shield, Clock, LogOut, AlertTriangle } from "lucide-react";

/**
 * ImpersonationBanner — shown at the top of school admin dashboards when the
 * current session was created via platform admin impersonation.
 *
 * Displays a countdown timer and automatically redirects to /platform/dashboard
 * when the impersonation session expires.
 *
 * @param {Object} props
 * @param {Object} props.impersonation — from /api/auth/me response
 * @param {number} props.impersonation.impersonatedAt — timestamp when impersonation started
 * @param {string} props.impersonation.impersonatorName — who is impersonating
 * @param {number} props.impersonation.timeoutMs — total timeout in ms
 * @param {number} props.impersonation.expiresAt — absolute expiration timestamp
 * @param {number} props.impersonation.remainingMs — remaining time in ms
 */
export default function ImpersonationBanner({ impersonation }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(impersonation?.remainingMs || 0);
  const [dismissed, setDismissed] = useState(false);

  // Countdown timer — updates every second
  useEffect(() => {
    if (!impersonation?.expiresAt) return;

    function tick() {
      const left = Math.max(0, impersonation.expiresAt - Date.now());
      setRemaining(left);

      if (left <= 0) {
        // Session expired — redirect to platform dashboard
        // Using router.push for internal navigation (Next.js lint rule)
        router.push("/platform/dashboard");
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [impersonation, router]);

  const formatTime = useCallback((ms) => {
    if (ms <= 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  const handleEndSession = useCallback(() => {
    router.push("/platform/dashboard");
  }, [router]);

  if (!impersonation || dismissed) return null;

  const minutesLeft = Math.floor(remaining / 60000);
  const isUrgent = minutesLeft <= 5;
  const isCritical = minutesLeft <= 2;

  return (
    <div
      className={`sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors ${
        isCritical
          ? "bg-red-600 text-white"
          : isUrgent
            ? "bg-amber-500 text-white"
            : "bg-violet-600 text-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <Shield className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">
          Impersonating <strong>{impersonation.impersonatorName}</strong>&apos;s session as school admin
        </span>
        <span className="sm:hidden">
          Impersonation active
        </span>
        <span className="mx-1 text-white/40">|</span>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span className={`font-mono font-bold ${isCritical ? "animate-pulse" : ""}`}>
            {formatTime(remaining)}
          </span>
        </div>
        {isUrgent && !isCritical && (
          <span className="hidden sm:inline items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">
            <AlertTriangle className="h-3 w-3" />
            Expiring soon
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleEndSession}
          className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/25"
        >
          <LogOut className="h-3.5 w-3.5" />
          End Session
        </button>
      </div>
    </div>
  );
}
