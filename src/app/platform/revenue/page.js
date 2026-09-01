"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Building2,
  ArrowRight,
  BarChart3,
  Users,
  CreditCard,
  Clock,
  CheckCircle,
  Zap,
  Crown,
  XCircle,
} from "lucide-react";

const naira = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const PLAN_COLORS = {
  trial: { bg: "bg-zinc-500/10", text: "text-zinc-400", ring: "ring-zinc-500/20" },
  starter: { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "ring-emerald-500/20" },
  standard: { bg: "bg-cyan-500/10", text: "text-cyan-400", ring: "ring-cyan-500/20" },
  enterprise: { bg: "bg-violet-500/10", text: "text-violet-400", ring: "ring-violet-500/20" },
};

const STATUS_STYLES = {
  active: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: CheckCircle, label: "Active" },
  trial: { bg: "bg-amber-500/10", text: "text-amber-400", icon: Clock, label: "Trial" },
  expired: { bg: "bg-red-500/10", text: "text-red-400", icon: XCircle, label: "Expired" },
  cancelled: { bg: "bg-zinc-500/10", text: "text-zinc-400", icon: XCircle, label: "Cancelled" },
};

/** Simple horizontal bar for plan distribution */
function PlanBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-gray-300">{label}</span>
        <span className="text-gray-500">{count} ({pct}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Revenue Dashboard — SaaS subscription revenue metrics for platform admins.
 * Shows MRR, ARR, churn risk, plan distribution, and per-school billing status.
 */
export default function RevenuePage() {
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/platform/revenue");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (!cancelled) setRevenue(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  const data = revenue || {};
  const schools = data.schools || [];
  const mrr = data.mrr || 0;
  const arr = data.arr || 0;
  const activeSubscriptions = data.activeSubscriptions || 0;
  const trialSchools = data.trialSchools || 0;
  const expiredSchools = data.expiredSchools || 0;
  const cancelledSchools = data.cancelledSchools || 0;
  const planCounts = data.planCounts || {};
  const totalSchools = schools.length;

  // Churn risk = schools on trial nearing end or expired
  const churnRisk = trialSchools + expiredSchools;
  const churnRate = totalSchools > 0 ? Math.round((churnRisk / totalSchools) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
          <DollarSign className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue Dashboard</h1>
          <p className="text-sm text-gray-400">SaaS subscription revenue & billing metrics across all tenants</p>
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* MRR */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            <p className="text-[10px] font-bold tracking-widest text-emerald-500/70">MRR</p>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">{naira(mrr)}</p>
          <p className="mt-1 text-xs text-gray-500">Monthly Recurring Revenue</p>
        </div>

        {/* ARR */}
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cyan-400" />
            <p className="text-[10px] font-bold tracking-widest text-cyan-500/70">ARR</p>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">{naira(arr)}</p>
          <p className="mt-1 text-xs text-gray-500">Annual Recurring Revenue</p>
        </div>

        {/* Active Subscriptions */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-blue-400" />
            <p className="text-[10px] font-bold tracking-widest text-blue-500/70">SUBSCRIPTIONS</p>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">{activeSubscriptions}</p>
          <p className="mt-1 text-xs text-gray-500">
            of {totalSchools} schools paying
          </p>
        </div>

        {/* Churn Risk */}
        <div className={`rounded-xl border p-5 ${churnRisk > 0 ? "border-red-500/20 bg-red-500/5" : "border-white/5 bg-[#0f1219]"}`}>
          <div className="flex items-center gap-2">
            {churnRisk > 0 ? (
              <TrendingDown className="h-4 w-4 text-red-400" />
            ) : (
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            )}
            <p className={`text-[10px] font-bold tracking-widest ${churnRisk > 0 ? "text-red-500/70" : "text-gray-500"}`}>CHURN RISK</p>
          </div>
          <p className="mt-3 text-2xl font-bold text-white">{churnRate}%</p>
          <p className="mt-1 text-xs text-gray-500">
            {trialSchools} trial · {expiredSchools} expired
          </p>
        </div>
      </div>

      {/* Plan Distribution + Fee Collection */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Plan Distribution */}
        <div className="rounded-xl border border-white/5 bg-[#0f1219] p-6">
          <div className="flex items-center gap-2 mb-5">
            <Zap className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Plan Distribution</h3>
          </div>
          <div className="space-y-4">
            <PlanBar
              label="Trial"
              count={planCounts.trial || 0}
              total={totalSchools}
              color="bg-zinc-500"
            />
            <PlanBar
              label="Starter"
              count={planCounts.starter || 0}
              total={totalSchools}
              color="bg-emerald-500"
            />
            <PlanBar
              label="Standard"
              count={planCounts.standard || 0}
              total={totalSchools}
              color="bg-cyan-500"
            />
            <PlanBar
              label="Enterprise"
              count={planCounts.enterprise || 0}
              total={totalSchools}
              color="bg-violet-500"
            />
          </div>

          {/* Plan Legend */}
          <div className="mt-6 space-y-2 border-t border-white/5 pt-4">
            {[
              { label: "Starter", price: "₦150/student/mo", color: "bg-emerald-400" },
              { label: "Standard", price: "₦350/student/mo", color: "bg-cyan-400" },
              { label: "Enterprise", price: "Custom pricing", color: "bg-violet-400" },
            ].map((p) => (
              <div key={p.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${p.color}`} />
                  <span className="text-gray-400">{p.label}</span>
                </div>
                <span className="text-gray-600">{p.price}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fee Collection Summary */}
        <div className="rounded-xl border border-white/5 bg-[#0f1219] p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">School Fee Collection (All Tenants)</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-[10px] font-bold tracking-widest text-gray-500">TOTAL BILLED</p>
              <p className="mt-2 text-xl font-bold text-white">{naira(data.totalBilled || 0)}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4">
              <p className="text-[10px] font-bold tracking-widest text-emerald-500/70">COLLECTED</p>
              <p className="mt-2 text-xl font-bold text-emerald-400">{naira(data.totalCollected || 0)}</p>
            </div>
            <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-4">
              <p className="text-[10px] font-bold tracking-widest text-amber-500/70">OUTSTANDING</p>
              <p className="mt-2 text-xl font-bold text-amber-400">{naira(data.totalOutstanding || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Per-School Billing Table */}
      <div className="rounded-xl border border-white/5 bg-[#0f1219]">
        <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
            <Building2 className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-white">Per-School Billing Status</h2>
            <p className="text-xs text-gray-500">Subscription & fee collection breakdown for each tenant</p>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-semibold text-gray-500">
            <Building2 className="h-3 w-3" /> {totalSchools} tenants
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-bold tracking-wider text-gray-500">
                <th className="px-6 py-3">TENANT</th>
                <th className="px-6 py-3">PLAN</th>
                <th className="px-6 py-3">CYCLE</th>
                <th className="px-6 py-3">STATUS</th>
                <th className="px-6 py-3 text-right">STUDENTS</th>
                <th className="px-6 py-3 text-right">MRR</th>
                <th className="px-6 py-3 text-right">COLLECTED</th>
                <th className="px-6 py-3 text-right">OUTSTANDING</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {schools.map((school) => {
                const planId = school.billingPlan || "trial";
                const status = school.subscriptionStatus || "trial";
                const cycle = school.billingCycle || "monthly";
                const colors = PLAN_COLORS[planId] || PLAN_COLORS.trial;
                const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.trial;
                const StatusIcon = statusStyle.icon;
                const schoolMrr =
                  status === "active" && planId !== "trial"
                    ? (school.billingCycle === "annual"
                        ? (school.billingPlan === "starter" ? 1000 : 2500) * (school.studentCount || 0) / 12
                        : (school.billingPlan === "starter" ? 150 : 350) * (school.studentCount || 0))
                    : 0;
                const feeRate =
                  (school.totalBilled || 0) > 0
                    ? Math.round(((school.totalCollected || 0) / school.totalBilled) * 100)
                    : 0;

                return (
                  <tr key={school.id} className="transition hover:bg-white/[0.02]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                          style={{ backgroundColor: school.brandColor || "#2563EB" }}
                        >
                          {school.name
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{school.name}</p>
                          <p className="text-xs text-gray-600">
                            {school.studentCount || 0} students
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${colors.bg} ${colors.text} ${colors.ring}`}
                      >
                        {planId === "starter" && <Zap className="h-2.5 w-2.5" />}
                        {planId === "standard" && <Crown className="h-2.5 w-2.5" />}
                        {planId === "enterprise" && <Building2 className="h-2.5 w-2.5" />}
                        {planId === "trial" && <Clock className="h-2.5 w-2.5" />}
                        {planId.charAt(0).toUpperCase() + planId.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 capitalize">{cycle}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        <StatusIcon className="h-2.5 w-2.5" />
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-300">
                      {school.studentCount || 0}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-emerald-400">
                      {schoolMrr > 0 ? naira(schoolMrr) : "—"}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-300">
                      {naira(school.totalCollected || 0)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(school.totalOutstanding || 0) > 0 ? (
                        <span className="font-semibold text-amber-400">
                          {naira(school.totalOutstanding)}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/platform/schools/${school.id}`}
                        className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {schools.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-gray-500">
                    No schools registered yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue Insights */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upgrade Opportunities */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold text-amber-300">Revenue Opportunities</h3>
          </div>
          <div className="space-y-3">
            {trialSchools > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-amber-500/5 p-3">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-200">
                    {trialSchools} school{trialSchools > 1 ? "s" : ""} on trial
                  </p>
                  <p className="text-xs text-amber-400/70">
                    Convert trials to paid plans to increase MRR
                  </p>
                </div>
              </div>
            )}
            {expiredSchools > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-red-500/5 p-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-red-200">
                    {expiredSchools} school{expiredSchools > 1 ? "s" : ""} with expired subscriptions
                  </p>
                  <p className="text-xs text-red-400/70">
                    Reach out to recover lost revenue
                  </p>
                </div>
              </div>
            )}
            {trialSchools === 0 && expiredSchools === 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-emerald-500/5 p-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-emerald-200">All schools are on active plans</p>
                  <p className="text-xs text-emerald-400/70">No churn risk detected</p>
                </div>
              </div>
            )}
            {(planCounts.starter || 0) > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-cyan-500/5 p-3">
                <Crown className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <div>
                  <p className="text-sm font-semibold text-cyan-200">
                    {planCounts.starter} Starter school{planCounts.starter > 1 ? "s" : ""} ready to upgrade
                  </p>
                  <p className="text-xs text-cyan-400/70">
                    Standard plan unlocks advanced features
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Key Metrics Summary */}
        <div className="rounded-xl border border-white/5 bg-[#0f1219] p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Key Metrics Summary</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <span className="text-xs text-gray-400">Avg. Revenue per School</span>
              <span className="text-sm font-bold text-white">
                {naira(totalSchools > 0 ? mrr / totalSchools : 0)}/mo
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <span className="text-xs text-gray-400">Avg. Revenue per Student</span>
              <span className="text-sm font-bold text-white">
                {naira(
                  schools.reduce((acc, s) => acc + (s.studentCount || 0), 0) > 0
                    ? mrr / schools.reduce((acc, s) => acc + (s.studentCount || 0), 0)
                    : 0
                )}/mo
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <span className="text-xs text-gray-400">Conversion Rate (Trial → Paid)</span>
              <span className="text-sm font-bold text-white">
                {totalSchools > 0
                  ? Math.round(((activeSubscriptions) / totalSchools) * 100)
                  : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <span className="text-xs text-gray-400">Fee Collection Rate</span>
              <span className="text-sm font-bold text-white">
                {(data.totalBilled || 0) > 0
                  ? Math.round(((data.totalCollected || 0) / data.totalBilled) * 100)
                  : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
