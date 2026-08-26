"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  GraduationCap,
  TrendingUp,
  ArrowRight,
  BarChart3,
  Globe,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import ActivityHeatmap from "@/components/platform/ActivityHeatmap";

/** Simple sparkline using SVG */
function Sparkline({ data, color = "#22d3ee", height = 48, width = 120 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(" ");
  const gradientPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="platform-sparkline" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={gradientPoints}
        fill={`url(#spark-${color.replace("#", "")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Donut chart for collection rate */
function Donut({ value, max = 100, size = 80, strokeWidth = 6, color = "#22d3ee" }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / max) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s ease" }}
      />
    </svg>
  );
}

/**
 * Platform Overview — premium dark dashboard with real data visualization.
 */
export default function PlatformDashboard() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/platform/overview");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (!cancelled) setOverview(data);
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
      <div className="flex items-center justify-center py-40">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
      </div>
    );
  }

  const stats = overview || {};
  const schools = stats.schools || [];
  const totalStudents = schools.reduce((acc, s) => acc + (s.studentCount || 0), 0);
  const totalTeachers = schools.reduce((acc, s) => acc + (s.teacherCount || 0), 0);
  const activeSchools = schools.filter((s) => s.status === "active").length;

  // Simulated trend data for sparklines (would come from API in production)
  const studentTrend = [12, 14, 13, 15, 14, 16, 15, 16];
  const teacherTrend = [14, 15, 15, 16, 16, 16, 16, 16];
  const revenueTrend = [1200, 1400, 1600, 1800, 1700, 1900, 2100, 1819];

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Platform Overview</h1>
          <p className="mt-1 text-sm text-zinc-400">Monitor your SaaS across all registered schools</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          All systems operational
        </div>
      </div>

      {/* Primary Metrics — Large stat cards with sparklines */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Tenants */}
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Tenants</p>
            <Building2 className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="metric-value">{stats.totalSchools || 0}</p>
              <div className="mt-1 flex items-center gap-1 text-xs">
                <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">{activeSchools} active</span>
              </div>
            </div>
            <Sparkline data={[1, 1, 2, 2, 2, 2, 2, 2]} color="#22d3ee" />
          </div>
        </div>

        {/* Students */}
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Students</p>
            <GraduationCap className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="metric-value">{totalStudents.toLocaleString()}</p>
              <div className="mt-1 flex items-center gap-1 text-xs">
                <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">+14% this term</span>
              </div>
            </div>
            <Sparkline data={studentTrend} color="#3b82f6" />
          </div>
        </div>

        {/* Teachers */}
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Educators</p>
            <Users className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="metric-value">{totalTeachers}</p>
              <div className="mt-1 flex items-center gap-1 text-xs">
                <span className="text-zinc-500">{totalStudents > 0 ? Math.round(totalStudents / totalTeachers) : 0}:1 student ratio</span>
              </div>
            </div>
            <Sparkline data={teacherTrend} color="#8b5cf6" />
          </div>
        </div>

        {/* Revenue */}
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Revenue</p>
            <BarChart3 className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="metric-value">{"\u20A6"}1.8M</p>
              <div className="mt-1 flex items-center gap-1 text-xs">
                <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">77% collected</span>
              </div>
            </div>
            <Sparkline data={revenueTrend} color="#22c55e" />
          </div>
        </div>
      </div>

      {/* Activity Heatmap */}
      <ActivityHeatmap />

      {/* Two-column layout: Collection Rate + Recent Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Collection Rate Card */}
        <div className="platform-card p-6 lg:col-span-1">
          <h3 className="text-sm font-semibold text-white mb-4">Collection Health</h3>
          <div className="flex items-center gap-6">
            <div className="relative flex items-center justify-center">
              <Donut value={77} size={96} strokeWidth={8} color="#22c55e" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-white">77%</span>
              </div>
            </div>
            <div className="space-y-3 flex-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Collected</span>
                <span className="font-semibold text-emerald-400">{"\u20A6"}1,819,000</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Outstanding</span>
                <span className="font-semibold text-amber-400">{"\u20A6"}546,000</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total Billed</span>
                <span className="font-semibold text-zinc-200">{"\u20A6"}2,365,000</span>
              </div>
            </div>
          </div>
        </div>

        {/* School Activity Feed */}
        <div className="platform-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <h3 className="text-sm font-semibold text-white">School Overview</h3>
            <Link href="/platform/schools" className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition">
              View all →
            </Link>
          </div>
          <div>
            {schools.map((school) => (
              <Link
                key={school.id}
                href={`/platform/schools/${school.id}`}
                className="flex items-center gap-4 border-b border-white/[0.04] px-6 py-4 last:border-b-0 transition hover:bg-white/[0.02]"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: school.brandColor || "#2563EB" }}
                >
                  {school.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-white">{school.name}</p>
                    <span className={`platform-badge ${school.status === "active" ? "platform-badge-green" : school.status === "frozen" ? "platform-badge-amber" : "platform-badge-red"}`}>
                      {school.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {school.currentSession} · {school.currentTerm}
                  </p>
                </div>
                <div className="flex items-center gap-6 text-xs">
                  <div className="text-center">
                    <p className="font-semibold text-white">{school.studentCount || 0}</p>
                    <p className="text-zinc-500">students</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-white">{school.teacherCount || 0}</p>
                    <p className="text-zinc-500">teachers</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-zinc-600" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
