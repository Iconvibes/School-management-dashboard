"use client";

import {
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  History,
  Loader2,
} from "lucide-react";
import { ordinal } from "@/lib/grading";

/**
 * Previous Terms & Alumni tab — extracted from admin dashboard page.js.
 */
export default function ArchivesTab({
  archMode,
  setArchMode,
  archTerms,
  archTerm,
  archArm,
  archDetail,
  archLoading,
  archAlumni,
  archAlumniLoading,
  archAlumniLoaded,
  selectArchTerm,
  selectArchArm,
  loadAlumni,
  exportAlumniCsv,
  openArchReport,
  setArchDetail,
}) {
  return (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="text-lg font-bold text-navy-800">Previous terms</h2>
                  <p className="text-sm text-navy-400">
                    Archived when you started a new term: each old term&apos;s scores &amp; attendance are
                    kept here per class arm. Open an arm to view its students and print report cards.
                  </p>
                  <div className="mt-3 flex w-fit gap-1 rounded-xl bg-navy-100 p-1">
                    <button
                      onClick={() => setArchMode("terms")}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        archMode === "terms" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                      }`}
                    >
                      Archived terms
                    </button>
                    <button
                      onClick={loadAlumni}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        archMode === "alumni" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                      }`}
                    >
                      Alumni
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  {archMode === "alumni" ? (
                    archAlumniLoading ? (
                      <div className="flex items-center justify-center gap-2 py-10 text-sm text-navy-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading alumni…
                      </div>
                    ) : archAlumni.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
                        <GraduationCap className="mx-auto h-8 w-8 text-navy-300" />
                        <p className="mt-3 text-sm font-medium text-navy-600">No alumni yet</p>
                        <p className="mt-1 text-xs text-navy-400">
                          Students who appear in an archived term but are no longer on the live roster
                          show up here — including the term they last attended.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-navy-400">
                            {archAlumni.length} student{archAlumni.length === 1 ? "" : "s"} no longer on
                            the live roster
                          </p>
                          <a
                            href="/api/school/archives?alumni=1&format=csv"
                            download
                            onClick={exportAlumniCsv}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600"
                          >
                            <Download className="h-3.5 w-3.5" /> Export CSV
                          </a>
                        </div>
                        <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
                              <th className="px-6 py-3">Student</th>
                              <th className="px-6 py-3">Last class arm</th>
                              <th className="px-6 py-3">Last term</th>
                            </tr>
                          </thead>
                          <tbody>
                            {archAlumni.map((a) => (
                              <tr key={a.studentId} className="border-t border-navy-100 hover:bg-navy-50/40">
                                <td className="px-6 py-3 font-semibold text-navy-800">{a.studentName}</td>
                                <td className="px-6 py-3 text-navy-500">{a.classArm || "—"}</td>
                                <td className="px-6 py-3 text-navy-500">
                                  {a.lastSession} · {a.lastTerm}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-3 text-xs text-navy-400">
                          The term shown is the last one each student appears in across the archives.
                        </p>
                        </div>
                      </div>
                    )
                  ) : archTerms.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
                      <History className="mx-auto h-8 w-8 text-navy-300" />
                      <p className="mt-3 text-sm font-medium text-navy-600">No archived terms yet</p>
                      <p className="mt-1 text-xs text-navy-400">
                        The term rollover on the Overview archives each old term here automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {archTerms.map((t) => {
                        const selected = archTerm && archTerm.session === t.session && archTerm.term === t.term;
                        return (
                          <div
                            key={`${t.session}|${t.term}`}
                            className={`rounded-xl border p-4 transition ${
                              selected
                                ? "border-brand-400 bg-brand-50/40"
                                : "border-navy-200/70 bg-white hover:border-brand-300"
                            }`}
                          >
                            <button
                              onClick={() => selectArchTerm(t)}
                              className="flex w-full items-center justify-between gap-3 text-left"
                            >
                              <div>
                                <p className="text-sm font-bold text-navy-800">
                                  {t.session} · {t.term}
                                </p>
                                <p className="mt-0.5 text-xs text-navy-400">
                                  {t.students || 0} students · {t.scoreCount} score records · {t.attendanceCount} attendance registers
                                </p>
                              </div>
                              <ChevronRight
                                className={`h-4 w-4 text-navy-300 transition ${selected ? "rotate-90" : ""}`}
                              />
                            </button>

                            {selected && (
                              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {t.arms.map((arm) => (
                                  <button
                                    key={arm.classArm}
                                    onClick={() => selectArchArm(t, arm.classArm)}
                                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                                      archArm === arm.classArm
                                        ? "border-brand-600 bg-brand-600 text-white"
                                        : "border-navy-200 bg-navy-50/40 hover:border-brand-400"
                                    }`}
                                  >
                                    <p className="font-bold">{arm.classArm}</p>
                                    <p
                                      className={`mt-1 text-xs ${
                                        archArm === arm.classArm ? "text-white/80" : "text-navy-400"
                                      }`}
                                    >
                                      {arm.students || 0} students · {arm.scoreCount} scores · {arm.attendanceCount} registers
                                    </p>
                                  </button>
                                ))}
                                {t.arms.length === 0 && (
                                  <p className="col-span-full text-xs text-navy-400">
                                    No class arms in this archived term.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Per-arm detail */}
              {archMode === "terms" && archDetail && (
                <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-6 py-4">
                    <div>
                      <h3 className="text-lg font-bold text-navy-800">
                        {archDetail.classArm} · {archDetail.term}
                      </h3>
                      <p className="text-sm text-navy-400">
                        {archDetail.students.length} students in the archived {archDetail.session} cohort
                      </p>
                    </div>
                    <button
                      onClick={() => setArchDetail(null)}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-navy-500 transition hover:bg-navy-50"
                    >
                      Close arm
                    </button>
                  </div>
                  {archLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-navy-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading archived scores…
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
                            <th className="px-6 py-3">Student</th>
                            <th className="px-6 py-3">Subjects</th>
                            <th className="px-6 py-3">Average</th>
                            <th className="px-6 py-3">Position</th>
                            <th className="px-6 py-3">Attendance</th>
                            <th className="px-6 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {archDetail.students.map((st) => (
                            <tr key={st.studentId} className="border-t border-navy-100 hover:bg-navy-50/40">
                              <td className="px-6 py-3 font-semibold text-navy-800">{st.studentName}</td>
                              <td className="px-6 py-3 text-navy-500">{st.summary.subjects}</td>
                              <td className="px-6 py-3 font-bold text-navy-800">{st.summary.average}%</td>
                              <td className="px-6 py-3 text-navy-500">
                                {st.summary.position ? `${ordinal(st.summary.position)} of ${st.summary.outOf}` : "—"}
                              </td>
                              <td className="px-6 py-3 text-navy-500">
                                {st.attendance.present} of {st.attendance.total} days
                              </td>
                              <td className="px-6 py-3 text-right">
                                <button
                                  onClick={() => openArchReport(st)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy-700"
                                >
                                  <FileText className="h-3.5 w-3.5" /> Report card
                                </button>
                              </td>
                            </tr>
                          ))}
                          {archDetail.students.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-6 py-10 text-center text-navy-400">
                                No scores or attendance were archived for this arm.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
  );
}
