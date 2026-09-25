"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  Zap,
  Building2,
  RefreshCw,
} from "lucide-react";

/**
 * Platform Billing — SaaS subscription management.
 * Shows MRR, plan distribution, school billing status, and plan management.
 */
export default function BillingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/platform/billing");
        if (!res.ok) throw new Error("Failed to load");
        const result = await res.json();
        if (!cancelled) setData(result);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSubscriptionAction(schoolId, action, plan, cycle) {
    setUpdating(schoolId);
    try {
      const res = await fetch(`/api/platform/billing/${schoolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, plan, cycle }),
      });
      if (!res.ok) throw new Error("Action failed");
      // Refresh data
      const refresh = await fetch("/api/platform/billing");
      if (refresh.ok) {
        const result = await refresh.json();
        setData(result);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdating(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
      </div>
    );
  }

  const { plans = [], schools = [], totals = {} } = data || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">SaaS Billing</h1>
          <p className="mt-1 text-sm text-zinc-400">Manage school subscriptions and revenue</p>
        </div>
      </div>

      {/* MRR / ARR / Subscriptions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">MRR</p>
            <CreditCard className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3">
            <p className="metric-value">{"\u20A6"}{(totals.totalMRR || 0).toLocaleString()}</p>
            <p className="mt-1 text-xs text-zinc-500">Monthly Recurring Revenue</p>
          </div>
        </div>

        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">ARR</p>
            <TrendingUp className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3">
            <p className="metric-value">{"\u20A6"}{(totals.totalARR || 0).toLocaleString()}</p>
            <p className="mt-1 text-xs text-zinc-500">Annual Recurring Revenue</p>
          </div>
        </div>

        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Active</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
          </div>
          <div className="mt-3">
            <p className="metric-value">{totals.activeSubscriptions || 0}</p>
            <p className="mt-1 text-xs text-zinc-500">Paying subscribers</p>
          </div>
        </div>

        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Trials</p>
            <Clock className="h-4 w-4 text-amber-500/60" />
          </div>
          <div className="mt-3">
            <p className="metric-value">{totals.trialSchools || 0}</p>
            <p className="mt-1 text-xs text-zinc-500">Schools on free trial</p>
          </div>
        </div>
      </div>

      {/* Plan Cards */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-zinc-400 uppercase tracking-wider">Available Plans</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className="platform-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-cyan-400" />
                <h3 className="text-base font-bold text-white">{plan.name}</h3>
              </div>
              <p className="text-xs text-zinc-500 mb-4">{plan.tagline}</p>
              <div className="flex items-baseline gap-1 mb-4">
                {plan.monthlyPrice > 0 ? (
                  <>
                    <span className="text-2xl font-bold text-white">{"\u20A6"}{plan.monthlyPrice}</span>
                    <span className="text-xs text-zinc-500">/student/month</span>
                  </>
                ) : (
                  <span className="text-2xl font-bold text-white">Custom</span>
                )}
              </div>
              <ul className="space-y-2">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* School Billing Table */}
      <div className="platform-card">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">School Subscriptions</h2>
          <span className="text-xs text-zinc-500">{schools.length} schools</span>
        </div>
        <div className="overflow-x-auto">
          <table className="platform-table">
            <thead>
              <tr>
                <th>School</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Students</th>
                <th>Monthly</th>
                <th>Trial</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr key={school.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                        style={{ backgroundColor: school.brandColor || "#2563EB" }}
                      >
                        {school.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-zinc-200">{school.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`platform-badge ${
                      school.billingPlan === "enterprise" ? "platform-badge-green" :
                      school.billingPlan === "standard" ? "platform-badge-amber" :
                      "platform-badge-red"
                    }`}>
                      {school.billingPlan}
                    </span>
                  </td>
                  <td>
                    <span className={`platform-badge ${
                      school.subscriptionStatus === "active" ? "platform-badge-green" :
                      school.subscriptionStatus === "trial" ? "platform-badge-amber" :
                      "platform-badge-red"
                    }`}>
                      {school.subscriptionStatus}
                    </span>
                  </td>
                  <td className="text-zinc-300">{school.studentCount}</td>
                  <td className="text-zinc-300">
                    {school.monthlyPrice > 0 ? `₦${school.monthlyPrice.toLocaleString()}` : "—"}
                  </td>
                  <td>
                    {school.subscriptionStatus === "trial" && (
                      <span className="text-xs text-amber-400">
                        {school.trialDaysLeft}d left
                      </span>
                    )}
                    {school.subscriptionStatus === "trial" && school.isTrialExpired && (
                      <span className="text-xs text-red-400">Expired</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {school.subscriptionStatus === "trial" && (
                        <button
                          onClick={() => handleSubscriptionAction(school.id, "activate", "standard", "monthly")}
                          disabled={updating === school.id}
                          className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {updating === school.id ? "..." : "Activate"}
                        </button>
                      )}
                      {school.subscriptionStatus === "active" && (
                        <button
                          onClick={() => handleSubscriptionAction(school.id, "cancel")}
                          disabled={updating === school.id}
                          className="rounded-lg bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                        >
                          {updating === school.id ? "..." : "Cancel"}
                        </button>
                      )}
                      {school.subscriptionStatus === "cancelled" && (
                        <button
                          onClick={() => handleSubscriptionAction(school.id, "activate", "standard", "monthly")}
                          disabled={updating === school.id}
                          className="rounded-lg bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-400 transition hover:bg-cyan-500/20 disabled:opacity-50"
                        >
                          {updating === school.id ? "..." : "Reactivate"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
