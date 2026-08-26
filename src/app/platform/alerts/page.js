"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Bell,
  CheckCheck,
  Building2,
  CreditCard,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  Zap,
  Filter,
} from "lucide-react";

const TYPE_CONFIG = {
  school_signup: { icon: Building2, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "School Signup" },
  subscription_activated: { icon: CreditCard, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Sub Activated" },
  plan_change: { icon: CreditCard, color: "text-blue-400", bg: "bg-blue-500/10", label: "Plan Change" },
  trial_started: { icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10", label: "Trial Started" },
  trial_expiring: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", label: "Trial Expiring" },
  trial_expired: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Trial Expired" },
  subscription_cancelled: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Cancelled" },
  subscription_past_due: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", label: "Past Due" },
  school_frozen: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "School Frozen" },
  school_deleted: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "School Deleted" },
  school_restored: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "School Restored" },
  impersonation: { icon: Shield, color: "text-cyan-400", bg: "bg-cyan-500/10", label: "Impersonation" },
  system: { icon: Zap, color: "text-violet-400", bg: "bg-violet-500/10", label: "System" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "All Alerts" },
  { value: "unread", label: "Unread Only" },
  { value: "school_signup", label: "Signups" },
  { value: "subscription_activated", label: "Subscriptions" },
  { value: "trial_expiring", label: "Trial Expiring" },
  { value: "system", label: "System" },
];

function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatTimeAgo(iso, now) {
  const diff = now - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function TimeAgo({ iso }) {
  const now = useNow(30000);
  const text = useMemo(() => formatTimeAgo(iso, now), [iso, now]);
  return <span>{text}</span>;
}

/**
 * Fetches alerts from the API. Returns { alerts, unreadCount }.
 */
async function fetchAlerts(filter) {
  const params = new URLSearchParams();
  if (filter === "unread") params.set("unread", "true");
  else if (filter !== "all") params.set("type", filter);
  const res = await fetch(`/api/platform/alerts?${params}`);
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
}

/**
 * Platform Alerts — event feed with filters, mark-as-read, and live polling.
 */
export default function AlertsPage() {
  const [filter, setFilter] = useState("all");
  const [result, setResult] = useState({ alerts: [], unreadCount: 0 });
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(false);
  const prevCountRef = useRef(0);
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    fetchAlerts(filter)
      .then((data) => {
        if (!mountedRef.current) return;
        const newCount = data.unreadCount || 0;
        setResult({ alerts: data.alerts || [], unreadCount: newCount });
        if (prevCountRef.current > 0 && newCount > prevCountRef.current) {
          setFlash(true);
          setTimeout(() => { if (mountedRef.current) setFlash(false); }, 2000);
        }
        prevCountRef.current = newCount;
        setLoading(false);
      })
      .catch(() => { if (mountedRef.current) setLoading(false); });
  }, [filter]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const id = setInterval(load, 15000);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [load]);

  async function markAllRead() {
    try {
      const res = await fetch("/api/platform/alerts/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setResult((prev) => ({ ...prev, unreadCount: data.unreadCount || 0, alerts: prev.alerts.map((a) => ({ ...a, read: true })) }));
      }
    } catch { /* ignore */ }
  }

  async function markOneRead(alertId) {
    try {
      const res = await fetch("/api/platform/alerts/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [alertId] }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult((prev) => ({ ...prev, unreadCount: data.unreadCount || 0, alerts: prev.alerts.map((a) => a.id === alertId ? { ...a, read: true } : a) }));
      }
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
      </div>
    );
  }

  const { alerts, unreadCount } = result;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Alerts</h1>
            {unreadCount > 0 && (
              <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${flash ? "bg-red-500/30 text-red-300 animate-pulse" : "bg-red-500/15 text-red-400"}`}>
                <Bell className="h-3 w-3" />
                {unreadCount} new
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Real-time platform notifications and events
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/10"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-zinc-500" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === opt.value
                ? "bg-cyan-500/15 text-cyan-300"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
            }`}
          >
            {opt.label}
            {opt.value === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500/20 px-1.5 text-[10px]">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Alert Feed */}
      <div className="platform-card divide-y divide-white/[0.04]">
        {alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <Bell className="h-10 w-10 text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-500">No alerts to show</p>
            <p className="mt-1 text-xs text-zinc-600">
              {filter === "unread" ? "All caught up!" : "Alerts appear here as schools register, change plans, or take actions."}
            </p>
          </div>
        )}
        {alerts.map((alert) => {
          const config = TYPE_CONFIG[alert.type] || TYPE_CONFIG.system;
          const Icon = config.icon;
          return (
            <div
              key={alert.id}
              onClick={() => !alert.read && markOneRead(alert.id)}
              className={`flex items-start gap-4 px-6 py-4 transition ${
                !alert.read ? "bg-white/[0.015] cursor-pointer hover:bg-white/[0.025]" : "opacity-50"
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-sm ${!alert.read ? "font-semibold text-white" : "text-gray-300"}`}>{alert.title}</p>
                  {!alert.read && (
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  )}
                </div>
                {alert.message && (
                  <p className="mt-0.5 text-xs text-zinc-400">{alert.message}</p>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-600">
                  <span className={`font-medium ${config.color}`}>{config.label}</span>
                  <span>·</span>
                  <TimeAgo iso={alert.createdAt} />
                  {alert.schoolName && (
                    <>
                      <span>·</span>
                      <span className="text-zinc-500">{alert.schoolName}</span>
                    </>
                  )}
                </div>
              </div>
              {!alert.read && (
                <button
                  onClick={(e) => { e.stopPropagation(); markOneRead(alert.id); }}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300"
                  title="Mark as read"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
