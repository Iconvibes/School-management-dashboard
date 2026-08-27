"use client";

import { Loader2, CheckCircle2, Send } from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";
import { useFeeContext } from "@/components/admin/context/FeeContext";

/**
 * Reconcile & forward modal — push student-addressed reminders to newly
 * linked parents.
 */
export default function ReconcileModal() {
  const {
    reconcileAndForward,
  } = useAdminShell();
  const { state: feeState } = useFeeContext();
  const {
    reconcileModal, setReconcileModal, reconcileSending, reconcileResult,
    pendingReconciles,
  } = feeState;

  return (
    <Modal
      open={reconcileModal}
      onClose={() => setReconcileModal(false)}
      title="Reconcile & forward reminders"
    >
      {reconcileSending ? (
        <div className="flex flex-col items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          <p className="mt-3 text-sm font-semibold text-navy-600">
            Forwarding reminders…
          </p>
        </div>
      ) : reconcileResult ? (
        <div className="space-y-4">
          {reconcileResult.forwarded?.length > 0 ? (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                <div>
                  <p className="text-sm font-bold text-sky-900">
                    {reconcileResult.forwarded.reduce(
                      (a, f) => a + (f.remindersForwarded || 0),
                      0
                    )}{" "}
                    reminder
                    {reconcileResult.forwarded.reduce(
                      (a, f) => a + (f.remindersForwarded || 0),
                      0
                    ) === 1
                      ? ""
                      : "s"}{" "}
                    forwarded to {reconcileResult.forwarded.length} parent
                    {reconcileResult.forwarded.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-xs text-sky-700">
                    Each parent now has a copy on their portal, and the forward
                    is logged in the audit trail below.
                  </p>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-navy-100">
                {reconcileResult.forwarded.map((f) => (
                  <div
                    key={f.studentId}
                    className="flex items-center justify-between gap-3 border-b border-navy-50 px-4 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-800">
                        {f.studentName}
                      </p>
                      <p className="truncate text-xs text-navy-400">
                        to {f.parent.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-sky-600">
                      {f.remindersForwarded} reminder
                      {f.remindersForwarded === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Nothing to forward — no reminders are waiting on a parent.
            </div>
          )}
          <button
            onClick={() => setReconcileModal(false)}
            className="inline-flex w-full items-center justify-center rounded-xl bg-navy-800 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-navy-600">
            These reminders were sent to the <strong>student</strong> because
            no parent was linked at the time. Forwarding sends the parent a
            copy on their portal and marks the originals as done — they
            won&apos;t be forwarded again.
          </p>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-navy-100">
            {pendingReconciles.map((p) => (
              <div
                key={p.studentId}
                className="flex items-center justify-between gap-3 border-b border-navy-50 px-4 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy-800">
                    {p.studentName}
                  </p>
                  <p className="truncate text-xs text-navy-400">
                    {p.classArm || "Unassigned"} · to {p.parent.name}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700 ring-1 ring-sky-600/20">
                  {p.reminders.length} reminder
                  {p.reminders.length === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => reconcileAndForward()}
            disabled={reconcileSending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/30 transition hover:bg-sky-500 disabled:opacity-60"
          >
            {reconcileSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Forward to {pendingReconciles.length} parent
            {pendingReconciles.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </Modal>
  );
}
