"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Users,
  Building2,
  GitCompareArrows,
  X,
  Plus,
} from "lucide-react";

/* ── Colors for multiple schools ── */
const SCHOOL_COLORS = ["#22d3ee", "#f59e0b", "#a78bfa", "#f472b6"];
const SCHOOL_COLORS_SOFT = ["rgba(34,211,238,0.15)", "rgba(245,158,11,0.15)", "rgba(167,139,250,0.15)", "rgba(244,114,182,0.15)"];

function formatCurrency(amount) {
  if (amount >= 1000000) return `\u20A6${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `\u20A6${(amount / 1000).toFixed(1)}K`;
  return `\u20A6${Number(amount).toLocaleString()}`;
}

/* ── Overlay Area Chart ── */
function OverlayChart({ schools, dataKey, height = 200, title }) {
  if (!schools || schools.length === 0) return null;

  const padding = { top: 16, right: 16, bottom: 32, left: 40 };
  const w = 600;
  const h = height;
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  // Compute max across all schools
  const allValues = schools.flatMap((s) => {
    const hist = dataKey === "revenue" ? s.revenueHistory : s.enrollmentHistory;
    return (hist || []).map((d) => d[dataKey === "revenue" ? "collected" : "total"]);
  });
  const max = Math.max(...allValues, 1);

  // Use first school's labels for x-axis
  const labels = (schools[0]?.enrollmentHistory || []).map((d) => d.label);
  const labelStep = Math.max(1, Math.floor(labels.length / 6));

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    y: padding.top + plotH * (1 - frac),
    value: Math.round(max * frac),
    label: dataKey === "revenue" ? formatCurrency(Math.round(max * frac)) : String(Math.round(max * frac)),
  }));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${h}px` }}>
      {/* Grid lines + Y labels */}
      {yTicks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={padding.left} y1={tick.y} x2={padding.left + plotW} y2={tick.y}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1"
          />
          <text x={padding.left - 6} y={tick.y + 3} textAnchor="end"
            style={{ fontSize: "8px", fill: "#6b7280", fontFamily: "inherit" }}>
            {tick.label}
          </text>
        </g>
      ))}

      {/* One line + area per school */}
      {schools.map((school, si) => {
        const hist = dataKey === "revenue" ? school.revenueHistory : school.enrollmentHistory;
        const values = (hist || []).map((d) => d[dataKey === "revenue" ? "collected" : "total"]);
        const color = SCHOOL_COLORS[si % SCHOOL_COLORS.length];
        const softColor = SCHOOL_COLORS_SOFT[si % SCHOOL_COLORS_SOFT.length];

        const points = values.map((v, i) => ({
          x: padding.left + (i / (values.length - 1)) * plotW,
          y: padding.top + plotH - (v / max) * plotH,
        }));

        // Build smooth path
        let pathD = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cpx = (prev.x + curr.x) / 2;
          pathD += ` Q ${prev.x + (cpx - prev.x) * 0.5} ${prev.y} ${cpx} ${(prev.y + curr.y) / 2}`;
          pathD += ` Q ${curr.x - (curr.x - cpx) * 0.5} ${curr.y} ${curr.x} ${curr.y}`;
        }
        const areaD = pathD + ` L ${points[points.length - 1].x} ${padding.top + plotH} L ${points[0].x} ${padding.top + plotH} Z`;

        const gradId = `grad-comp-${si}-${dataKey}`;

        return (
          <g key={school.id}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={color} stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <path d={areaD} fill={`url(#${gradId})`} />
            <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
            {/* End dot */}
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4" fill={color} />
          </g>
        );
      })}

      {/* X-axis labels */}
      {labels.map((label, i) => {
        if (i % labelStep !== 0 && i !== labels.length - 1) return null;
        const x = padding.left + (i / (labels.length - 1)) * plotW;
        return (
          <text key={i} x={x} y={h - 8} textAnchor="middle"
            style={{ fontSize: "9px", fill: "#6b7280", fontFamily: "inherit" }}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}

/* ── Main Page ─────────────────────────────────────────── */
export default function ComparePage() {
  const [allSchools, setAllSchools] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [compared, setCompared] = useState([]);
  const [loading, setLoading] = useState(false);
  const [compareMode, setCompareMode] = useState("enrollment"); // enrollment | revenue

  // Load all schools
  useEffect(() => {
    fetch("/api/platform/overview")
      .then((r) => r.json())
      .then((d) => setAllSchools(d.schools || []))
      .catch(() => {});
  }, []);

  // Fetch comparison data when schools are selected
  useEffect(() => {
    let cancelled = false;
    const ids = selectedIds.length >= 2 ? selectedIds : null;
    if (!ids) return () => { cancelled = true; };
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- loading indicator
    (async () => {
      try {
        const res = await fetch(`/api/platform/compare?ids=${ids.join(",")}`);
        const d = await res.json();
        if (!cancelled) { setCompared(d.schools || []); setLoading(false); }
      } catch {
        if (!cancelled) { setCompared([]); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedIds]);

  function toggleSchool(id) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  function removeSchool(id) {
    setSelectedIds((prev) => prev.filter((i) => i !== id));
  }

  const selectedSchools = allSchools.filter((s) => selectedIds.includes(s.id));

  // Summary stats for comparison
  const summaryStats = useMemo(() => {
    if (compared.length === 0) return [];
    return compared.map((s) => ({
      id: s.id,
      name: s.name,
      color: SCHOOL_COLORS[compared.indexOf(s) % SCHOOL_COLORS.length],
      students: s.students,
      teachers: s.teachers,
      totalPaid: s.totalPaid,
      totalBalance: s.totalBalance,
      latestEnrollment: s.enrollmentHistory?.[s.enrollmentHistory.length - 1]?.total || 0,
      earliestEnrollment: s.enrollmentHistory?.[0]?.total || 0,
      enrollmentGrowth: (s.enrollmentHistory?.[s.enrollmentHistory.length - 1]?.total || 0)
        - (s.enrollmentHistory?.[0]?.total || 0),
    }));
  }, [compared]);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/platform/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition hover:text-white">
        <ArrowLeft className="h-3 w-3" /> Back to Overview
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
          <GitCompareArrows className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">School Comparison</h1>
          <p className="text-sm text-gray-500">Compare enrollment and revenue trends across tenants</p>
        </div>
      </div>

      {/* ═══ School Selector ═══ */}
      <div className="rounded-xl border border-white/5 bg-[#0f1219] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Select Schools to Compare</h2>
          <span className="text-[11px] text-gray-500">{selectedIds.length}/4 selected</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {allSchools.map((school, i) => {
            const isSelected = selectedIds.includes(school.id);
            const colorIdx = selectedIds.indexOf(school.id);
            const color = colorIdx >= 0 ? SCHOOL_COLORS[colorIdx] : undefined;
            return (
              <button
                key={school.id}
                onClick={() => toggleSchool(school.id)}
                disabled={!isSelected && selectedIds.length >= 4}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? "border-cyan-500/30 bg-cyan-500/5"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                } disabled:opacity-40`}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: color || school.brandColor || "#2563EB" }}
                >
                  {school.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-xs font-semibold ${isSelected ? "text-white" : "text-gray-300"}`}>
                    {school.name}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {school.studentCount || 0} students · {school.teacherCount || 0} teachers
                  </p>
                </div>
                {isSelected && (
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected school chips */}
        {selectedIds.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {selectedIds.map((id, i) => {
              const s = allSchools.find((sc) => sc.id === id);
              if (!s) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ backgroundColor: SCHOOL_COLORS_SOFT[i], color: SCHOOL_COLORS[i] }}
                >
                  {s.name}
                  <button onClick={() => removeSchool(id)} className="hover:opacity-70">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ Comparison Charts ═══ */}
      {selectedIds.length >= 2 && (
        <>
          {/* Mode Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompareMode("enrollment")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                compareMode === "enrollment"
                  ? "bg-cyan-500/10 text-cyan-400"
                  : "bg-white/[0.03] text-gray-400 hover:bg-white/[0.06]"
              }`}
            >
              <Users className="h-3.5 w-3.5" /> Enrollment
            </button>
            <button
              onClick={() => setCompareMode("revenue")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                compareMode === "revenue"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-white/[0.03] text-gray-400 hover:bg-white/[0.06]"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Revenue
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
            </div>
          ) : compared.length >= 2 ? (
            <>
              {/* Overlay Chart */}
              <div className="rounded-xl border border-white/5 bg-[#0f1219] p-6">
                <div className="mb-4 flex items-center gap-3">
                  <TrendingUp className="h-4 w-4 text-cyan-400" />
                  <h2 className="text-sm font-bold text-white">
                    {compareMode === "enrollment" ? "Enrollment" : "Revenue"} Comparison
                  </h2>
                  <span className="text-[10px] text-gray-500">12-month overlay</span>
                </div>

                {/* Legend */}
                <div className="mb-4 flex flex-wrap items-center gap-4">
                  {compared.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SCHOOL_COLORS[i] }} />
                      <span className="text-xs text-gray-300">{s.name}</span>
                    </div>
                  ))}
                </div>

                <OverlayChart schools={compared} dataKey={compareMode} height={220} />
              </div>

              {/* Side-by-side Stats */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {summaryStats && summaryStats.map((stat) => (
                  <div
                    key={stat.id}
                    className="rounded-xl border bg-[#0f1219] p-4"
                    style={{ borderColor: `${stat.color}20` }}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stat.color }} />
                      <p className="truncate text-xs font-bold text-white">{stat.name}</p>
                    </div>
                    {compareMode === "enrollment" ? (
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] font-bold tracking-wider text-gray-500">CURRENT</p>
                          <p className="text-xl font-bold text-white">{stat.latestEnrollment}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold tracking-wider text-gray-500">GROWTH (12M)</p>
                          <p className={`text-lg font-bold ${stat.enrollmentGrowth >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {stat.enrollmentGrowth >= 0 ? "+" : ""}{stat.enrollmentGrowth}
                          </p>
                        </div>
                        <div className="flex gap-3 text-[10px] text-gray-500">
                          <span>{stat.students} students</span>
                          <span>{stat.teachers} teachers</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] font-bold tracking-wider text-gray-500">COLLECTED</p>
                          <p className="text-xl font-bold text-emerald-400">{formatCurrency(stat.totalPaid)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold tracking-wider text-gray-500">OUTSTANDING</p>
                          <p className="text-lg font-bold text-red-400">{formatCurrency(stat.totalBalance)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      {/* Empty state */}
      {selectedIds.length < 2 && (
        <div className="rounded-xl border border-dashed border-white/10 bg-[#0f1219]/50 p-12 text-center">
          <Building2 className="mx-auto h-8 w-8 text-gray-700" />
          <p className="mt-3 text-sm text-gray-500">Select at least 2 schools above to compare</p>
          <p className="mt-1 text-[11px] text-gray-600">You can compare up to 4 schools side by side</p>
        </div>
      )}
    </div>
  );
}
