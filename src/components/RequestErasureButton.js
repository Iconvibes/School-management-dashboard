"use client";

import { useState, useEffect } from "react";
import { Trash2, Loader2, Clock, CheckCircle2, XCircle, Info } from "lucide-react";

/**
 * GDPR Right to Erasure — "Request Data Deletion" button.
 * Checks for an existing request, lets the user submit one, and shows status.
 */
export default function RequestErasureButton({ className = "" }) {
  const [status, setStatus] = useState(null); // null | "PENDING" | "APPROVED" | "EXECUTED" | "REJECTED"
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch("/api/me/erasure-request");
      const data = await res.json();
      setStatus(data.request?.status || null);
    } catch {
      // Silently ignore — button just stays in default state
    }
    setLoading(false);
  }

  async function submitRequest() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/erasure-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit request");
      setStatus("PENDING");
      setShowConfirm(false);
      setToast("Erasure request submitted. Your administrator will review it.");
      setTimeout(() => setToast(""), 4000);
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(""), 4000);
    } finally {
      setSubmitting(false);
    }
  }

  // Status indicators
  if (status === "PENDING") {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-amber-600 ${className}`}>
        <Clock className="h-3.5 w-3.5 animate-pulse" />
        Erasure request pending review
      </div>
    );
  }
  if (status === "APPROVED" || status === "EXECUTED") {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-emerald-600 ${className}`}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        Data deletion processed
      </div>
    );
  }
  if (status === "REJECTED") {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-rose-500 ${className}`}>
        <XCircle className="h-3.5 w-3.5" />
        Erasure request was rejected
      </div>
    );
  }

  // Default: no request yet — show the button
  if (showConfirm) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <div>
              <p className="text-sm font-semibold text-rose-800">
                Are you sure?
              </p>
              <p className="mt-1 text-xs text-rose-600">
                This will permanently delete all your personal data including
                scores, attendance, and fee records. This action requires
                administrator approval and cannot be undone once executed.
              </p>
            </div>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
            className="mt-3 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400/20"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={submitRequest}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {submitting ? "Submitting…" : "Yes, request deletion"}
            </button>
            <button
              onClick={() => { setShowConfirm(false); setReason(""); }}
              className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-navy-600 ring-1 ring-navy-200 transition hover:bg-navy-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          {toast}
        </div>
      )}
      <button
        onClick={() => setShowConfirm(true)}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-60 ${className}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Request Data Deletion
      </button>
    </>
  );
}
