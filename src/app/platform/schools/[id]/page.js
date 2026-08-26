"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ArrowLeft,
  LogIn,
  Users,
  GraduationCap,
  Layers,
  Shield,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRightLeft,
  ChevronRight,
  ChevronDown,
  User,
  Calendar,
  BarChart3,
  Activity,
  Filter,
  X,
  Sparkles,
  Target,
  Info,
} from "lucide-react";

/* ── Helpers ────────────────────────────────────────────────── */

function formatCurrency(amount) {
  if (amount >= 1000000) return `\u20A6${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `\u20A6${(amount / 1000).toFixed(1)}K`;
  return `\u20A6${amount.toLocaleString()}`;
}

function formatFullCurrency(amount) {
  return `\u20A6${Number(amount).toLocaleString()}`;
}

function formatTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function getDateKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

const ACTIVITY_COLORS = {
  impersonate: { bg: "bg-violet-500/10", border: "border-violet-500/20", text: "text-violet-400", icon: "🔀" },
  plan_change: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400", icon: "💳" },
  subscription_activate: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", icon: "✅" },
  subscription_cancel: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400", icon: "❌" },
  school_status_change: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", icon: "⚠️" },
  school_created: { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-400", icon: "🏫" },
  config_change: { bg: "bg-zinc-500/10", border: "border-zinc-500/20", text: "text-zinc-400", icon: "⚙️" },
  school_frozen: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400", icon: "🧊" },
  school_restored: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", icon: "🔄" },
};

/* ── SVG Mini Charts ────────────────────────────────────────── */

function SparkAreaChart({ data, dataKey, color = "#22d3ee", height = 120, showLabels = true, onMonthClick, selectedMonth }) {
  if (!data || data.length === 0) return null;

  const values = data.map((d) => d[dataKey] || 0);
  const max = Math.max(...values, 1);
  const padding = { top: 8, right: 8, bottom: showLabels ? 24 : 8, left: 8 };
  const w = 400;
  const h = height;
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  const points = values.map((v, i) => ({
    x: padding.left + (i / (values.length - 1)) * plotW,
    y: padding.top + plotH - (v / max) * plotH,
  }));

  // Smooth curve using quadratic bezier
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    pathD += ` Q ${prev.x + (cpx - prev.x) * 0.5} ${prev.y} ${cpx} ${(prev.y + curr.y) / 2}`;
    pathD += ` Q ${curr.x - (curr.x - cpx) * 0.5} ${curr.y} ${curr.x} ${curr.y}`;
  }

  const areaD = pathD + ` L ${points[points.length - 1].x} ${padding.top + plotH} L ${points[0].x} ${padding.top + plotH} Z`;

  // Label indices (show every 3rd)
  const labelStep = Math.max(1, Math.floor(data.length / 4));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${h}px` }}>
      <defs>
        <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <line
          key={frac}
          x1={padding.left}
          y1={padding.top + plotH * (1 - frac)}
          x2={padding.left + plotW}
          y2={padding.top + plotH * (1 - frac)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}
      {/* Area fill */}
      <path d={areaD} fill={`url(#grad-${dataKey})`} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Dots on last point */}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill={color} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="6" fill={color} opacity="0.2" />
      {/* Clickable month columns */}
      {onMonthClick && data.map((d, i) => {
        const colW = plotW / data.length;
        const x = padding.left + (i / data.length) * plotW;
        const isSelected = selectedMonth === d.key;
        return (
          <rect
            key={`col-${i}`}
            x={x}
            y={padding.top}
            width={colW}
            height={plotH}
            fill={isSelected ? "rgba(255,255,255,0.06)" : "transparent"}
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onClick={() => onMonthClick(isSelected ? null : d.key)}
            rx="4"
          />
        );
      })}
      {/* Data point dots for click targets */}
      {onMonthClick && points.map((pt, i) => (
        <circle
          key={`dot-${i}`}
          cx={pt.x}
          cy={pt.y}
          r={selectedMonth === data[i].key ? 6 : 4}
          fill={selectedMonth === data[i].key ? color : "rgba(255,255,255,0.3)"}
          stroke={selectedMonth === data[i].key ? "white" : "none"}
          strokeWidth={selectedMonth === data[i].key ? 2 : 0}
          style={{ cursor: "pointer", pointerEvents: "all", opacity: selectedMonth && selectedMonth !== data[i].key ? 0.4 : 1 }}
          onClick={() => onMonthClick(selectedMonth === data[i].key ? null : data[i].key)}
        />
      ))}
      {/* Labels */}
      {showLabels && data.map((d, i) => {
        if (i % labelStep !== 0 && i !== data.length - 1) return null;
        const isSelected = selectedMonth === d.key;
        return (
          <text
            key={i}
            x={points[i].x}
            y={h - 4}
            textAnchor="middle"
            className={onMonthClick ? "cursor-pointer" : ""}
            fill={isSelected ? "white" : "#6b7280"}
            style={{ fontSize: "9px", fontFamily: "inherit", fontWeight: isSelected ? 700 : 400 }}
            onClick={() => onMonthClick(isSelected ? null : d.key)}
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

function BarChart({ data, height = 160 }) {
  if (!data || data.length === 0) return null;

  const values = data.map((d) => d.collected || 0);
  const max = Math.max(...values, 1);
  const padding = { top: 12, right: 8, bottom: 28, left: 8 };
  const w = 400;
  const h = height;
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;
  const barW = Math.max(4, (plotW / data.length) * 0.6);
  const gap = (plotW - barW * data.length) / (data.length - 1 || 1);

  const labelStep = Math.max(1, Math.floor(data.length / 4));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${h}px` }}>
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <line
          key={frac}
          x1={padding.left}
          y1={padding.top + plotH * (1 - frac)}
          x2={padding.left + plotW}
          y2={padding.top + plotH * (1 - frac)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}
      {/* Bars */}
      {data.map((d, i) => {
        const x = padding.left + i * (barW + gap);
        const barH = (d.collected / max) * plotH;
        const y = padding.top + plotH - barH;
        const isLast = i === data.length - 1;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(1, barH)}
              rx="2"
              fill={isLast ? "url(#barGrad)" : "rgba(52,211,153,0.4)"}
            />
            {/* Value on top */}
            {barH > 20 && (
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-emerald-400"
                style={{ fontSize: "7px", fontFamily: "inherit" }}
              >
                {d.collected > 0 ? formatCurrency(d.collected) : ""}
              </text>
            )}
            {/* Label */}
            {i % labelStep === 0 && (
              <text
                x={x + barW / 2}
                y={h - 6}
                textAnchor="middle"
                className="fill-gray-500"
                style={{ fontSize: "8px", fontFamily: "inherit" }}
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * ForecastChart — combines historical bars with projected dashed bars + confidence band.
 * history: last 12 months of { label, collected }
 * forecast: { months: [{ label, projected, lower, upper }], ... }
 */
function ForecastChart({ history, forecast, height = 180 }) {
  if (!history || history.length === 0 || !forecast || !forecast.months) return null;

  const historical = history.slice(-9);
  const projected = forecast.months;
  const allValues = [
    ...historical.map((d) => d.collected || 0),
    ...projected.map((d) => d.upper || d.projected || 0),
  ];
  const max = Math.max(...allValues, 1);

  const padding = { top: 14, right: 8, bottom: 32, left: 8 };
  const w = 500;
  const h = height;
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  const totalBars = historical.length + projected.length;
  const barW = Math.max(4, (plotW / totalBars) * 0.55);
  const gap = (plotW - barW * totalBars) / (totalBars - 1 || 1);

  // Build bar data
  const bars = [
    ...historical.map((d, i) => ({
      x: padding.left + i * (barW + gap),
      h: ((d.collected || 0) / max) * plotH,
      value: d.collected || 0,
      label: d.label,
      isForecast: false,
    })),
    ...projected.map((d, i) => ({
      x: padding.left + (historical.length + i) * (barW + gap),
      h: ((d.projected || 0) / max) * plotH,
      value: d.projected || 0,
      lower: d.lower || 0,
      upper: d.upper || 0,
      label: d.label,
      isForecast: true,
    })),
  ];

  // Divider line between historical and forecast
  const dividerX = padding.left + historical.length * (barW + gap) - gap / 2;

  const labelStep = Math.max(1, Math.floor(totalBars / 5));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${h}px` }}>
      <defs>
        <linearGradient id="forecastBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="historicalBarGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <line
          key={frac}
          x1={padding.left}
          y1={padding.top + plotH * (1 - frac)}
          x2={padding.left + plotW}
          y2={padding.top + plotH * (1 - frac)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}
      {/* Confidence band for projected bars */}
      {bars.filter((b) => b.isForecast).map((b, i) => {
        const upperH = ((b.upper || 0) / max) * plotH;
        const lowerH = ((b.lower || 0) / max) * plotH;
        const cy = padding.top + plotH - upperH;
        const ch = upperH - lowerH;
        return (
          <rect
            key={`conf-${i}`}
            x={b.x - 2}
            y={cy}
            width={barW + 4}
            height={Math.max(1, ch)}
            rx="4"
            fill="rgba(129,140,248,0.08)"
            stroke="rgba(129,140,248,0.15)"
            strokeWidth="1"
            strokeDasharray="4 2"
          />
        );
      })}
      {/* Divider line */}
      <line
        x1={dividerX}
        y1={padding.top}
        x2={dividerX}
        y2={padding.top + plotH}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      {/* Divider labels */}
      <text
        x={dividerX - 6}
        y={padding.top - 2}
        textAnchor="end"
        fill="#6b7280"
        style={{ fontSize: "7px", fontFamily: "inherit" }}
      >
        Actual
      </text>
      <text
        x={dividerX + 6}
        y={padding.top - 2}
        textAnchor="start"
        fill="#818cf8"
        style={{ fontSize: "7px", fontFamily: "inherit" }}
      >
        Projected
      </text>
      {/* Bars */}
      {bars.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={padding.top + plotH - b.h}
            width={barW}
            height={Math.max(1, b.h)}
            rx="2"
            fill={b.isForecast ? "url(#forecastBarGrad)" : "url(#historicalBarGrad2)"
            }
            opacity={b.isForecast ? 0.7 : 0.9}
          />
          {/* Dashed top for projected */}
          {b.isForecast && (
            <line
              x1={b.x}
              y1={padding.top + plotH - b.h}
              x2={b.x + barW}
              y2={padding.top + plotH - b.h}
              stroke="#818cf8"
              strokeWidth="2"
              strokeDasharray="3 2"
            />
          )}
          {/* Value on top */}
          {b.h > 18 && (
            <text
              x={b.x + barW / 2}
              y={padding.top + plotH - b.h - 4}
              textAnchor="middle"
              fill={b.isForecast ? "#818cf8" : "#34d399"}
              style={{ fontSize: "7px", fontFamily: "inherit", fontWeight: 600 }}
            >
              {b.value > 0 ? formatCurrency(b.value) : ""}
            </text>
          )}
          {/* Label */}
          {i % labelStep === 0 && (
            <text
              x={b.x + barW / 2}
              y={h - 10}
              textAnchor="middle"
              fill={b.isForecast ? "#818cf8" : "#6b7280"}
              style={{ fontSize: "7px", fontFamily: "inherit", fontWeight: b.isForecast ? 600 : 400 }}
            >
              {b.label}
            </text>
          )}
        </g>
      ))}
      {/* Confidence range label */}
      <text
        x={padding.left + plotW}
        y={h - 2}
        textAnchor="end"
        fill="#4b5563"
        style={{ fontSize: "6px", fontFamily: "inherit" }}
      >
        Confidence range shown
      </text>
    </svg>
  );
}

/* ── Section Card ───────────────────────────────────────────── */

function SectionCard({ icon: Icon, iconColor, title, subtitle, children, headerRight }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0f1219]">
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        {headerRight}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────── */

export default function SchoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [school, setSchool] = useState(null);
  const [stats, setStats] = useState(null);
  const [feeSummary, setFeeSummary] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [enrollmentHistory, setEnrollmentHistory] = useState([]);
  const [revenueHistory, setRevenueHistory] = useState([]);
  const [revenueForecast, setRevenueForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(null);
  const [error, setError] = useState(null);

  // Timeline state
  const [activityFilter, setActivityFilter] = useState("");
  const [expandedActivity, setExpandedActivity] = useState(null);

  // Enrollment drill-down state
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Enrollment chart state
  const [enrollMetric, setEnrollMetric] = useState("total"); // total | students | teachers

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/platform/schools/${params.id}`);
        if (!res.ok) throw new Error("School not found");
        const data = await res.json();
        if (!cancelled) {
          setSchool(data.school);
          setStats(data.stats);
          setFeeSummary(data.feeSummary);
          setRecentActivity(data.recentActivity || []);
          setEnrollmentHistory(data.enrollmentHistory || []);
          setRevenueHistory(data.revenueHistory || []);
          setRevenueForecast(data.revenueForecast || null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [params.id]);

  async function handleImpersonate(userId) {
    setImpersonating(userId);
    try {
      const res = await fetch(`/api/platform/schools/${params.id}/impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Impersonation failed");
      const data = await res.json();
      router.push(data.redirect || "/admin/dashboard");
    } catch (err) {
      alert(err.message);
      setImpersonating(null);
    }
  }

  // Group activities by date
  const groupedActivity = useMemo(() => {
    let filtered = recentActivity;
    if (activityFilter) {
      filtered = recentActivity.filter((e) => e.action === activityFilter);
    }
    const groups = {};
    filtered.forEach((entry) => {
      const key = getDateKey(entry.createdAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, entries]) => ({ date, entries }));
  }, [recentActivity, activityFilter]);

  // Unique action types for filter
  const actionTypes = useMemo(() => {
    const types = new Set(recentActivity.map((e) => e.action));
    return Array.from(types).sort();
  }, [recentActivity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <Link href="/platform/schools" className="mt-3 inline-block text-xs text-cyan-400 hover:text-cyan-300">
          Back to Tenants
        </Link>
      </div>
    );
  }

  if (!school) return null;

  const users = stats?.users || [];
  const students = users.filter((u) => u.role === "STUDENT");
  const teachers = users.filter((u) => u.role === "TEACHER");
  const parents = users.filter((u) => u.role === "PARENT");
  const admins = users.filter((u) => ["SUPER_ADMIN", "BURSAR", "REGISTRAR"].includes(u.role));

  const collectionRate = feeSummary?.totalExpected > 0
    ? Math.round((feeSummary.totalPaid / feeSummary.totalExpected) * 100)
    : 0;

  // Trend indicators
  const enrollmentTrend = enrollmentHistory.length >= 2
    ? enrollmentHistory[enrollmentHistory.length - 1].total - enrollmentHistory[enrollmentHistory.length - 2].total
    : 0;
  const revenueTrend = revenueHistory.length >= 2
    ? revenueHistory[revenueHistory.length - 1].collected - revenueHistory[revenueHistory.length - 2].collected
    : 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/platform/schools"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition hover:text-white"
      >
        <ArrowLeft className="h-3 w-3" /> Back to Tenants
      </Link>

      {/* ═══ Hero Card ═══ */}
      <div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#0f1219] p-6">
        <div
          className="absolute left-0 top-0 h-1 w-full"
          style={{ background: `linear-gradient(to right, ${school.brandColor || "#2563EB"}, transparent)` }}
        />
        <div className="flex items-start gap-5">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white"
            style={{ backgroundColor: school.brandColor || "#2563EB" }}
          >
            {school.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{school.name}</h1>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                  school.status === "active"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : school.status === "frozen"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {school.status?.toUpperCase()}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-gray-400">
              <span>{school.currentSession} · {school.currentTerm}</span>
              {school.billingPlan && (
                <span className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-300">
                  {school.billingPlan}
                </span>
              )}
              {school.subscriptionStatus && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    school.subscriptionStatus === "active"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : school.subscriptionStatus === "trial"
                      ? "bg-blue-500/10 text-blue-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {school.subscriptionStatus}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/[0.03] p-4 text-center">
            <GraduationCap className="mx-auto h-4 w-4 text-cyan-400" />
            <p className="mt-2 text-2xl font-bold text-white">{students.length}</p>
            <p className="text-[10px] font-bold tracking-wider text-gray-500">STUDENTS</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4 text-center">
            <Users className="mx-auto h-4 w-4 text-blue-400" />
            <p className="mt-2 text-2xl font-bold text-white">{teachers.length}</p>
            <p className="text-[10px] font-bold tracking-wider text-gray-500">TEACHERS</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4 text-center">
            <Users className="mx-auto h-4 w-4 text-violet-400" />
            <p className="mt-2 text-2xl font-bold text-white">{parents.length}</p>
            <p className="text-[10px] font-bold tracking-wider text-gray-500">PARENTS</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4 text-center">
            <Layers className="mx-auto h-4 w-4 text-emerald-400" />
            <p className="mt-2 text-2xl font-bold text-white">{school.activeArms?.length || 0}</p>
            <p className="text-[10px] font-bold tracking-wider text-gray-500">CLASS ARMS</p>
          </div>
        </div>
      </div>

      {/* ═══ Enrollment Trends ═══ */}
      <SectionCard
        icon={TrendingUp}
        iconColor="bg-cyan-500/10"
        title="Enrollment Trends"
        subtitle="12-month enrollment growth"
        headerRight={
          <div className="flex items-center gap-2">
            {enrollmentTrend !== 0 && (
              <span className={`flex items-center gap-1 text-xs font-semibold ${enrollmentTrend > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {enrollmentTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {enrollmentTrend > 0 ? "+" : ""}{enrollmentTrend}
              </span>
            )}
            <div className="flex rounded-lg bg-white/[0.03] p-0.5">
              {["total", "students", "teachers"].map((m) => (
                <button
                  key={m}
                  onClick={() => { setEnrollMetric(m); setSelectedMonth(null); }}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-semibold capitalize transition ${
                    enrollMetric === m ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {enrollmentHistory.length > 0 ? (
          <div>
            <div className="flex items-end gap-4 mb-4">
              <p className="text-3xl font-bold text-white">
                {enrollmentHistory[enrollmentHistory.length - 1]?.[enrollMetric === "total" ? "total" : enrollMetric] || 0}
              </p>
              <p className="text-xs text-gray-500 pb-1">
                current {enrollMetric === "total" ? "users" : enrollMetric}
              </p>
            </div>
            <SparkAreaChart
              data={enrollmentHistory}
              dataKey={enrollMetric === "total" ? "total" : enrollMetric}
              color={enrollMetric === "students" ? "#22d3ee" : enrollMetric === "teachers" ? "#60a5fa" : "#a78bfa"}
              height={140}
              onMonthClick={setSelectedMonth}
              selectedMonth={selectedMonth}
            />
            <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-500" /> Students: {enrollmentHistory[enrollmentHistory.length - 1]?.students || 0}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Teachers: {enrollmentHistory[enrollmentHistory.length - 1]?.teachers || 0}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" /> Parents: {enrollmentHistory[enrollmentHistory.length - 1]?.parents || 0}</span>
            </div>

            {/* Drill-down panel for selected month */}
            {selectedMonth && (() => {
              const month = enrollmentHistory.find((m) => m.key === selectedMonth);
              if (!month || !month.joinedUsers || month.joinedUsers.length === 0) return null;
              return (
                <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-cyan-400" />
                      <span className="text-sm font-bold text-white">{month.label}</span>
                      <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400">
                        {month.joinedUsers.length} joined
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedMonth(null)}
                      className="rounded-lg bg-white/[0.05] px-2 py-1 text-[10px] text-gray-400 hover:bg-white/[0.1]"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {month.joinedUsers.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2"
                      >
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white ${
                            u.role === "STUDENT"
                              ? "bg-cyan-500"
                              : u.role === "TEACHER"
                              ? "bg-blue-500"
                              : u.role === "PARENT"
                              ? "bg-violet-500"
                              : "bg-gray-500"
                          }`}
                        >
                          {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-gray-300">{u.name}</p>
                          <p className="text-[10px] text-gray-500">{u.role.replace("_", " ")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-center text-[10px] text-gray-600">
                    Click any month on the chart to see who joined that month
                  </p>
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No enrollment data yet</p>
        )}
      </SectionCard>

      {/* ═══ Revenue History ═══ */}
      <SectionCard
        icon={BarChart3}
        iconColor="bg-emerald-500/10"
        title="Revenue History"
        subtitle="12-month fee collection"
        headerRight={
          <div className="flex items-center gap-2">
            {revenueTrend !== 0 && (
              <span className={`flex items-center gap-1 text-xs font-semibold ${revenueTrend > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {revenueTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {revenueTrend > 0 ? "+" : ""}{formatCurrency(revenueTrend)}
              </span>
            )}
          </div>
        }
      >
        {revenueHistory.length > 0 ? (
          <div>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-bold tracking-wider text-gray-500">TOTAL COLLECTED</p>
                <p className="mt-1 text-xl font-bold text-emerald-400">{formatFullCurrency(feeSummary?.totalPaid || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-gray-500">OUTSTANDING</p>
                <p className="mt-1 text-xl font-bold text-red-400">{formatFullCurrency(feeSummary?.totalBalance || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-gray-500">COLLECTION RATE</p>
                <p className="mt-1 text-xl font-bold text-white">{collectionRate}%</p>
              </div>
            </div>
            <BarChart data={revenueHistory} height={160} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">No revenue data yet</p>
        )}
      </SectionCard>

      {/* ═══ Revenue Forecast ═══ */}
      {revenueForecast && revenueForecast.months && revenueForecast.months.length > 0 && (
        <SectionCard
          icon={Sparkles}
          iconColor="bg-indigo-500/10"
          title="Revenue Forecast"
          subtitle="Next quarter projection based on historical trends"
          headerRight={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${
                  revenueForecast.trend === "growing"
                    ? "bg-emerald-400"
                    : revenueForecast.trend === "declining"
                    ? "bg-red-400"
                    : "bg-gray-400"
                }`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  revenueForecast.trend === "growing"
                    ? "text-emerald-400"
                    : revenueForecast.trend === "declining"
                    ? "text-red-400"
                    : "text-gray-400"
                }`}>
                  {revenueForecast.trend}
                </span>
              </div>
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                {revenueForecast.confidence}% confidence
              </span>
            </div>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-indigo-500/5 p-3">
              <p className="text-[10px] font-bold tracking-wider text-gray-500">PROJECTED Q TOTAL</p>
              <p className="mt-1 text-lg font-bold text-indigo-400">{formatFullCurrency(revenueForecast.projectedTotal)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <p className="text-[10px] font-bold tracking-wider text-gray-500">CURRENT MONTH AVG</p>
              <p className="mt-1 text-lg font-bold text-white">{formatFullCurrency(revenueForecast.currentMonthAvg)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <p className="text-[10px] font-bold tracking-wider text-gray-500">MONTHLY TREND</p>
              <div className="mt-1 flex items-center gap-1">
                {revenueForecast.slope > 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                ) : revenueForecast.slope < 0 ? (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4 text-gray-400" />
                )}
                <span className={`text-lg font-bold ${
                  revenueForecast.slope > 0 ? "text-emerald-400" : revenueForecast.slope < 0 ? "text-red-400" : "text-gray-400"
                }`}>
                  {revenueForecast.slope > 0 ? "+" : ""}{formatCurrency(revenueForecast.slope)}/mo
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <p className="text-[10px] font-bold tracking-wider text-gray-500">METHODOLOGY</p>
              <p className="mt-1 text-xs font-medium text-gray-300">WMA + Trend Blend</p>
              <p className="text-[10px] text-gray-500">60% weighted avg + 40% trend</p>
            </div>
          </div>
          <ForecastChart history={revenueHistory} forecast={revenueForecast} height={180} />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 opacity-90" /> Actual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400 opacity-70" /> Projected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-indigo-400 bg-transparent" style={{ borderWidth: 1.5 }} /> Confidence
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] px-2 py-1">
              <Info className="h-3 w-3 text-gray-600" />
              <span className="text-[9px] text-gray-600">Based on {revenueHistory.length} months of data</span>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ═══ Revenue & Fees (Current Term) ═══ */}
      {feeSummary && feeSummary.studentCount > 0 && (
        <SectionCard
          icon={Wallet}
          iconColor="bg-emerald-500/10"
          title="Revenue & Fees"
          subtitle="Current term fee collection status"
          headerRight={
            <div className="text-right">
              <p className="text-lg font-bold text-white">{collectionRate}%</p>
              <p className="text-[10px] text-gray-500">COLLECTION RATE</p>
            </div>
          }
        >
          {/* Collection Progress Bar */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
              <span>{formatFullCurrency(feeSummary.totalPaid)} collected</span>
              <span>{formatFullCurrency(feeSummary.totalExpected)} expected</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${Math.min(collectionRate, 100)}%` }}
              />
            </div>
          </div>

          {/* Revenue Stats Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[10px] font-bold tracking-wider text-gray-500">COLLECTED</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-emerald-400">{formatFullCurrency(feeSummary.totalPaid)}</p>
            </div>
            <div className="rounded-xl bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-bold tracking-wider text-gray-500">PENDING</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-amber-400">{formatFullCurrency(feeSummary.totalPending)}</p>
            </div>
            <div className="rounded-xl bg-red-500/5 p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[10px] font-bold tracking-wider text-gray-500">OUTSTANDING</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-red-400">{formatFullCurrency(feeSummary.totalBalance)}</p>
            </div>
            <div className="rounded-xl bg-blue-500/5 p-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-[10px] font-bold tracking-wider text-gray-500">STUDENTS</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-blue-400">{feeSummary.studentCount}</p>
            </div>
          </div>

          {/* Student Payment Status */}
          <div className="mt-4 flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-gray-400">{feeSummary.fullyPaidCount} fully paid</span>
            </div>
            {feeSummary.partialCount > 0 && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-gray-400">{feeSummary.partialCount} partial</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              <span className="text-gray-400">{feeSummary.unpaidCount} unpaid</span>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ═══ Activity Timeline ═══ */}
      <SectionCard
        icon={Activity}
        iconColor="bg-cyan-500/10"
        title="Activity Timeline"
        subtitle={`${recentActivity.length} events · ${groupedActivity.length} days`}
        headerRight={
          <div className="flex items-center gap-2">
            {activityFilter && (
              <button
                onClick={() => setActivityFilter("")}
                className="flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-400 transition hover:bg-cyan-500/20"
              >
                <X className="h-3 w-3" /> {activityFilter.replace(/_/g, " ")}
              </button>
            )}
            <div className="relative group">
              <button className="flex items-center gap-1 rounded-md bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 transition hover:bg-white/[0.06]">
                <Filter className="h-3 w-3" /> Filter
              </button>
              <div className="invisible absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-white/10 bg-[#0f1219] p-1.5 shadow-2xl group-hover:visible">
                {actionTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setActivityFilter(type)}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-xs transition ${
                      activityFilter === type ? "bg-cyan-500/10 text-cyan-400" : "text-gray-400 hover:bg-white/[0.05]"
                    }`}
                  >
                    {ACTIVITY_COLORS[type]?.icon || "⚙️"} {type.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
            <Link
              href={`/platform/audit?schoolId=${school.id}`}
              className="flex items-center gap-1 text-[10px] font-semibold text-cyan-400 transition hover:text-cyan-300"
            >
              Full log <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        }
      >
        {groupedActivity.length > 0 ? (
          <div className="space-y-4">
            {groupedActivity.map(({ date, entries }) => (
              <div key={date}>
                {/* Date header */}
                <div className="mb-2 flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-gray-600" />
                  <span className="text-[10px] font-bold tracking-wider text-gray-500">
                    {formatDate(date + "T12:00:00")}
                  </span>
                  <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-gray-600">
                    {entries.length}
                  </span>
                </div>
                {/* Entries */}
                <div className="relative ml-4 border-l border-white/[0.06] pl-4 space-y-1">
                  {entries.map((entry) => {
                    const colors = ACTIVITY_COLORS[entry.action] || ACTIVITY_COLORS.config_change;
                    const isExpanded = expandedActivity === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className="group relative -ml-[17px]"
                      >
                        {/* Timeline dot */}
                        <div className={`absolute left-[-2px] top-3 h-2 w-2 rounded-full ${colors.bg.replace("/10", "/40")} ring-2 ring-[#0f1219]`} />

                        <button
                          onClick={() => setExpandedActivity(isExpanded ? null : entry.id)}
                          className={`w-full rounded-lg px-4 py-3 text-left transition hover:bg-white/[0.015] ${isExpanded ? "bg-white/[0.015]" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm">{colors.icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-300">{entry.description || entry.action.replace(/_/g, " ")}</p>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" /> {entry.actor}
                                </span>
                                <span>·</span>
                                <span>{formatTimeAgo(entry.createdAt)}</span>
                              </div>
                            </div>
                            <ChevronDown className={`h-3.5 w-3.5 text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && entry.meta && (
                          <div className="mx-4 mb-2 rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.05]">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {Object.entries(entry.meta).map(([key, val]) => (
                                <div key={key}>
                                  <span className="text-gray-600">{key.replace(/([A-Z])/g, " $1").toLowerCase()}: </span>
                                  <span className="text-gray-300">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Activity className="mx-auto h-6 w-6 text-gray-700" />
            <p className="mt-2 text-sm text-gray-500">
              {activityFilter ? "No events matching this filter" : "No activity yet"}
            </p>
          </div>
        )}
      </SectionCard>

      {/* ═══ Admin Accounts & Impersonation ═══ */}
      <div className="rounded-xl border border-white/5 bg-[#0f1219]">
        <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
            <Shield className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Admin Accounts</h2>
            <p className="text-xs text-gray-500">Impersonate to troubleshoot or manage</p>
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {admins.map((admin) => (
            <div key={admin.id} className="flex items-center gap-4 px-6 py-4 transition hover:bg-white/[0.02]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white">
                {admin.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{admin.name}</p>
                <p className="text-xs text-gray-500">
                  {admin.email} · <span className="text-gray-400">{admin.role.replace("_", " ")}</span>
                </p>
              </div>
              <button
                onClick={() => handleImpersonate(admin.id)}
                disabled={impersonating !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-400 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {impersonating === admin.id ? (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                ) : (
                  <LogIn className="h-3.5 w-3.5" />
                )}
                {impersonating === admin.id ? "Connecting..." : "Impersonate"}
              </button>
            </div>
          ))}
          {admins.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-gray-500">No admin accounts found</div>
          )}
        </div>
      </div>

      {/* ═══ Class Arms ═══ */}
      {school.activeArms && school.activeArms.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-[#0f1219]">
          <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Layers className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Class Arms</h2>
              <p className="text-xs text-gray-500">{school.activeArms.length} arms configured</p>
            </div>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-2">
              {school.activeArms.map((arm) => {
                const armStudents = students.filter((s) => s.assignedClass === arm);
                return (
                  <div
                    key={arm}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/5"
                  >
                    <span className="text-xs font-medium text-gray-300">{arm}</span>
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-500">
                      {armStudents.length}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
