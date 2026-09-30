"use client";

import { useState, useCallback } from "react";
import { useNow } from "@/hooks/useNow";
import {
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  User,
  Mail,
  Calendar,
  Users,
  GraduationCap,
  AlertTriangle,
  CheckSquare,
  Square,
  Trash2,
} from "lucide-react";

/**
 * Rich review panel for pending school registrations.
 * Supports single and bulk approve/reject with selection UI.
 */
export default function PendingApprovals({ schools, onApprove, onReject, onBulkApprove, onBulkReject }) {
  const [expanded, setExpanded] = useState(null); // school id
  const [confirmApprove, setConfirmApprove] = useState(null); // school id
  const [rejectModal, setRejectModal] = useState(null); // school id
  const [rejectReason, setRejectReason] = useState("");
  const now = useNow(60_000); // for "Xh ago" labels, kept fresh per minute
  const [rejectDetail, setRejectDetail] = useState("");
  const [processing, setProcessing] = useState(null); // school id being processed
  const [selected, setSelected] = useState(new Set()); // bulk selection
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkConfirmAction, setBulkConfirmAction] = useState(null); // "approve" | "reject"
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === schools.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(schools.map((s) => s.id)));
    }
  }, [selected.size, schools]);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelected(new Set());
    setBulkConfirmAction(null);
    setBulkRejectReason("");
  }, []);

  async function handleApprove(schoolId) {
    setProcessing(schoolId);
    await onApprove(schoolId);
    setProcessing(null);
    setConfirmApprove(null);
  }

  async function handleReject(schoolId) {
    if (!rejectReason) return;
    setProcessing(schoolId);
    await onReject(schoolId, `${rejectReason}${rejectDetail ? `: ${rejectDetail}` : ""}`);
    setProcessing(null);
    setRejectModal(null);
    setRejectReason("");
    setRejectDetail("");
  }

  async function handleBulkApprove() {
    setBulkProcessing(true);
    await onBulkApprove([...selected]);
    setSelected(new Set());
    setBulkConfirmAction(null);
    setBulkProcessing(false);
  }

  async function handleBulkReject() {
    if (!bulkRejectReason) return;
    setBulkProcessing(true);
    await onBulkReject([...selected], bulkRejectReason);
    setSelected(new Set());
    setBulkConfirmAction(null);
    setBulkRejectReason("");
    setBulkProcessing(false);
  }

  if (!schools || schools.length === 0) return null;

  const REJECTION_REASONS = [
    "Not a recognized educational institution",
    "Incomplete or invalid registration details",
    "Duplicate or test registration",
    "Unable to verify school identity",
    "Does not meet platform requirements",
  ];

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
            <Clock className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              {schools.length} school{schools.length === 1 ? "" : "s"} pending approval
            </h3>
            <p className="text-xs text-zinc-400">
              Review each registration before granting platform access
            </p>
          </div>
        </div>

        {/* Bulk mode toggle */}
        {schools.length > 1 && (
          <button
            onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              bulkMode
                ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
                : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {bulkMode ? "Cancel bulk" : "Select multiple"}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {bulkMode && selected.size > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <span className="text-xs font-semibold text-amber-300">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => toggleAll()}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
            >
              {selected.size === schools.length ? "Deselect all" : "Select all"}
            </button>
            <button
              onClick={() => setBulkConfirmAction("approve")}
              disabled={bulkProcessing}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve {selected.size}
            </button>
            <button
              onClick={() => setBulkConfirmAction("reject")}
              disabled={bulkProcessing}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject {selected.size}
            </button>
          </div>
        </div>
      )}

      {/* Bulk approve confirmation */}
      {bulkConfirmAction === "approve" && (
        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div className="flex-1">
              <p className="text-sm text-emerald-300">
                Approve <strong>{selected.size} school{selected.size === 1 ? "" : "s"}</strong>? They will all gain full platform access.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...selected].map((id) => {
                  const s = schools.find((sc) => sc.id === id);
                  return s ? (
                    <span key={id} className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                      {s.name}
                    </span>
                  ) : null;
                })}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setBulkConfirmAction(null)}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkApprove}
                  disabled={bulkProcessing}
                  className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {bulkProcessing ? "Approving…" : `Yes, Approve All ${selected.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk reject confirmation */}
      {bulkConfirmAction === "reject" && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div className="flex-1">
              <p className="text-sm text-red-300">
                Reject <strong>{selected.size} school{selected.size === 1 ? "" : "s"}</strong>?
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...selected].map((id) => {
                  const s = schools.find((sc) => sc.id === id);
                  return s ? (
                    <span key={id} className="rounded-md bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-300">
                      {s.name}
                    </span>
                  ) : null;
                })}
              </div>
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold text-red-300">Rejection reason (applies to all)</p>
                <div className="flex flex-wrap gap-2">
                  {REJECTION_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => setBulkRejectReason(reason)}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        bulkRejectReason === reason
                          ? "bg-red-500/30 text-red-200 ring-1 ring-red-500/30"
                          : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => { setBulkConfirmAction(null); setBulkRejectReason(""); }}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkReject}
                  disabled={!bulkRejectReason || bulkProcessing}
                  className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400 disabled:opacity-40"
                >
                  {bulkProcessing ? "Rejecting…" : `Reject All ${selected.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* School cards */}
      <div className="mt-4 space-y-3">
        {schools.map((s) => {
          const isExpanded = expanded === s.id;
          const isConfirming = confirmApprove === s.id;
          const isRejecting = rejectModal === s.id;
          const isProcessing = processing === s.id;
          const isSelected = selected.has(s.id);
          const created = new Date(s.createdAt);
          const hoursAgo =
            now === null
              ? null
              : Math.round((now - created.getTime()) / (1000 * 60 * 60));

          return (
            <div
              key={s.id}
              className={`overflow-hidden rounded-xl border transition ${
                isSelected ? "border-amber-500/30 bg-amber-500/5" : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              {/* Collapsed row */}
              <div className="flex items-center gap-4 p-4">
                {/* Bulk checkbox */}
                {bulkMode && (
                  <button
                    onClick={() => toggleSelect(s.id)}
                    className="shrink-0 transition hover:opacity-80"
                  >
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5 text-amber-400" />
                    ) : (
                      <Square className="h-5 w-5 text-zinc-600" />
                    )}
                  </button>
                )}

                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: s.brandColor || "#2563EB" }}
                >
                  {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{s.name}</p>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <User className="h-3 w-3" />
                    <span>{s.adminName || "Unknown"}</span>
                    <span className="text-zinc-700">·</span>
                    <Mail className="h-3 w-3" />
                    <span>{s.adminEmail || s.email}</span>
                  </div>
                </div>
                <div className="hidden items-center gap-4 text-xs text-zinc-500 sm:flex">
                  <div className="text-center">
                    <p className="font-semibold text-zinc-300">{s.userCount || 0}</p>
                    <p>users</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-zinc-300">{hoursAgo}h</p>
                    <p>ago</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!bulkMode && (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : s.id)}
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && !bulkMode && (
                <div className="border-t border-white/[0.06] px-4 pb-4 pt-4">
                  {/* School identity header */}
                  <div className="mb-4 flex items-center gap-4 rounded-lg bg-white/[0.03] p-4">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                      style={{ backgroundColor: s.brandColor || "#2563EB" }}
                    >
                      {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-white">{s.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                        <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> {s.billingPlan === "trial" ? "14-day Free Trial" : s.billingPlan || "trial"}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Registered {created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at {created.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {hoursAgo}h ago</span>
                      </div>
                    </div>
                  </div>

                  {/* Two-column layout: Admin info + School setup */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* Admin details */}
                    <div className="rounded-lg bg-white/[0.03] p-4">
                      <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        <User className="h-3.5 w-3.5" /> Admin Account
                      </h4>
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Name</span>
                          <span className="text-sm font-medium text-zinc-200">{s.adminName || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Email</span>
                          <span className="text-sm font-medium text-zinc-200">{s.adminEmail || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Email verified</span>
                          {s.emailVerified ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">Yes</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">Pending</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* School setup */}
                    <div className="rounded-lg bg-white/[0.03] p-4">
                      <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        <GraduationCap className="h-3.5 w-3.5" /> School Setup
                      </h4>
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Total users</span>
                          <span className="text-sm font-medium text-zinc-200">{s.userCount || 0}</span>
                        </div>
                        {s.userBreakdown && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Students</span>
                              <span className="text-sm font-medium text-zinc-200">{s.userBreakdown.students}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Teachers</span>
                              <span className="text-sm font-medium text-zinc-200">{s.userBreakdown.teachers}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Parents</span>
                              <span className="text-sm font-medium text-zinc-200">{s.userBreakdown.parents}</span>
                            </div>
                            {s.userBreakdown.staff > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-500">Staff (bursar/registrar)</span>
                                <span className="text-sm font-medium text-zinc-200">{s.userBreakdown.staff}</span>
                              </div>
                            )}
                          </>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Class arms</span>
                          <span className="text-sm font-medium text-zinc-200">{(s.activeArmsList || s.activeArms || []).length}</span>
                        </div>
                        {(s.activeArmsList || s.activeArms || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(s.activeArmsList || s.activeArms || []).map((arm) => (
                              <span key={arm} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-400">{arm}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center gap-3">
                    {isConfirming ? (
                      <div className="flex w-full items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                        <span className="text-sm text-emerald-300">
                          Approve <strong>{s.name}</strong>? They will gain full platform access.
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            onClick={() => setConfirmApprove(null)}
                            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/10"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleApprove(s.id)}
                            disabled={isProcessing}
                            className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                          >
                            {isProcessing ? "Approving…" : "Yes, Approve"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setConfirmApprove(s.id);
                            setRejectModal(null);
                          }}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setRejectModal(isRejecting ? null : s.id);
                            setConfirmApprove(null);
                          }}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </>
                    )}
                  </div>

                  {/* Rejection form */}
                  {isRejecting && !isConfirming && (
                    <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-red-300">Rejection reason</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {REJECTION_REASONS.map((reason) => (
                              <button
                                key={reason}
                                onClick={() => setRejectReason(reason)}
                                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                                  rejectReason === reason
                                    ? "bg-red-500/30 text-red-200 ring-1 ring-red-500/30"
                                    : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                                }`}
                              >
                                {reason}
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={rejectDetail}
                            onChange={(e) => setRejectDetail(e.target.value)}
                            placeholder="Additional details (optional)…"
                            rows={2}
                            className="mt-3 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-red-500/30"
                          />
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              onClick={() => {
                                setRejectModal(null);
                                setRejectReason("");
                                setRejectDetail("");
                              }}
                              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/10"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleReject(s.id)}
                              disabled={!rejectReason || isProcessing}
                              className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400 disabled:opacity-40"
                            >
                              {isProcessing ? "Rejecting…" : "Confirm Rejection"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
