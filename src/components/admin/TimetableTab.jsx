"use client";

import {
  AlertTriangle, ArrowLeftRight, CalendarDays, CalendarX, CheckCircle2,
  ChevronDown, Clock, Link2Off, Loader2, Plus, RefreshCw, RotateCcw,
  Save, ShieldCheck, UserX, X,
} from "lucide-react";
import { DAYS, MAX_PERIOD, PERIODS } from "@/lib/timetable";
import { useAdminShell } from "./context/AdminContext";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Timetable tab — consumed from AdminContext instead of receiving 26 props.
 */
export default function TimetableTab() {
  const {
    ttArm, setTtArm, ttConflicts, ttConflictsOpen, setTtConflictsOpen,
    ttConflictsLoading, ttConflictFixing, dayTimeline, dayTimelines, dayPeriodSets,
    ttByKey, ttFilled, openTtCell, checkTtConflicts, fixTtConflict, swapTtTeacher,
    ttSwapDraft, setTtSwapDraft, bellDraft, bellDay, dailyDrafts, selectBellDay,
    setBellDayPeriodCount, setPeriodTime, setBreakTime, resetBellDay,
    savePeriodTimes, periodTimesSaving, session,
  } = useAdminShell();
  return (
            <div className="mt-5 space-y-5 animate-fade-up">
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-6 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                      <CalendarDays className="h-5 w-5 text-brand-600" />
                      Weekly timetable
                    </h2>
                    <p className="mt-0.5 text-sm text-navy-400">
                      Set the schedule for each class arm — click any cell to assign a subject and teacher.
                      Teachers see their own slots the moment you save.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => checkTtConflicts()}
                      disabled={ttConflictsLoading}
                      title="Scan every arm for teachers double-booked at the same day + period (including pre-existing data)"
                      className="inline-flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
                    >
                      {ttConflictsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      Check conflicts
                      {ttConflicts &&
                        (ttConflicts.teacher?.length || 0) +
                          (ttConflicts.arm?.length || 0) +
                          (ttConflicts.scope?.length || 0) >
                          0 && (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">
                            {(ttConflicts.teacher?.length || 0) +
                              (ttConflicts.arm?.length || 0) +
                              (ttConflicts.scope?.length || 0)}
                          </span>
                        )}
                    </button>
                    <div className="relative w-64">
                      <select
                        value={ttArm}
                        onChange={(e) => setTtArm(e.target.value)}
                        className={`${inputCls} appearance-none pr-9`}
                      >
                        {(session.school?.activeArms || []).map((arm) => (
                          <option key={arm}>{arm}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-4 py-3">Period</th>
                        {DAYS.map((d) => {
                          const count = (dayTimelines[d] || []).filter((b) => b.type === "teaching").length;
                          return (
                            <th key={d} className="px-4 py-3 text-center">
                              {d}
                              {count < MAX_PERIOD && (
                                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                  {count} periods
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {dayTimeline.map((block) =>
                        block.type === "break" ? (
                          <tr key="break" className="border-b border-navy-50">
                            <td className="bg-violet-50/60 px-4 py-3">
                              <p className="text-xs font-bold text-violet-700">Break</p>
                              <p className="text-[10px] font-medium text-violet-500">
                                {block.start}–{block.end}
                              </p>
                            </td>
                            {DAYS.map((d) => {
                              const br = (dayTimelines[d] || []).find((b) => b.type === "break");
                              return (
                                <td key={d} className="bg-violet-50/40 px-2 py-2 text-center">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-500">
                                    {br ? `${br.start}–${br.end}` : "No break"}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ) : (
                          <tr key={block.period} className="border-b border-navy-50">
                            <td className="px-4 py-3">
                              <p className="text-xs font-bold text-navy-500">Period {block.period}</p>
                              <p className="text-[10px] font-medium text-navy-400">
                                {block.start}–{block.end}
                              </p>
                            </td>
                            {DAYS.map((d) => {
                              // A period that isn't on this day's bell (e.g.
                              // Friday ends at period 6) is not schedulable.
                              if (!(dayPeriodSets[d] || new Set()).has(Number(block.period))) {
                                return (
                                  <td key={d} className="px-2 py-2 text-center">
                                    <span className="text-[10px] font-medium text-navy-300">
                                      not scheduled
                                    </span>
                                  </td>
                                );
                              }
                              const entry = ttByKey[`${d}|${block.period}`];
                              return (
                                <td key={d} className="px-2 py-2 text-center">
                                  <button
                                    onClick={() => openTtCell(d, block.period)}
                                    className={`w-full min-w-[7.5rem] rounded-xl border px-2 py-2 text-left transition ${
                                      entry
                                        ? "border-brand-200 bg-brand-50/70 hover:border-brand-400 hover:bg-brand-50"
                                        : "border-dashed border-navy-200 bg-navy-50/40 text-navy-400 hover:border-brand-300 hover:bg-brand-50/40"
                                    }`}
                                  >
                                    {entry ? (
                                      <span className="flex flex-col items-center gap-0.5">
                                        <span className="text-xs font-bold text-brand-800">{entry.subject}</span>
                                        <span className="text-[10px] font-medium text-navy-500">
                                          {entry.teacherName || "—"}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="flex items-center justify-center gap-1 text-[11px] font-semibold">
                                        <Plus className="h-3 w-3" /> Assign
                                      </span>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-navy-100 bg-navy-50/40 px-6 py-3 text-xs text-navy-500">
                  {ttFilled} of {DAYS.length * PERIODS.length} slots assigned for {ttArm}. Assigning a period
                  replaces what was there; the API refuses a teacher who is already booked in another arm at the
                  same day and period.
                </div>
              </div>

              {/* Conflicts checker — scans EVERY arm, including pre-existing data */}
              {ttConflictsOpen && (
                <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-6 py-4">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                        <AlertTriangle className="h-5 w-5 text-rose-600" /> Timetable scan
                      </h2>
                      <p className="mt-0.5 text-sm text-navy-400">
                        Every class arm, including pre-existing data — double-bookings, scope violations, and the
                        other integrity checks (unassigned days, unscheduled teachers, orphaned entries).
                      </p>
                    </div>
                    <button
                      onClick={() => checkTtConflicts()}
                      disabled={ttConflictsLoading}
                      className="inline-flex items-center gap-2 rounded-xl border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-600 transition hover:bg-navy-50 disabled:opacity-60"
                    >
                      {ttConflictsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Re-scan
                    </button>
                  </div>
                  <div className="p-5">
                    {ttConflictsLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-sm text-navy-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Scanning all {(session.school?.activeArms || []).length} arms…
                      </div>
                    ) : (ttConflicts?.teacher?.length || 0) +
                      (ttConflicts?.arm?.length || 0) +
                      (ttConflicts?.scope?.length || 0) +
                      (ttConflicts?.unassignedPeriods?.length || 0) +
                      (ttConflicts?.unstaffedTeachers?.length || 0) +
                      (ttConflicts?.orphanedEntries?.length || 0) ===
                      0 ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        No issues — no double-bookings, every teacher has slots, and every arm is scheduled.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(ttConflicts?.teacher || []).map((c) => (
                          <div
                            key={`t|${c.teacherId}|${c.day}|${c.period}`}
                            className="rounded-xl border border-rose-200 bg-rose-50/50 p-4"
                          >
                            <p className="text-sm font-bold text-navy-800">
                              <span className="text-rose-700">{c.teacherName || "Unknown teacher"}</span> is booked
                              in {c.slots.length} classes on <strong>{c.day}</strong>, period{" "}
                              <strong>{c.period}</strong>
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {c.slots.map((s) => (
                                <div
                                  key={s.id}
                                  className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs"
                                >
                                  <span className="font-bold text-navy-700">{s.classArm}</span>
                                  <span className="text-navy-400">·</span>
                                  <span className="text-navy-500">{s.subject}</span>
                                  <button
                                    onClick={() => fixTtConflict(s)}
                                    disabled={
                                      ttConflictFixing === `${s.classArm}|${s.day}|${s.period}`
                                    }
                                    className="ml-1 inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
                                  >
                                    {ttConflictFixing === `${s.classArm}|${s.day}|${s.period}` ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                    Clear slot
                                  </button>
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-[11px] text-navy-400">
                              Clearing a slot frees the teacher for that period — reassign it from the grid if
                              the arm should keep the subject.
                            </p>
                          </div>
                        ))}
                        {(ttConflicts?.arm || []).map((c) => (
                          <div
                            key={`a|${c.classArm}|${c.day}|${c.period}`}
                            className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"
                          >
                            <p className="text-sm font-bold text-navy-800">
                              <span className="text-amber-700">{c.classArm}</span> has {c.slots.length} entries
                              on <strong>{c.day}</strong>, period <strong>{c.period}</strong> — keep one, clear
                              the rest.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {c.slots.map((s) => (
                                <div
                                  key={s.id}
                                  className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs"
                                >
                                  <span className="font-bold text-navy-700">{s.subject}</span>
                                  <span className="text-navy-400">·</span>
                                  <span className="text-navy-500">{s.teacherName || "—"}</span>
                                  <button
                                    onClick={() => fixTtConflict(s)}
                                    disabled={
                                      ttConflictFixing === `${s.classArm}|${s.day}|${s.period}`
                                    }
                                    className="ml-1 inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-amber-500 disabled:opacity-60"
                                  >
                                    {ttConflictFixing === `${s.classArm}|${s.day}|${s.period}` ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                    Clear slot
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {/* Scope violations — a teacher scheduled for a subject/arm
                            they don't teach (or no longer in the roster). Offer a
                            one-click swap to a valid, free teacher. */}
                        {(ttConflicts?.scope || []).map((v) => {
                          const chosen =
                            ttSwapDraft[v.entryId] || v.candidates?.[0]?.id || "";
                          const problemText = v.problems.includes("teacher")
                            ? "but is no longer in the roster"
                            : v.problems.includes("subject") && v.problems.includes("arm")
                              ? `but does not teach ${v.subject} nor is assigned to ${v.classArm}`
                              : v.problems.includes("subject")
                                ? `but does not teach ${v.subject}`
                                : `but is not assigned to ${v.classArm}`;
                          return (
                            <div
                              key={`s|${v.entryId}`}
                              className="rounded-xl border border-sky-200 bg-sky-50/50 p-4"
                            >
                              <p className="text-sm font-bold text-navy-800">
                                <span className="text-sky-700">{v.teacherName || "Unknown teacher"}</span> is
                                scheduled for <strong>{v.subject}</strong> in <strong>{v.classArm}</strong> on{" "}
                                <strong>{v.day}</strong>, period <strong>{v.period}</strong> — {problemText}.
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {v.candidates?.length > 0 ? (
                                  <>
                                    <select
                                      value={chosen}
                                      onChange={(e) =>
                                        setTtSwapDraft((d) => ({ ...d, [v.entryId]: e.target.value }))
                                      }
                                      className="rounded-lg border border-navy-200 bg-white px-2 py-1.5 text-xs font-semibold text-navy-700 outline-none transition focus:border-brand-500"
                                      title="Pick a teacher who teaches this subject in this arm and is free that period"
                                    >
                                      {v.candidates.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => swapTtTeacher(v, chosen)}
                                      disabled={!chosen || ttConflictFixing === `swap|${v.entryId}`}
                                      className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
                                    >
                                      {ttConflictFixing === `swap|${v.entryId}` ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <ArrowLeftRight className="h-3 w-3" />
                                      )}
                                      Swap in valid teacher
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-xs font-medium text-sky-600">
                                    No valid substitute is free that period — clear the slot instead.
                                  </span>
                                )}
                                <button
                                  onClick={() => fixTtConflict(v)}
                                  disabled={ttConflictFixing === `${v.classArm}|${v.day}|${v.period}`}
                                  className="inline-flex items-center gap-1 rounded-md border border-navy-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-navy-600 transition hover:bg-navy-50 disabled:opacity-60"
                                >
                                  {ttConflictFixing === `${v.classArm}|${v.day}|${v.period}` ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                  Clear slot
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {/* Integrity checks — beyond collisions: an arm with an
                            entirely unassigned day, roster teachers with no
                            slots at all, entries left in deactivated arms. */}
                        {(ttConflicts?.unassignedPeriods?.length ||
                          ttConflicts?.unstaffedTeachers?.length ||
                          ttConflicts?.orphanedEntries?.length) > 0 && (
                          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                            <p className="text-sm font-bold text-navy-800">
                              <ShieldCheck className="mr-1.5 inline h-4 w-4 text-violet-600" />
                              Integrity checks
                            </p>
                            <div className="mt-3 space-y-2 text-xs text-navy-600">
                              {(ttConflicts?.unassignedPeriods || []).map((u) => (
                                <p key={`u|${u.classArm}|${u.day}`} className="flex items-start gap-2">
                                  <CalendarX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                                  <span>
                                    <strong>{u.classArm}</strong> has no classes on <strong>{u.day}</strong> —
                                    assign at least one period from the grid.
                                  </span>
                                </p>
                              ))}
                              {(ttConflicts?.unstaffedTeachers || []).map((t) => (
                                <p key={`ut|${t.teacherId}`} className="flex items-start gap-2">
                                  <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                                  <span>
                                    <strong>{t.teacherName || "Unknown teacher"}</strong> has no timetable
                                    slots — schedule them or remove them from the roster.
                                  </span>
                                </p>
                              ))}
                              {(ttConflicts?.orphanedEntries || []).map((o) => (
                                <p key={`or|${o.entryId}`} className="flex items-start gap-2">
                                  <Link2Off className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                                  <span>
                                    <strong>{o.subject}</strong> in <strong>{o.classArm}</strong> ({o.day},
                                    period {o.period})
                                    {o.teacherName ? ` — ${o.teacherName}` : ""} — the arm is no longer
                                    active. Delete or reassign the slot.
                                  </span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Period times — the bell schedule behind the class-alert alarms */}
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-6 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                      <Clock className="h-5 w-5 text-brand-600" /> Period times
                    </h2>
                    <p className="mt-0.5 text-sm text-navy-400">
                      The bell schedule drives the class-alert alarms teachers receive — edit when each period
                      starts and ends, then save.
                    </p>
                  </div>
                  <button
                    onClick={savePeriodTimes}
                    disabled={periodTimesSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
                  >
                    {periodTimesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save times
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 px-6 py-3">
                  {["ALL", ...DAYS].map((d) => {
                    const active = bellDay === d;
                    const custom = d !== "ALL" && Boolean(dailyDrafts[d]);
                    return (
                      <button
                        key={d}
                        onClick={() => selectBellDay(d)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-brand-600 text-white shadow"
                            : "bg-navy-50 text-navy-600 hover:bg-navy-100"
                        }`}
                      >
                        {d === "ALL" ? "All days" : d}
                        {custom && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            custom
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                  {bellDay !== "ALL" && (
                    <div className="col-span-full flex flex-wrap items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/40 p-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-navy-600">
                        Periods on this day
                        <select
                          value={bellDraft.periodTimes.length}
                          onChange={(e) => setBellDayPeriodCount(bellDay, Number(e.target.value))}
                          className={`${inputCls} !px-2 !py-1 text-xs`}
                        >
                          {PERIODS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="text-[11px] text-navy-400">
                        A shorter day (e.g. Friday ends at period 6) simply drops the later periods.
                      </span>
                      <button
                        onClick={() => resetBellDay(bellDay)}
                        disabled={!bellDraft.overridden}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-600 transition hover:bg-navy-50 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Use school default
                      </button>
                    </div>
                  )}
                  {bellDraft.periodTimes.map((pt) => (
                    <div key={pt.period} className="rounded-xl border border-navy-100 bg-navy-50/40 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                        Period {pt.period}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] font-medium text-navy-400">Start</span>
                          <input
                            type="time"
                            value={pt.start}
                            onChange={(e) => setPeriodTime(pt.period, "start", e.target.value)}
                            className={`${inputCls} !px-2 !py-1.5 text-xs`}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] font-medium text-navy-400">End</span>
                          <input
                            type="time"
                            value={pt.end}
                            onChange={(e) => setPeriodTime(pt.period, "end", e.target.value)}
                            className={`${inputCls} !px-2 !py-1.5 text-xs`}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  {/* The school-wide mid-day break — a display/alert concept,
                      never a timetable entry, so no teacher is ever assigned. */}
                  <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                      Break · between periods 4 &amp; 5
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-medium text-navy-400">Start</span>
                        <input
                          type="time"
                          value={bellDraft.breakTimes.start}
                          onChange={(e) => setBreakTime("start", e.target.value)}
                          className={`${inputCls} !px-2 !py-1.5 text-xs`}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-medium text-navy-400">End</span>
                        <input
                          type="time"
                          value={bellDraft.breakTimes.end}
                          onChange={(e) => setBreakTime("end", e.target.value)}
                          className={`${inputCls} !px-2 !py-1.5 text-xs`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>Teachers see this instantly.</strong> Every assignment flows straight into the teacher
                  portal&apos;s weekly timetable — a Mathematics teacher covering all twelve classes gets twelve
                  separate schedules, one per class, with today&apos;s column highlighted — and, when alerts are
                  enabled, an alarm rings as each period approaches.
                </p>
              </div>
            </div>
  );
}
