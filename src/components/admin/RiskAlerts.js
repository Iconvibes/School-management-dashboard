"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, TrendingDown, ChevronRight } from "lucide-react";

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

  if (loading) {
    return <div className="flex items-center justify-center py-6 text-navy-400">Scanning...</div>;
  }

  if (risks.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 text-center">
        <TrendingDown className="mx-auto h-8 w-8 text-emerald-400" />
        <p className="mt-2 text-sm font-medium text-emerald-700">No declining students detected</p>
        <p className="text-xs text-emerald-500">All students are maintaining or improving their performance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h3 className="font-bold text-navy-800">Academic Risk Alerts</h3>
          {highRisks.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
              {highRisks.length} high
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {["all", "high", "medium"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                filter === f ? "bg-navy-800 text-white" : "text-navy-500 hover:bg-navy-100"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((risk, i) => (
          <div
            key={`${risk.studentId}-${risk.subject}-${i}`}
            className={`flex items-center gap-4 rounded-xl border px-5 py-3 transition ${
              risk.severity === "high"
                ? "border-red-200 bg-red-50/50"
                : "border-amber-200 bg-amber-50/50"
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
                {risk.subject} — {risk.classArm} · {risk.previousAverage}% → {risk.currentAverage}%
                <span className={`ml-2 font-bold ${risk.severity === "high" ? "text-red-600" : "text-amber-600"}`}>
                  ↓{risk.drop}%
                </span>
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              risk.severity === "high"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}>
              {risk.severity === "high" ? "High Risk" : "Medium Risk"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
