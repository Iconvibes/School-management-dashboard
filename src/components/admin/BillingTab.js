"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CreditCard,
  Zap,
  Building2,
  Crown,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle,
} from "lucide-react";
import { SAAS_PLANS } from "@/lib/paystack";

const PLAN_ICONS = {
  starter: Zap,
  standard: Crown,
  enterprise: Building2,
};

const PLAN_COLORS = {
  starter: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", glow: "shadow-emerald-500/10" },
  standard: { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-400", glow: "shadow-cyan-500/10" },
  enterprise: { bg: "bg-violet-500/10", border: "border-violet-500/20", text: "text-violet-400", glow: "shadow-violet-500/10" },
};

/**
 * BillingTab — School admin subscription management with Paystack checkout.
 */
export default function BillingTab() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [studentCount, setStudentCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [subRes, statsRes] = await Promise.all([
          fetch("/api/billing/subscription"),
          fetch("/api/stats"),
        ]);
        if (subRes.ok) {
          const data = await subRes.json();
          if (!cancelled) setSubscription(data);
        }
        if (statsRes.ok) {
          const data = await statsRes.json();
          if (!cancelled) setStudentCount(data.totalStudents || 0);
        }
      } catch (err) {
        console.error("Failed to load billing:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Initialize checkout result from URL params (billing callback)
  const [checkoutResult, setCheckoutResult] = useState(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (billing === "success") {
      window.history.replaceState({}, "", "/admin/dashboard?tab=billing");
      return { success: true, message: "Subscription activated successfully!" };
    }
    if (billing === "failed") {
      window.history.replaceState({}, "", "/admin/dashboard?tab=billing");
      return { success: false, message: "Payment verification failed. Please try again." };
    }
    return null;
  });

  async function handleCheckout(planId) {
    setCheckoutLoading(planId);
    setCheckoutResult(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, cycle }),
      });
      const data = await res.json();

      if (data.success && data.demo) {
        // Demo mode — subscription activated immediately
        setSubscription({
          billingPlan: planId,
          billingCycle: cycle,
          subscriptionStatus: "active",
          currentPeriodEnd: data.subscription.currentPeriodEnd,
        });
        setCheckoutResult({ success: true, message: data.message });
      } else if (data.success && data.authorizationUrl) {
        // Production — redirect to Paystack checkout
        window.location.assign(data.authorizationUrl);
      } else {
        setCheckoutResult({ success: false, message: data.error || "Checkout failed" });
      }
    } catch (err) {
      setCheckoutResult({ success: false, message: "Network error. Please try again." });
    } finally {
      setCheckoutLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
      </div>
    );
  }

  const currentPlan = subscription?.billingPlan || "trial";
  const isActive = subscription?.subscriptionStatus === "active";
  const isTrial = subscription?.subscriptionStatus === "trial";
  const periodEnd = subscription?.currentPeriodEnd;

  // Student limit calculation
  const planLimits = { trial: 200, starter: 200, standard: 500, enterprise: Infinity };
  const planLimit = planLimits[currentPlan] || 200;
  const usagePct = planLimit === Infinity ? 0 : Math.min(100, Math.round((studentCount / planLimit) * 100));
  const isOverLimit = studentCount > planLimit;
  const isNearLimit = usagePct >= 80 && !isOverLimit;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white">Subscription & Billing</h2>
        <p className="mt-1 text-sm text-zinc-400">Manage your EduTrack subscription plan</p>
      </div>

      {/* Current Plan Status */}
      <div className="rounded-xl border border-white/[0.06] bg-zinc-900/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                Current Plan: {SAAS_PLANS.find((p) => p.id === currentPlan)?.name || "Trial"}
              </h3>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isActive
                  ? "bg-emerald-500/15 text-emerald-400"
                  : isTrial
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-red-500/15 text-red-400"
              }`}>
                {isActive ? <CheckCircle className="h-3 w-3" /> : isTrial ? <Clock className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {subscription?.subscriptionStatus?.toUpperCase() || "TRIAL"}
              </span>
            </div>
            {periodEnd && (
              <p className="mt-1 text-xs text-zinc-500">
                {isActive ? "Renews" : "Expires"} on {new Date(periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">{studentCount} students enrolled</p>
          </div>
        </div>

        {/* Student usage bar */}
        {currentPlan !== "enterprise" && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Student usage</span>
              <span className={`font-semibold ${
                isOverLimit ? "text-red-400" : isNearLimit ? "text-amber-400" : "text-zinc-400"
              }`}>
                {studentCount} / {planLimit === Infinity ? "Unlimited" : planLimit}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full transition-all ${
                  isOverLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {(isOverLimit || isNearLimit) && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                {isOverLimit
                  ? `Over limit by ${studentCount - planLimit}. Upgrade to Standard for 500 students.`
                  : `${planLimit - studentCount} student slots remaining. Consider upgrading soon.`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Checkout Result */}
      {checkoutResult && (
        <div className={`rounded-xl border p-4 ${
          checkoutResult.success
            ? "border-emerald-500/20 bg-emerald-500/10"
            : "border-red-500/20 bg-red-500/10"
        }`}>
          <div className="flex items-center gap-2">
            {checkoutResult.success ? (
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-400" />
            )}
            <p className={`text-sm ${checkoutResult.success ? "text-emerald-300" : "text-red-300"}`}>
              {checkoutResult.message}
            </p>
          </div>
        </div>
      )}

      {/* Billing Cycle Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-400">Billing cycle:</span>
        <div className="flex rounded-lg border border-white/[0.06] bg-zinc-900/50 p-0.5">
          <button
            onClick={() => setCycle("monthly")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              cycle === "monthly"
                ? "bg-white/10 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setCycle("annual")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              cycle === "annual"
                ? "bg-white/10 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Annual
            <span className="ml-1 text-[10px] text-emerald-400">Save 30%</span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {SAAS_PLANS.map((plan) => {
          const Icon = PLAN_ICONS[plan.id];
          const colors = PLAN_COLORS[plan.id];
          const isCurrentPlan = currentPlan === plan.id;
          const price = cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
          const total = price * studentCount;
          const isEnterprise = plan.id === "enterprise";

          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-5 transition-all ${
                isCurrentPlan
                  ? `${colors.border} ${colors.bg} ring-1 ring-white/10`
                  : "border-white/[0.06] bg-zinc-900/30 hover:border-white/[0.1]"
              }`}
            >
              {isCurrentPlan && (
                <div className="absolute -top-2.5 left-4 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white">
                  CURRENT PLAN
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.bg} ${colors.border} border`}>
                  <Icon className={`h-4 w-4 ${colors.text}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{plan.name}</h3>
                  <p className="text-[11px] text-zinc-500">{plan.tagline}</p>
                </div>
              </div>

              {!isEnterprise ? (
                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white">
                      {"\u20A6"}{price.toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-500">/student/{cycle === "annual" ? "yr" : "mo"}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {"\u20A6"}{total.toLocaleString()}/mo for {studentCount} students
                  </p>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="text-2xl font-bold text-white">Custom</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Contact for pricing</p>
                </div>
              )}

              <ul className="mb-5 space-y-2">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <Check className={`mt-0.5 h-3 w-3 shrink-0 ${colors.text}`} />
                    {feature}
                  </li>
                ))}
              </ul>

              {isCurrentPlan ? (
                <div className={`w-full rounded-lg border ${colors.border} ${colors.bg} py-2 text-center text-xs font-medium ${colors.text}`}>
                  Current Plan
                </div>
              ) : isEnterprise ? (
                <a
                  href="mailto:sales@edutrack.app"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 py-2 text-xs font-medium text-violet-400 transition hover:bg-violet-500/20"
                >
                  Contact Sales
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={checkoutLoading !== null}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition ${
                    checkoutLoading === plan.id
                      ? "bg-white/5 text-zinc-500"
                      : currentPlan === "trial"
                      ? `${colors.bg} ${colors.text} border ${colors.border} hover:opacity-80`
                      : "bg-white/10 text-white hover:bg-white/15"
                  }`}
                >
                  {checkoutLoading === plan.id ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-3.5 w-3.5" />
                      {currentPlan === "trial" ? "Start Subscription" : plan.id === "starter" ? "Downgrade" : "Upgrade"}
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment Powered By */}
      <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-600">
        <CreditCard className="h-3 w-3" />
        Payments secured by Paystack
      </div>
    </div>
  );
}
