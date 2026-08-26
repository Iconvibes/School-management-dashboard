"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Building2,
  ArrowRight,
  BarChart3,
} from "lucide-react";

const naira = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

/**
 * Revenue Dashboard — dark control-center design.
 * Unique from school fee dashboards.
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

  const totalCollected = schools.reduce((acc, s) => acc + (s.totalCollected || 0), 0);
  const totalOutstanding = schools.reduce((acc, s) => acc + (s.totalOutstanding || 0), 0);
  const totalBilled = schools.reduce((acc, s) => acc + (s.totalBilled || 0), 0);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
          <BarChart3 className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue Intelligence</h1>
          <p className="text-sm text-gray-400">Fee collection metrics across all tenants</p>
        </div>
      </div>

      {/* Metrics — Large horizontal cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/5 bg-[#0f1219] p-5">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <p className="text-[10px] font-bold tracking-widest text-gray-500">COLLECTED</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{naira(totalCollected)}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#0f1219] p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <p className="text-[10px] font-bold tracking-widest text-gray-500">OUTSTANDING</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{naira(totalOutstanding)}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#0f1219] p-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-cyan-400" />
              <p className="text-[10px] font-bold tracking-widest text-gray-500">COLLECTION RATE</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{collectionRate}%</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#0f1219] p-5">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-violet-400" />
              <p className="text-[10px] font-bold tracking-widest text-gray-500">TENANTS</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{schools.length}</p>
          </div>
      </div>

      {/* Revenue Table — Dark table design */}
      <div className="rounded-xl border border-white/5 bg-[#0f1219]">
        <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
            <Building2 className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Revenue by Tenant</h2>
            <p className="text-xs text-gray-500">Fee collection breakdown per school</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-bold tracking-wider text-gray-500">
                <th className="px-6 py-3">TENANT</th>
                <th className="px-6 py-3 text-right">STUDENTS</th>
                <th className="px-6 py-3 text-right">BILLED</th>
                <th className="px-6 py-3 text-right">COLLECTED</th>
                <th className="px-6 py-3 text-right">OUTSTANDING</th>
                <th className="px-6 py-3 text-right">RATE</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {schools.map((school) => {
                const rate = school.totalBilled > 0
                  ? Math.round((school.totalCollected / school.totalBilled) * 100)
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
                        <span className="font-semibold text-white">{school.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-300">{school.studentCount || 0}</td>
                    <td className="px-6 py-4 text-right text-gray-300">{naira(school.totalBilled || 0)}</td>
                    <td className="px-6 py-4 text-right font-semibold text-emerald-400">{naira(school.totalCollected || 0)}</td>
                    <td className="px-6 py-4 text-right font-semibold text-amber-400">{naira(school.totalOutstanding || 0)}</td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          rate >= 80
                            ? "bg-emerald-500/10 text-emerald-400"
                            : rate >= 50
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {rate}%
                      </span>
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
                  <td colSpan={7} className="px-6 py-16 text-center text-gray-500">
                    No revenue data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Note */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Revenue tracking is per-tenant</p>
            <p className="mt-1 text-xs text-gray-400">
              Each school manages its own fee structures and collects payments independently.
              This dashboard aggregates their fee collection data for platform-level visibility.
              When you implement SaaS billing (charging schools for using EduTrack), this dashboard
              will expand to show subscription revenue, MRR, and churn metrics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
