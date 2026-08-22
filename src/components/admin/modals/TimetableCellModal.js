"use client";

import { Loader2, Check, X, BookOpen, AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";
import { slotConflictReasons } from "@/lib/timetable";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Timetable cell editor — pick a subject + teacher for one period.
 */
export default function TimetableCellModal() {
  const {
    ttModal,
    setTtModal,
    ttDraft,
    setTtDraft,
    ttSaving,
    ttArm,
    ttByKey,
    ttTeachersForSubject,
    ttHealth,
    ttFlaggedSlots,
    saveTtSlot,
    clearTtSlot,
    teachers,
    subjects,
  } = useAdminShell();

  return (
    <Modal
      open={ttModal !== null}
      onClose={() => setTtModal(null)}
      title={
        ttModal
          ? `Period ${ttModal.period} · ${ttModal.day} · ${ttArm}`
          : ""
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">
            Subject
          </span>
          <select
            value={ttDraft.subject}
            onChange={(e) => {
              const subject = e.target.value;
              setTtDraft({
                subject,
                teacherId:
                  teachers.find(
                    (t) =>
                      !t.subjects?.length ||
                      t.subjects.includes(subject)
                  )?.id || "",
              });
            }}
            className={inputCls}
          >
            {subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">
            Teacher
          </span>
          <select
            value={ttDraft.teacherId}
            onChange={(e) =>
              setTtDraft({ ...ttDraft, teacherId: e.target.value })
            }
            className={inputCls}
          >
            <option value="">Choose a teacher…</option>
            {ttTeachersForSubject.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <p className="flex items-start gap-2 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-xs text-navy-600">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          Only teachers who teach{" "}
          <strong>{ttDraft.subject || "the chosen subject"}</strong> are
          listed — the API also refuses a teacher already booked in another
          arm at the same day and period.
        </p>
        {ttModal &&
          (() => {
            const slotKey = `${ttArm}|${ttModal.day}|${ttModal.period}`;
            const liveReasons = slotConflictReasons(
              ttHealth?.conflicts,
              ttArm,
              ttModal.day,
              ttModal.period
            );
            if (
              !ttFlaggedSlots.has(slotKey) &&
              liveReasons.length === 0
            )
              return null;
            return (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  {liveReasons.length > 0 ? (
                    <>
                      <p>
                        This slot is part of a live conflict flagged by the
                        last scan:
                      </p>
                      <ul className="list-inside list-disc space-y-0.5 text-amber-800">
                        {liveReasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>
                      This slot was flagged by an earlier conflict scan.
                      Reassigning it could silently reintroduce the issue —
                      saving here asks for confirmation.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        {ttByKey[`${ttModal?.day}|${ttModal?.period}`] &&
          (() => {
            const existing =
              ttByKey[`${ttModal?.day}|${ttModal?.period}`];
            return (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Saving replaces the current slot:{" "}
                <strong>{existing.subject}</strong> ·{" "}
                {existing.teacherName || "Unassigned"}.
              </p>
            );
          })()}
        <div className="flex gap-2">
          <button
            onClick={saveTtSlot}
            disabled={
              ttSaving || !ttDraft.subject || !ttDraft.teacherId
            }
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
          >
            {ttSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save slot
          </button>
          {ttByKey[`${ttModal?.day}|${ttModal?.period}`] && (
            <button
              onClick={clearTtSlot}
              disabled={ttSaving}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              <X className="h-4 w-4" /> Free period
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
