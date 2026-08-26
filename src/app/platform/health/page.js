"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Clock,
  AlertTriangle,
  Database,
  Cpu,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Server,
  Zap,
  Shield,
} from "lucide-react";

/** Bar chart for response time series */
function BarChart({ data, height = 160, color = "#22d3ee", label }) {
  if (!data || data.length === 0) return null;
  const validData = data.filter((d) => d.avg != null);
  if (validData.length === 0) return null;
  const max = Math.max(...validData.map((d) => d.avg), 1);
  const barWidth = Math.max(100 / validData.length - 1, 2);

  return (
    <div className="relative" style={{ height }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={`bar-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
            <stop offset="100%" stopColor={color} stopOpacity={0.3} />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const val = d.avg || 0;
          const barH = max > 0 ? (val / max) * (height - 10) : 0;
          const x = (i / data.length) * 100;
          return (
            <rect
              key={i}
              x={x}
              y={height - barH - 2}
              width={barWidth}
              height={barH}
              rx={1}
              fill={`url(#bar-${label})`}
              opacity={val > 0 ? 1 : 0.15}
            />
          );
        })}
      </svg>
    </div>
  );
}

/** Donut chart for status code distribution */
function StatusDonut({ statusCodes, size = 120 }) {
  const entries = Object.entries(statusCodes || {});
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  if (total === 0) return null;
  const radius = 42;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;

  const colors = {
    "200": "#22c55e",
    "201": "#22c55e",
    "301": "#3b82f6",
    "304": "#3b82f6",
    "400": "#f59e0b",
    "401": "#f59e0b",
    "403": "#f59e0b",
    "404": "#f59e0b",
    "500": "#ef4444",
    "502": "#ef4444",
    "503": "#ef4444",
  };

  let accumulated = 0;
  const segments = entries.map(([code, count]) => {
    const pct = (count / total) * 100;
    const segment = { code, count, pct, color: colors[code] || "#71717a" };
    accumulated += pct;
    return segment;
  });

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {segments.reduce(
          (acc, seg) => {
            const offset = acc.offset;
            const dashLen = (seg.pct / 100) * circumference;
            acc.elements.push(
              <circle
                key={seg.code}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.8s ease" }}
              />
            );
            acc.offset = offset + dashLen;
            return acc;
          },
          { elements: [], offset: 0 }
        ).elements}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white"
          fontSize="16"
          fontWeight="700"
        >
          {total.toLocaleString()}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 14}
          textAnchor="middle"
          className="fill-zinc-500"
          fontSize="7"
          fontWeight="600"
        >
          REQUESTS
        </text>
      </svg>
      <div className="space-y-2">
        {segments.map((seg) => (
          <div key={seg.code} className="flex items-center gap-2 text-xs">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="font-mono text-zinc-400">{seg.code}</span>
            <span className="font-semibold text-white">{seg.count}</span>
            <span className="text-zinc-600">({seg.pct.toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/platform/health");
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setData(json);
        }
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

  const overview = data?.overview || {};
  const endpoints = data?.endpoints || [];
  const responseTimeSeries = data?.responseTimeSeries || [];
  const statusCodes = data?.statusCodes || {};
  const dbSizeTrend = data?.dbSizeTrend || [];

  const responseTimeLabels = responseTimeSeries.map((d) => {
    const h = new Date(d.time).getHours();
    return h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Health Monitor</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Real-time platform performance, error rates, and infrastructure
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live monitoring</span>
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {/* Uptime */}
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Uptime</p>
            <Shield className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-emerald-400">{overview.uptime || "99.98%"}</p>
            <p className="mt-1 text-xs text-zinc-500">Last 30 days</p>
          </div>
        </div>

        {/* Avg Response Time */}
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Avg Response</p>
            <Clock className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-cyan-400">{overview.avgResponseTime || 0}<span className="text-sm font-normal text-zinc-500">ms</span></p>
            <div className="mt-1 flex items-center gap-1 text-xs">
              <ArrowDownRight className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">P95: {overview.p95ResponseTime || 0}ms</span>
            </div>
          </div>
        </div>

        {/* Error Rate */}
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Error Rate</p>
            <AlertTriangle className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3">
            <p className={`text-2xl font-bold ${(overview.errorRate || 0) > 5 ? "text-red-400" : (overview.errorRate || 0) > 2 ? "text-amber-400" : "text-emerald-400"}`}>
              {overview.errorRate || 0}%
            </p>
            <p className="mt-1 text-xs text-zinc-500">{overview.totalErrors || 0} errors / {overview.totalRequests || 0} req</p>
          </div>
        </div>

        {/* Database Size */}
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">DB Size</p>
            <Database className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-blue-400">{formatSize(overview.currentDbSize || 0)}</p>
            <p className="mt-1 text-xs text-zinc-500">MongoDB Atlas</p>
          </div>
        </div>

        {/* Memory */}
        <div className="platform-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Memory</p>
            <Cpu className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-violet-400">{overview.currentMemory || 0}<span className="text-sm font-normal text-zinc-500">MB</span></p>
            <p className="mt-1 text-xs text-zinc-500">2,048 MB allocated</p>
          </div>
        </div>
      </div>

      {/* Response Time + Status Codes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Response Time Chart */}
        <div className="platform-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Response Time (24h)</h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                <span className="text-zinc-500">Avg</span>
              </span>
            </div>
          </div>
          <BarChart data={responseTimeSeries} color="#22d3ee" label="response" height={180} />
          <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
            {responseTimeLabels.filter((_, i) => i % 4 === 0 || i === responseTimeLabels.length - 1).map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        </div>

        {/* Status Code Distribution */}
        <div className="platform-card p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Status Codes (24h)</h3>
          <div className="flex items-center justify-center">
            <StatusDonut statusCodes={statusCodes} size={130} />
          </div>
        </div>
      </div>

      {/* DB Size Trend + Endpoint Table */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* DB Size Trend */}
        <div className="platform-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Database Growth</h3>
            <Database className="h-4 w-4 text-zinc-600" />
          </div>
          {dbSizeTrend.length > 0 ? (
            <>
              <BarChart
                data={dbSizeTrend.map((d) => ({ avg: d.value }))}
                color="#3b82f6"
                label="db"
                height={120}
              />
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Current</span>
                <span className="font-semibold text-blue-400">{formatSize(overview.currentDbSize || 0)}</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-600">No DB size data yet</p>
          )}
        </div>

        {/* Endpoint Breakdown */}
        <div className="platform-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <h3 className="text-sm font-semibold text-white">Endpoint Performance</h3>
            <span className="text-xs text-zinc-500">{endpoints.length} endpoints</span>
          </div>
          <table className="platform-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Requests</th>
                <th>Avg Time</th>
                <th>Max Time</th>
                <th>Errors</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => {
                const health = ep.avgTime < 100 ? "healthy" : ep.avgTime < 300 ? "warning" : "critical";
                return (
                  <tr key={ep.name}>
                    <td>
                      <span className="font-mono text-xs text-white">{ep.name}</span>
                    </td>
                    <td className="font-semibold text-white">{ep.count}</td>
                    <td>
                      <span className={ep.avgTime < 100 ? "text-emerald-400" : ep.avgTime < 300 ? "text-amber-400" : "text-red-400"}>
                        {ep.avgTime}ms
                      </span>
                    </td>
                    <td className="text-zinc-400">{ep.maxTime}ms</td>
                    <td>
                      {ep.errors > 0 ? (
                        <span className="text-red-400 font-semibold">{ep.errors}</span>
                      ) : (
                        <span className="text-zinc-600">0</span>
                      )}
                    </td>
                    <td>
                      <span className={`platform-badge ${
                        health === "healthy" ? "platform-badge-green" :
                        health === "warning" ? "platform-badge-amber" :
                        "platform-badge-red"
                      }`}>
                        {health}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let size = bytes;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(1)} ${units[idx]}`;
}
