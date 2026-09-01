"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle, CreditCard, X, ChevronRight } from "lucide-react";

/**
 * BillingBanner — Shows at the top of the school admin dashboard.
 * Displays a warning for expiring subscriptions or a block overlay for expired ones.
 * SUPER_ADMIN always sees warning only, never blocked (can manage billing).
 *
 * All time-dependent logic lives in useEffect/setInterval so the render
 * function itself never calls Date.now(), useRef(), or any impure function.
 */
export default function BillingBanner({ isSuperAdmin }) {
  const router = useRouter();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  // All derived state computed in effects, never in render
  const [showBanner, setShowBanner] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [countdownText, setCountdownText] = useState("");
  const [planLabel, setPlanLabel] = useState("");
  const [expiryMs, setExpiryMs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function fetchSub() {
      try {
        const r = await fetch("/api/billing/subscription");
        if (r.ok && !cancelled) setSubscription(await r.json());
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    }

    function computeStatus(now) {
      if (!subscription || dismissed) return;
      const st = subscription.subscriptionStatus || "trial";
      const label = ({ trial: "Trial", standard: "Standard", enterprise: "Enterprise" })[subscription.billingPlan] || "Standard";
      setPlanLabel(label);

      const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).getTime() : null;
      const trialEnd = subscription.trialEnd ? new Date(subscription.trialEnd).getTime() : null;
      const expiry = st === "trial" ? trialEnd : periodEnd;
      if (expiry) setExpiryMs(expiry);

      const days = expiry ? Math.ceil((expiry - now) / 86400000) : 0;
      setDaysLeft(days);

      const paused = st === "paused";
      const expired = st === "expired"
        || (st === "trial" && trialEnd != null && now > trialEnd)
        || (st === "active" && periodEnd != null && now - periodEnd > 2 * 86400000);
      setIsExpired(expired || paused);
      setIsPaused(paused);
      setUrgent(days <= 3 || paused);
      setIsBlocked((expired || paused) && !isSuperAdmin);
      setShowBanner(expired || paused || days <= 30);
      setCountdownText(formatRemain(expiry - now));
    }

    function formatRemain(ms) {
      if (ms <= 0) return "Expired";
      const d = Math.floor(ms / 864e5);
      const h = Math.floor((ms % 864e5) / 36e5);
      const m = Math.floor((ms % 36e5) / 6e4);
      if (d > 0) return `${d}d ${h}h left`;
      return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
    }

    fetchSub().then(() => {
      if (cancelled || !subscription) return;
      computeStatus(Date.now());
      timer = setInterval(() => computeStatus(Date.now()), 1000);
    });

    return () => { cancelled = true; clearInterval(timer); };

  }, [subscription, dismissed, isSuperAdmin, isPaused]);

  if (loading || !subscription || dismissed || !showBanner) return null;

  const goBilling = () => { router.push("/admin/dashboard#billing"); };

  if (isBlocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="mx-4 max-w-lg rounded-2xl border border-red-500/30 bg-gray-900 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">{isPaused ? "Subscription Paused" : "Subscription Expired"}</h2>
          <p className="mt-2 text-sm text-gray-400">
            Your <strong className="text-white">{planLabel}</strong> subscription has
            {isPaused ? " been paused due to failed payments" : " expired"}. Some features are now restricted.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            {isPaused
              ? "Update your payment method to restore access."
              : "Contact your school administrator to renew."}
          </p>
          <button onClick={goBilling} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500">
            <CreditCard className="h-4 w-4" />
            Renew
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${urgent ? "border-red-500/30 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${urgent ? "bg-red-500/20" : "bg-amber-500/20"}`}>
            {isExpired
              ? <AlertTriangle className="h-4.5 w-4.5 text-red-400" />
              : <Clock className="h-4.5 w-4.5 text-amber-400" />}
          </div>
          <div>
            <p className={`text-sm font-semibold ${urgent ? "text-red-200" : "text-amber-200"}`}>
              {isExpired
                ? `${planLabel} subscription has expired`
                : `${planLabel} subscription expires soon`}
            </p>
            <p className="text-xs text-gray-400">
            {isExpired
              ? (isPaused ? "Update payment method to restore access." : "Some features are restricted. Renew to restore full access.")
              : countdownText}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goBilling}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${urgent ? "bg-red-500 text-white hover:bg-red-400" : "bg-amber-500 text-black hover:bg-amber-400"}`}>
            <CreditCard className="h-3 w-3" />
            {isExpired ? (isPaused ? "Update Payment" : "Renew Now") : "Extend"}
          </button>
          {!isSuperAdmin && isExpired && (
            <button onClick={() => setDismissed(true)} className="rounded-lg p-1.5 text-gray-500 hover:text-gray-300">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
