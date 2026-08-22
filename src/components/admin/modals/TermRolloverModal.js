"use client";

import { Loader2, CheckCircle2 } from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";
import { TERMS } from "@/lib/grading";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Term rollover — archive the old term, clone fees + timetable forward.
 */
export default function TermRolloverModal() {
  const {
    rolloverOpen,
    setRolloverOpen,
    rolloverTermName,
    setRolloverTermName,
    rolloverSession,
    setRolloverSession,
    rolloverPreview,
    setRolloverPreview,
    rolloverPreviewing,
    rolloverSaving,
    previewRollover,
    confirmRollover,
    session,
  } = useAdminShell();

  return (
    <Modal
      open={rolloverOpen}
      onClose={() => !rolloverSaving && setRolloverOpen(false)}
      title="Start a new term"
    >
      <div className="space-y-4">
        <p className="text-sm text-navy-500">
          Moving from{" "}
          <strong className="text-navy-800">
            {session?.school?.currentSession} ·{" "}
            {session?.school?.currentTerm}
          </strong>{" "}
          to the new term:
        </p>
        <div className="rounded-xl bg-navy-50 p-4 text-sm text-navy-600">
          <ul className="list-disc space-y-1 pl-4">
            <li>
              Scores &amp; attendance are <strong>archived</strong> per arm
              (kept in the term archive, then cleared) — the new term starts
              fresh.
            </li>
            <li>
              Fee structures and the weekly timetable{" "}
              <strong>carry over</strong> to the new term.
            </li>
            <li>
              Every student&apos;s{" "}
              <strong>unpaid balance carries into the new term</strong> and is
              added to the new fee — those students/parents get an{" "}
              <strong>automatic reminder</strong>.
            </li>
            <li>
              Every student&apos;s fee status resets — nothing is paid for the
              new term yet.
            </li>
          </ul>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy-400">
            New term
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TERMS.map((t) => (
              <button
                key={t}
                type="button"
                disabled={t === session?.school?.currentTerm}
                onClick={() => {
                  setRolloverTermName(t);
                  setRolloverPreview(null);
                }}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  rolloverTermName === t
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-navy-200 bg-white text-navy-700 hover:border-brand-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy-400">
            Session
          </label>
          <input
            value={rolloverSession}
            onChange={(e) => {
              setRolloverSession(e.target.value);
              setRolloverPreview(null);
            }}
            placeholder="e.g. 2026/2027"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-navy-400">
            Leave as-is for a mid-session term change (First → Second →
            Third).
          </p>
        </div>
        {rolloverPreview && (
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-navy-700">
            <p className="font-semibold text-navy-800">Rollover preview</p>
            <ul className="mt-2 space-y-1">
              <li>
                📦 {rolloverPreview.scoresArchived || 0} score records
                archived
              </li>
              <li>
                📋 {rolloverPreview.attendanceArchived || 0} attendance
                registers archived
              </li>
              <li>
                💰 {rolloverPreview.feesCloned || 0} fee structures cloned
              </li>
              <li>
                🗓 {rolloverPreview.timetableCloned || 0} timetable slots
                carried over
              </li>
              <li>
                👥 {rolloverPreview.studentsReset || 0} students reset to
                unpaid
              </li>
              <li>
                🔁 {rolloverPreview.carryovers || 0} student
                {(rolloverPreview.carryovers || 0) === 1 ? "" : "s"} carry
                an unpaid balance into the new term
              </li>
              <li>
                🔔 Automatic fee reminders sent to each of those
                students/parents
              </li>
            </ul>
          </div>
        )}
        {rolloverPreview === null && (
          <button
            onClick={previewRollover}
            disabled={rolloverPreviewing || !rolloverTermName.trim()}
            className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rolloverPreviewing ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Preview what will happen"
            )}
          </button>
        )}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={() => setRolloverOpen(false)}
            disabled={rolloverSaving}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-navy-500 transition hover:bg-navy-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirmRollover}
            disabled={
              rolloverSaving ||
              !rolloverTermName.trim() ||
              !rolloverPreview
            }
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rolloverSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Archive &amp; start {rolloverTermName || "new term"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
