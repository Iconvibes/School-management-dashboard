"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, TrendingDown, Shield, BookOpen, BarChart3 } from "lucide-react";

/**
 * Academic risk alerts — flags students whose grades are declining.
 * Shows on the admin dashboard as a priority card.
 */
export default function RiskAlerts({ session }) {
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    loadRisks();
  }, []);

  async function loadRisks() {
    setLoading(true);
    try {
      const res = await fetch("/api/academic-risk");
      const data = await res.json();
      setRisks(data.risks || []);
    } catch {}
    setLoading(false);
  }

  const filtered = filter === "all" ? risks : risks.filter((r) => r.severity === filter);
  const highRisks = risks.filter((r) => r.severity === "high");
  const mediumRisks = risks.filter((r) => r.severity === "medium");

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-navy-400">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy-200 border-t-brand-600" />
        <p className="mt-4 text-sm font-medium">Scanning academic performance...</p>
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-navy-800">Academic Risk Alerts</h2>
          <p className="text-sm text-navy-400">
            Automatic early-warning system that flags students whose grades are declining across subjects.
          </p>
        </div>

        {/* Empty state — detailed */}
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <Shield className="h-8 w-8 text-emerald-600" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-emerald-800">All clear — no risk detected</h3>
          <p className="mt-2 max-w-md mx-auto text-sm text-emerald-600">
            Every student is maintaining or improving their performance. The system scans
            each time grades are entered and flags any declining trends.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="rounded-xl bg-white/80 p-4 ring-1 ring-emerald-200/60">
              <BookOpen className="mx-auto h-5 w-5 text-emerald-500" />
              <p className="mt-2 text-xs font-semibold text-navy-700">Grade tracking</p>
              <p className="mt-1 text-[11px] text-navy-400">Monitors CA & exam scores per subject</p>
            </div>
            <div className="rounded-xl bg-white/80 p-4 ring-1 ring-emerald-200/60">
              <BarChart3 className="mx-auto h-5 w-5 text-emerald-500" />
              <p className="mt-2 text-xs font-semibold text-navy-700">Trend analysis</p>
              <p className="mt-1 text-[11px] text-navy-400">Compares current vs previous averages</p>
            </div>
            <div className="rounded-xl bg-white/80 p-4 ring-1 ring-emerald-200/60">
              <AlertTriangle className="mx-auto h-5 w-5 text-emerald-500" />
              <p className="mt-2 text-xs font-semibold text-navy-700">Early warning</p>
              <p className="mt-1 text-[11px] text-navy-400">Flags drops before they become failures</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-navy-800">Academic Risk Alerts</h2>
        <p className="text-sm text-navy-400">
          Students whose grades are declining — intervene early to prevent further drops.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-navy-200/70 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-navy-800">{risks.length}</p>
          <p className="text-xs text-navy-400">Total alerts</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-600">{highRisks.length}</p>
          <p className="text-xs text-red-500">High risk</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-amber-600">{mediumRisks.length}</p>
          <p className="text-xs text-amber-500">Medium risk</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {["all", "high", "medium"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === f ? "bg-navy-800 text-white shadow-sm" : "bg-navy-100 text-navy-600 hover:bg-navy-200"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "high" && highRisks.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                {highRisks.length}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-xs text-navy-400">
          {filtered.length} alert{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Risk list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-navy-200 bg-white py-8 text-center">
            <p className="text-sm text-navy-500">No {filter} risk alerts</p>
          </div>
        ) : (
          filtered.map((risk, i) => (
            <div
              key={`${risk.studentId}-${risk.subject}-${i}`}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl border px-5 py-4 transition ${
                risk.severity === "high"
                  ? "border-red-200 bg-red-50/50 hover:bg-red-50"
                  : "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                risk.severity === "high" ? "bg-red-100" : "bg-amber-100"
              }`}>
                <TrendingDown className={`h-5 w-5 ${risk.severity === "high" ? "text-red-600" : "text-amber-600"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-navy-800">{risk.studentName}</p>
                <p className="text-xs text-navy-500">
                  {risk.subject} · {risk.classArm}
                </p>
                <p className="mt-1 text-xs text-navy-600">
                  <span className="font-semibold">{risk.previousAverage}%</span>
                  {" → "}
                  <span className="font-semibold">{risk.currentAverage}%</span>
                  <span className={`ml-2 font-bold ${
                    risk.severity === "high" ? "text-red-600" : "text-amber-600"
                  }`}>
                    ↓{risk.drop}%
                  </span>
                </p>
              </div>
              <span className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${
                risk.severity === "high"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {risk.severity === "high" ? "High Risk" : "Medium Risk"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
