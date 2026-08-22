"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  Eye,
} from "lucide-react";
import { warn } from "@/lib/log";

const STATUS_META = {
  PENDING: {
    label: "Pending Review",
    cls: "bg-amber-50 text-amber-700 ring-amber-600/20",
    icon: Clock,
  },
  APPROVED: {
    label: "Approved",
    cls: "bg-blue-50 text-blue-700 ring-blue-600/20",
    icon: CheckCircle2,
  },
  EXECUTED: {
    label: "Executed",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    icon: Trash2,
  },
  REJECTED: {
    label: "Rejected",
    cls: "bg-rose-50 text-rose-700 ring-rose-600/20",
    icon: XCircle,
  },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.PENDING;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${meta.cls}`}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function timeAgo(iso) {
  if (!iso) return "—";
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function ComplianceTab({ session }) {
  const [tab, setTab] = useState("erasure"); // "erasure" | "audit"
  const [requests, setRequests] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null); // expanded request id
  const [auditFilter, setAuditFilter] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadData();
  }, [tab]);

  async function loadData() {
    setLoading(true);
    try {
      if (tab === "erasure") {
        const res = await fetch("/api/admin/erasure-requests");
        const data = await res.json();
        setRequests(data.requests || []);
      } else {
        const url = auditFilter
          ? `/api/admin/data-access-log?action=${encodeURIComponent(auditFilter)}`
          : "/api/admin/data-access-log";
        const res = await fetch(url);
        const data = await res.json();
        setAuditLog(data.entries || []);
      }
    } catch (err) {
      warn("compliance", "failed to load data:", err);
    }
    setLoading(false);
  }

  async function reviewRequest(requestId, approved) {
    const action = approved ? "approve" : "reject";
    if (
      !window.confirm(
        approved
          ? "Approve this erasure request? The user's data will be permanently deleted."
          : "Reject this erasure request?"
      )
    )
      return;

    try {
      const res = await fetch("/api/admin/erasure-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to review request");

      setToast(data.message || `Request ${action}d`);
      setTimeout(() => setToast(""), 3000);
      loadData();
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(""), 3000);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-navy-800">
              GDPR Compliance
            </h2>
            <p className="text-xs text-navy-400">
              Erasure requests &amp; data access audit trail
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-600 transition hover:bg-navy-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {[
          { key: "erasure", label: "Erasure Requests", count: pendingCount },
          { key: "audit", label: "Data Access Log" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-navy-800 text-white shadow-lg shadow-navy-800/20"
                : "bg-white text-navy-600 ring-1 ring-navy-200 hover:bg-navy-50"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  tab === t.key
                    ? "bg-white/20 text-white"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {toast}
        </div>
      )}

      {/* Erasure Requests Tab */}
      {tab === "erasure" && (
        <div>
          {loading ? (
            <div className="py-12 text-center text-sm text-navy-400">
              Loading...
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-12 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-navy-300" />
              <p className="mt-3 text-sm font-medium text-navy-500">
                No erasure requests
              </p>
              <p className="mt-1 text-xs text-navy-400">
                When users request data deletion, they&apos;ll appear here for
                your review.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-navy-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-bold text-navy-800">
                          {r.userName}
                        </p>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-1 text-xs text-navy-400">
                        Requested {timeAgo(r.requestedAt)} · ID: {r.id}
                      </p>
                      {r.reason && (
                        <p className="mt-2 text-sm text-navy-600">
                          &ldquo;{r.reason}&rdquo;
                        </p>
                      )}
                    </div>

                    {r.status === "PENDING" && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => reviewRequest(r.id, true)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => reviewRequest(r.id, false)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-navy-600 ring-1 ring-navy-200 transition hover:bg-rose-50 hover:text-rose-600 hover:ring-rose-200"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>

                  {r.status === "EXECUTED" && (
                    <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">
                      <AlertTriangle className="mb-1 inline h-3.5 w-3.5" />
                      Executed {timeAgo(r.executedAt)} · User data permanently
                      deleted
                    </div>
                  )}

                  {r.reviewedAt && (
                    <p className="mt-2 text-xs text-navy-400">
                      Reviewed by {r.reviewedBy} · {timeAgo(r.reviewedAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Data Access Audit Log Tab */}
      {tab === "audit" && (
        <div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
              <input
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                placeholder="Filter by action type (e.g. ERASURE_EXECUTED)"
                className="w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-9 pr-4 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-navy-400">
              Loading...
            </div>
          ) : auditLog.length === 0 ? (
            <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-navy-300" />
              <p className="mt-3 text-sm font-medium text-navy-500">
                No audit entries
              </p>
              <p className="mt-1 text-xs text-navy-400">
                Data access events will appear here for compliance tracking.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-navy-100 bg-navy-50">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-navy-400">
                      Time
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-navy-400">
                      Actor
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-navy-400">
                      Action
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-navy-400">
                      Target
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-navy-400">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {auditLog.map((entry) => (
                    <tr key={entry.id} className="hover:bg-navy-50/50">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-navy-500">
                        {timeAgo(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-navy-800">
                          {entry.actorName}
                        </p>
                        <p className="text-xs text-navy-400">
                          {entry.actorRole}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-navy-100 px-2 py-0.5 text-xs font-bold text-navy-600">
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-navy-500">
                        {entry.targetType}: {entry.targetId}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-xs text-navy-500">
                        {entry.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
