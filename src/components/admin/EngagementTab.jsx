"use client";

import { useState, useEffect } from "react";
import { Users, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Parent engagement scoring dashboard.
 * Shows engagement tiers, average score, and disengaged parent list.
 */
export default function EngagementTab({ session }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEngagement();
  }, []);

  async function loadEngagement() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/engagement");
      const data = await res.json();
      setSummary(data);
    } catch {}
    setLoading(false);
  }

  const tierConfig = {
    highly_engaged: { label: "Highly Engaged", color: "#059669", bg: "#ecfdf5", icon: CheckCircle2 },
    moderately_engaged: { label: "Moderately Engaged", color: "#2563eb", bg: "#eff6ff", icon: Users },
    low_engagement: { label: "Low Engagement", color: "#d97706", bg: "#fffbeb", icon: AlertTriangle },
    disengaged: { label: "Disengaged", color: "#e11d48", bg: "#fff1f2", icon: AlertTriangle },
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-navy-400">Loading engagement data...</div>;
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="rounded-2xl border border-navy-200/70 bg-white py-12 text-center shadow-sm">
        <Users className="mx-auto h-10 w-10 text-navy-300" />
        <p className="mt-3 text-sm font-medium text-navy-500">No parent engagement data yet</p>
        <p className="text-xs text-navy-400">Engagement scores appear once parents start using the portal.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-navy-800">Parent Engagement</h2>
        <p className="text-sm text-navy-400">Track which parents regularly use the portal, pay on time, and respond to messages.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm text-center">
          <p className="text-2xl font-bold text-navy-800">{summary.total}</p>
          <p className="text-xs text-navy-400">Total Parents</p>
        </div>
        <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm text-center">
          <p className="text-2xl font-bold text-brand-600">{summary.averageScore}</p>
          <p className="text-xs text-navy-400">Average Score</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm text-center">
          <p className="text-2xl font-bold text-emerald-600">{summary.byTier?.highlyEngaged || 0}</p>
          <p className="text-xs text-emerald-600">Highly Engaged</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm text-center">
          <p className="text-2xl font-bold text-amber-600">{summary.byTier?.lowEngagement || 0}</p>
          <p className="text-xs text-amber-600">Low Engagement</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm text-center">
          <p className="text-2xl font-bold text-red-600">{summary.byTier?.disengaged || 0}</p>
          <p className="text-xs text-red-600">Disengaged</p>
        </div>
      </div>

      {/* Engagement tier breakdown */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(tierConfig).map(([tier, config]) => {
          const count = summary.byTier?.[tier === "highly_engaged" ? "highlyEngaged" :
                                         tier === "moderately_engaged" ? "moderatelyEngaged" :
                                         tier === "low_engagement" ? "lowEngagement" : "disengaged"] || 0;
          const Icon = config.icon;
          return (
            <div key={tier} className="rounded-2xl border p-5" style={{ borderColor: config.color + "40", backgroundColor: config.bg }}>
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5" style={{ color: config.color }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: config.color }}>{config.label}</p>
                  <p className="text-2xl font-bold text-navy-800">{count} parent{count !== 1 ? "s" : ""}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disengaged parents list */}
      {summary.disengagedParents?.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-red-700">
            <AlertTriangle className="h-5 w-5" />
            Disengaged Parents — Reach Out
          </h3>
          <div className="space-y-2">
            {summary.disengagedParents.map((p) => (
              <div key={p.parentId} className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                    {p.parentName?.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                  </div>
                  <span className="text-sm font-semibold text-navy-800">{p.parentName}</span>
                </div>
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                  Score: {p.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
