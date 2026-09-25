"use client";

import { CalendarCheck, ChevronDown, ClipboardList, Loader2, Save, UserCheck, UserX } from "lucide-react";

export default function AttendanceView({
  classArm, setClassArm, teacherArms, attDate, setAttDate,
  attRows, attLoaded, attSaving, attMarked, attPresent, attAbsent,
  saveAttendance, setAttStatus,
}) {
  return (
            <div className="animate-fade-up">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-navy-700">
                      <ClipboardList className="h-4 w-4 text-brand-600" /> Class arm
                    </span>
                    <div className="relative">
                      <select
                        value={classArm}
                        onChange={(e) => setClassArm(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-navy-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      >
                        {teacherArms.map((arm) => (
                          <option key={arm}>{arm}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-navy-700">
                      <CalendarCheck className="h-4 w-4 text-brand-600" /> Date
                    </span>
                    <input
                      type="date"
                      value={attDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setAttDate(e.target.value)}
                      className="w-full rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-navy-600 ring-1 ring-navy-200">
                    {attMarked}/{attRows.length} marked
                  </span>
                  <button
                    onClick={saveAttendance}
                    disabled={attSaving || attMarked === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
                  >
                    {attSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save register
                  </button>
                </div>
              </div>

              {/* Register */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="text-lg font-bold text-navy-800">
                    Daily register · {classArm}
                  </h2>
                  <p className="text-sm text-navy-400">
                    Tap each student to toggle Present / Absent. Attendance flows onto report cards automatically.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-6 py-3">Student</th>
                        <th className="px-6 py-3 text-center">Status</th>
                        <th className="px-6 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attRows.map((r) => (
                        <tr key={r.studentId} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                                {r.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-navy-800">{r.name}</p>
                                <p className="text-xs text-navy-400">{r.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            {r.present === null ? (
                              <span className="text-xs text-navy-300">Not marked</span>
                            ) : r.present ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                <UserCheck className="h-3 w-3" /> Present
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-600/20">
                                <UserX className="h-3 w-3" /> Absent
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => setAttStatus(r.studentId, true)}
                                disabled={attSaving}
                                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                                  r.present === true
                                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                                }`}
                              >
                                Present
                              </button>
                              <button
                                onClick={() => setAttStatus(r.studentId, false)}
                                disabled={attSaving}
                                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                                  r.present === false
                                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                                    : "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
                                }`}
                              >
                                Absent
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {attRows.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-navy-400">
                            {attLoaded ? `No students in ${classArm} yet — add one from the Grading Matrix.` : "Loading…"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-navy-500">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-500" /> {attPresent} present
                </span>
                <span className="flex items-center gap-1.5">
                  <UserX className="h-3.5 w-3.5 text-rose-500" /> {attAbsent} absent
                </span>
                <span className="text-navy-400">
                  Attendance summaries appear on each student&apos;s report card.
                </span>
              </div>
            </div>
  );
}
