"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Filter,
  ScrollText,
  User,
  Building2,
  CreditCard,
  ArrowRightLeft,
  Settings,
  Shield,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronDown,
  X,
  Download,
  FileText,
  FileSpreadsheet,
  Calendar,
  Archive,
  Clock,
  Globe,
  KeyRound,
  Target,
  Activity,
  ChevronRight,
} from "lucide-react"

const ACTION_META = {
  impersonate: {
    label: "Impersonation",
    icon: ArrowRightLeft,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    dot: "bg-violet-400",
  },
  plan_change: {
    label: "Plan Change",
    icon: CreditCard,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    dot: "bg-blue-400",
  },
  subscription_activate: {
    label: "Activated",
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  subscription_cancel: {
    label: "Cancelled",
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    dot: "bg-red-400",
  },
  school_status_change: {
    label: "Status Change",
    icon: Settings,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    dot: "bg-amber-400",
  },
  school_created: {
    label: "School Created",
    icon: Building2,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    dot: "bg-cyan-400",
  },
  school_deleted: {
    label: "School Deleted",
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    dot: "bg-red-400",
  },
  alert_created: {
    label: "Alert",
    icon: Info,
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/20",
    dot: "bg-zinc-400",
  },
  config_change: {
    label: "Config Change",
    icon: Settings,
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/20",
    dot: "bg-zinc-400",
  },
};

const ACTION_FILTERS = [
  { value: "", label: "All Actions" },
  { value: "impersonate", label: "Impersonation" },
  { value: "subscription_activate", label: "Subscription Activated" },
  { value: "subscription_cancel", label: "Subscription Cancelled" },
  { value: "plan_change", label: "Plan Changes" },
  { value: "school_status_change", label: "Status Changes" },
  { value: "school_created", label: "School Created" },
];

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

function ExportButton({ search, actionFilter, fromDate, toDate, total }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport(format) {
    setExporting(true);
    setOpen(false);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      if (search) params.set("search", search);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      params.set("format", format);

      const res = await fetch(`/api/platform/audit/export?${params}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
      const filename = filenameMatch ? filenameMatch[1] : `edutrack-audit.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={exporting}
        className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-zinc-900/50 px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:text-white disabled:opacity-50"
      >
        {exporting ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? "Exporting..." : "Export"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900 shadow-2xl shadow-black/50">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Export {total} event{total !== 1 ? "s" : ""}
            </div>
            <button
              onClick={() => handleExport("csv")}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              <div className="text-left">
                <p className="font-medium">CSV Spreadsheet</p>
                <p className="text-[11px] text-zinc-500">Open in Excel, Google Sheets</p>
              </div>
            </button>
            <button
              onClick={() => handleExport("pdf")}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
            >
              <FileText className="h-4 w-4 text-red-400" />
              <div className="text-left">
                <p className="font-medium">PDF Document</p>
                <p className="text-[11px] text-zinc-500">Formatted for printing</p>
              </div>
            </button>
            <div className="border-t border-white/[0.06]" />
            <button
              onClick={() => handleExport("zip")}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
            >
              <Archive className="h-4 w-4 text-cyan-400" />
              <div className="text-left">
                <p className="font-medium">ZIP Archive</p>
                <p className="text-[11px] text-zinc-500">CSV + PDF bundled together</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, actionCounts: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [impSessionDetail, setImpSessionDetail] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const pageSize = 20;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (actionFilter) params.set("action", actionFilter);
        if (search) params.set("search", search);
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
        params.set("limit", String(pageSize));
        params.set("offset", String(page * pageSize));

        const res = await fetch(`/api/platform/audit?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setLogs(data.logs || []);
            setTotal(data.total || 0);
            setStats(data.stats || { total: 0, actionCounts: {} });
          }
        }
      } catch (err) {
        console.error("Failed to load audit log:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [actionFilter, search, fromDate, toDate, page]);

  const totalPages = Math.ceil(total / pageSize);

  // Fetch impersonation session details
  async function fetchImpersonationDetail(sessionId) {
    setLoadingSession(true);
    try {
      const res = await fetch(`/api/platform/impersonation/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setImpSessionDetail(data.session);
      }
    } catch (err) {
      console.error('Failed to fetch impersonation session:', err);
    } finally {
      setLoadingSession(false);
    }
  }

  function handleImpersonationClick(entry) {
    if (entry.action === 'impersonation' && entry.meta?.sessionId) {
      fetchImpersonationDetail(entry.meta.sessionId);
    } else {
      setExpandedId(isExpanded => isExpanded === entry.id ? null : entry.id);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Audit Log</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Track all admin actions and impersonation events across tenants
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <ScrollText className="h-4 w-4" />
          <span>{stats.total} total events</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Object.entries(ACTION_META)
          .filter(([key]) => stats.actionCounts[key])
          .slice(0, 6)
          .map(([key, meta]) => (
            <div
              key={key}
              className={`rounded-xl border ${meta.border} ${meta.bg} p-3`}
            >
              <div className="flex items-center gap-2">
                <meta.icon className={`h-3.5 w-3.5 ${meta.color}`} />
                <span className="text-[11px] font-medium text-zinc-400">{meta.label}</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-white">
                {stats.actionCounts[key] || 0}
              </p>
            </div>
          ))}
      </div>

      {/* Search + Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by actor, school, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/[0.06] bg-zinc-900/50 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
            showFilters || actionFilter
              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
              : "border-white/[0.06] bg-zinc-900/50 text-zinc-400 hover:text-white"
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {(actionFilter || fromDate || toDate) && (
            <span className="rounded-full bg-cyan-500/20 px-1.5 text-[10px] font-bold text-cyan-300">
              {[actionFilter, fromDate, toDate].filter(Boolean).length}
            </span>
          )}
        </button>
        <ExportButton search={search} actionFilter={actionFilter} fromDate={fromDate} toDate={toDate} total={total} />
      </div>

      {/* Filter Pills */}
      {showFilters && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {ACTION_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setActionFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  actionFilter === f.value
                    ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30"
                    : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-zinc-900/50 p-3">
            <Calendar className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-400">Date range:</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(0); }}
                className="rounded-lg border border-white/[0.06] bg-zinc-800/50 px-2.5 py-1.5 text-xs text-zinc-300 outline-none transition focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20 [color-scheme:dark]"
              />
              <span className="text-xs text-zinc-600">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(0); }}
                className="rounded-lg border border-white/[0.06] bg-zinc-800/50 px-2.5 py-1.5 text-xs text-zinc-300 outline-none transition focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20 [color-scheme:dark]"
              />
              {(fromDate || toDate) && (
                <button
                  onClick={() => { setFromDate(""); setToDate(""); setPage(0); }}
                  className="rounded-lg px-2 py-1.5 text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                >
                  Clear dates
                </button>
              )}
            </div>
            {/* Quick presets */}
            <div className="ml-auto flex items-center gap-1.5">
              {[
                { label: "7d", days: 7 },
                { label: "30d", days: 30 },
                { label: "90d", days: 90 },
              ].map((preset) => (
                <button
                  key={preset.days}
                  onClick={() => {
                    const now = new Date();
                    const from = new Date(now);
                    from.setDate(from.getDate() - preset.days);
                    setFromDate(from.toISOString().slice(0, 10));
                    setToDate(now.toISOString().slice(0, 10));
                    setPage(0);
                  }}
                  className="rounded-md bg-zinc-800/50 px-2 py-1 text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Event Feed */}
      <div className="platform-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <ScrollText className="mb-3 h-10 w-10 text-zinc-700" />
            <p className="text-sm font-medium">No audit events found</p>
            <p className="mt-1 text-xs text-zinc-600">
              {search || actionFilter || fromDate || toDate ? "Try adjusting your filters" : "Actions will appear here as they happen"}
            </p>
          </div>
        ) : (
          <div>
            {logs.map((entry, idx) => {
              const meta = ACTION_META[entry.action] || ACTION_META.config_change;
              const isExpanded = expandedId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`border-b border-white/[0.04] last:border-b-0 transition hover:bg-white/[0.015] ${
                    idx === 0 ? "rounded-t-xl" : ""
                  } ${idx === logs.length - 1 ? "rounded-b-xl" : ""}`}
                >
                  <button
                    onClick={() => handleImpersonationClick(entry)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left"
                  >
                    {/* Action Icon */}
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg} border ${meta.border}`}>
                      <meta.icon className={`h-4 w-4 ${meta.color}`} />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-white">
                          {entry.description || meta.label}
                        </p>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {entry.actor}
                        </span>
                        {entry.schoolName && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {entry.schoolName}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Time + Expand */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{
                        backgroundColor: meta.bg.includes("emerald") ? "rgba(34,197,94,0.12)" :
                          meta.bg.includes("red") ? "rgba(239,68,68,0.12)" :
                          meta.bg.includes("violet") ? "rgba(139,92,246,0.12)" :
                          meta.bg.includes("blue") ? "rgba(59,130,246,0.12)" :
                          meta.bg.includes("amber") ? "rgba(245,158,11,0.12)" :
                          meta.bg.includes("cyan") ? "rgba(34,211,238,0.12)" :
                          "rgba(113,113,122,0.12)",
                        color: meta.color.replace("text-", "").replace("-400", "") === "violet" ? "#a78bfa" :
                          meta.color.replace("text-", "").replace("-400", "") === "emerald" ? "#34d399" :
                          meta.color.replace("text-", "").replace("-400", "") === "red" ? "#f87171" :
                          meta.color.replace("text-", "").replace("-400", "") === "blue" ? "#60a5fa" :
                          meta.color.replace("text-", "").replace("-400", "") === "amber" ? "#fbbf24" :
                          meta.color.replace("text-", "").replace("-400", "") === "cyan" ? "#22d3ee" :
                          "#a1a1aa",
                      }}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-zinc-600">{formatTimeAgo(entry.createdAt)}</span>
                      <ChevronDown
                        className={`h-4 w-4 text-zinc-600 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-white/[0.04] bg-zinc-900/30 px-5 py-4">
                      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Action</p>
                          <p className="mt-0.5 font-mono text-xs text-zinc-300">{entry.action}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Actor</p>
                          <p className="mt-0.5 text-xs text-zinc-300">{entry.actor}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">School</p>
                          <p className="mt-0.5 text-xs text-zinc-300">{entry.schoolName || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">IP Address</p>
                          <p className="mt-0.5 font-mono text-xs text-zinc-300">{entry.ip || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Timestamp</p>
                          <p className="mt-0.5 text-xs text-zinc-300">
                            {new Date(entry.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {entry.meta && Object.keys(entry.meta).length > 0 && (
                          <div className="col-span-2 sm:col-span-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Metadata</p>
                            <pre className="mt-1 overflow-x-auto rounded-lg bg-zinc-950/50 p-3 text-[11px] text-zinc-400">
                              {JSON.stringify(entry.meta, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-600">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
            >
              Previous
            </button>
            <span className="text-xs text-zinc-600">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Impersonation Session Detail Modal */}
      {(impSessionDetail || loadingSession) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setImpSessionDetail(null)}>
          <div className="relative mx-4 w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-zinc-900/95 px-6 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 border border-violet-500/20">
                  <Shield className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Impersonation Session</h2>
                  <p className="text-xs text-zinc-500">Detailed audit trail</p>
                </div>
              </div>
              <button onClick={() => setImpSessionDetail(null)} className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            {loadingSession ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/50 border-t-violet-400" />
              </div>
            ) : impSessionDetail ? (
              <div className="p-6">
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 mb-2"><Shield className="h-3.5 w-3.5 text-violet-400" /><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Impersonator</span></div>
                    <p className="text-sm font-semibold text-white">{impSessionDetail.impersonatorName}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 mb-2"><Target className="h-3.5 w-3.5 text-cyan-400" /><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Target</span></div>
                    <p className="text-sm font-semibold text-white">{impSessionDetail.targetUserName}</p>
                    <p className="text-[10px] text-zinc-500">{impSessionDetail.targetUserRole}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 mb-2"><Building2 className="h-3.5 w-3.5 text-blue-400" /><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">School</span></div>
                    <p className="text-sm font-semibold text-white">{impSessionDetail.schoolName}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 mb-2"><Clock className="h-3.5 w-3.5 text-amber-400" /><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Duration</span></div>
                    <p className="text-sm font-semibold text-white">{impSessionDetail.durationFormatted || "In Progress"}</p>
                  </div>
                </div>
                <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Session ID</p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-400">{impSessionDetail.id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Status</p>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${impSessionDetail.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-600/30 text-zinc-400"}`}>{impSessionDetail.status}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Started</p>
                    <p className="mt-0.5 text-xs text-zinc-400">{new Date(impSessionDetail.startedAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{impSessionDetail.endedAt ? "Ended" : "Expires"}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">{impSessionDetail.endedAt ? new Date(impSessionDetail.endedAt).toLocaleString() : "Active"}</p>
                  </div>
                </div>
                {impSessionDetail.ip && (
                  <div className="mb-6 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <Globe className="h-4 w-4 text-cyan-400" />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">IP Address</p>
                      <p className="font-mono text-sm text-zinc-300">{impSessionDetail.ip}</p>
                    </div>
                  </div>
                )}
                {impSessionDetail.relatedLogs && impSessionDetail.relatedLogs.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-white">Activity During Session</h3>
                      <span className="text-xs text-zinc-500">{impSessionDetail.relatedLogs.length} actions</span>
                    </div>
                    <div className="relative space-y-3">
                      <div className="absolute left-[17px] top-2 h-[calc(100%-1rem)] w-px bg-white/10" />
                      {impSessionDetail.relatedLogs.map((log, idx) => {
                        const logMeta = ACTION_META[log.action] || ACTION_META.config_change;
                        return (
                          <div key={log.id || idx} className="relative flex items-start gap-4 pl-1">
                            <div className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${logMeta.border} ${logMeta.bg}`}>
                              <logMeta.icon className={`h-3.5 w-3.5 ${logMeta.color}`} />
                            </div>
                            <div className="min-w-0 flex-1 rounded-lg bg-zinc-800/50 p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-zinc-200">{log.description || logMeta.label}</p>
                                <span className="text-[10px] text-zinc-500">{new Date(log.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                                <span className={`font-medium ${logMeta.color}`}>{logMeta.label}</span>
                                {log.ip && (<><span>&middot;</span><span className="font-mono">{log.ip}</span></>)}
                              </div>
                              {log.meta && Object.keys(log.meta).length > 0 && (
                                <details className="mt-2 group">
                                  <summary className="cursor-pointer text-[10px] text-zinc-500 hover:text-zinc-300">View details</summary>
                                  <pre className="mt-1 overflow-x-auto rounded bg-zinc-900/50 p-2 text-[10px] text-zinc-400">{JSON.stringify(log.meta, null, 2)}</pre>
                                </details>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(!impSessionDetail.relatedLogs || impSessionDetail.relatedLogs.length === 0) && (
                  <div className="rounded-lg border border-dashed border-white/10 p-6 text-center">
                    <Activity className="mx-auto mb-2 h-6 w-6 text-zinc-600" />
                    <p className="text-sm text-zinc-500">No actions recorded during this session</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
