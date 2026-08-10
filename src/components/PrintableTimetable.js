"use client";

import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { DAYS, getDayTimeline, MAX_PERIOD } from "@/lib/timetable";

/**
 * The weekly timetable as a print sheet — the same grid the dashboards show,
 * rendered paper-first: school header, person + class, the five weekday
 * columns (each day resolves its OWN bell schedule — times, break band, and
 * short days like a Friday that ends at period 6), and a printed-on footer.
 * Shared by the on-screen preview and the off-screen print node so what you
 * preview is exactly what prints.
 */
function TimetableSheet({ school, mode, personName, personLabel, entries }) {
  const byDayPeriod = {};
  for (const e of entries || []) byDayPeriod[`${e.day}|${e.period}`] = e;

  const dayTimelines = Object.fromEntries(
    DAYS.map((d) => [d, getDayTimeline(school, d)])
  );
  const dayPeriodSets = Object.fromEntries(
    DAYS.map((d) => [
      d,
      new Set(
        (dayTimelines[d] || [])
          .filter((b) => b.type === "teaching")
          .map((b) => Number(b.period))
      ),
    ])
  );
  const spine = getDayTimeline(school);
  const dateLabel = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="print-sheet">
      <header className="print-head">
        <div>
          <h1 className="print-school">{school?.name || "School"}</h1>
          <p className="print-sub">
            {school?.currentSession || ""}
            {school?.currentTerm ? ` · ${school.currentTerm}` : ""}
          </p>
        </div>
        <div className="text-right">
          <h2 className="print-title">Weekly timetable</h2>
          <p className="print-sub">
            {personName}
            {personLabel ? ` · ${personLabel}` : ""}
          </p>
        </div>
      </header>

      <table className="print-table">
        <thead>
          <tr>
            <th className="print-col-period">Period</th>
            {DAYS.map((d) => {
              const count = (dayTimelines[d] || []).filter(
                (b) => b.type === "teaching"
              ).length;
              return (
                <th key={d}>
                  {d}
                  {count < MAX_PERIOD ? ` · ${count} periods` : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {spine.map((block) =>
            block.type === "break" ? (
              <tr key="break">
                <td className="print-col-period print-break-label">
                  <span className="font-semibold">Break</span>
                  <span>
                    {block.start}–{block.end}
                  </span>
                </td>
                {DAYS.map((d) => {
                  const br = (dayTimelines[d] || []).find(
                    (b) => b.type === "break"
                  );
                  return (
                    <td key={d} className="print-break-cell">
                      {br ? `${br.start}–${br.end}` : "—"}
                    </td>
                  );
                })}
              </tr>
            ) : (
              <tr key={block.period}>
                <td className="print-col-period">
                  <span className="font-semibold">Period {block.period}</span>
                  <span>
                    {block.start}–{block.end}
                  </span>
                </td>
                {DAYS.map((d) => {
                  // A period that isn't on this day's bell (e.g. Friday ends
                  // at period 6) never has a class to show.
                  if (!(dayPeriodSets[d] || new Set()).has(Number(block.period))) {
                    return (
                      <td key={d}>
                        <span className="print-empty">—</span>
                      </td>
                    );
                  }
                  const slot = byDayPeriod[`${d}|${block.period}`];
                  return (
                    <td key={d}>
                      {slot ? (
                        <div>
                          <span className="print-slot-main">{slot.subject}</span>
                          <span className="print-slot-sub">
                            {mode === "teacher"
                              ? slot.classArm
                              : slot.teacherName || "Staff"}
                          </span>
                        </div>
                      ) : (
                        <span className="print-empty">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            )
          )}
        </tbody>
      </table>

      <footer className="print-foot">
        Printed {dateLabel} ·{" "}
        {mode === "teacher" ? "Teacher weekly timetable" : "Class weekly timetable"}
        {" · "}Edutrack
      </footer>
    </div>
  );
}

/**
 * Print-friendly weekly timetable preview + print. Opens as a modal with the
 * sheet shown as a paper preview; the Print button isolates the sheet via a
 * portal'd node and @media print CSS (see globals.css) so the sidebar and app
 * chrome never reach paper.
 *
 * Props:
 *  - open, onClose
 *  - school         the session school (name/session/term + bell schedule)
 *  - mode           "student" (cells show the teacher) | "teacher" (arms)
 *  - personName     the student's or teacher's name
 *  - personLabel    e.g. the class arm (student) or role (teacher)
 *  - entries        the weekly timetable entries (day|period|subject|…)
 */
export default function PrintableTimetable({
  open,
  onClose,
  school,
  mode = "student",
  personName = "",
  personLabel = "",
  entries = [],
}) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/80 p-4 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl py-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Print weekly timetable</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/40 transition hover:bg-brand-500"
              >
                <Printer className="h-4 w-4" /> Print / Save as PDF
              </button>
              <button
                onClick={onClose}
                className="rounded-xl bg-white/10 p-2.5 text-white transition hover:bg-white/20"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-2xl">
            <TimetableSheet
              school={school}
              mode={mode}
              personName={personName}
              personLabel={personLabel}
              entries={entries}
            />
          </div>
        </div>
      </div>

      {/* The print node — portaled straight onto <body> so no transformed or
          fixed ancestor can break @media print positioning. */}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="print-area">
            <TimetableSheet
              school={school}
              mode={mode}
              personName={personName}
              personLabel={personLabel}
              entries={entries}
            />
          </div>,
          document.body
        )}
    </>
  );
}
