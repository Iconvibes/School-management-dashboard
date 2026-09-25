"use client";

import { FileText, Loader2, Search, Trophy } from "lucide-react";
import { gradeBadgeClasses } from "@/lib/grading";
import TopStudents from "@/components/TopStudents";

export default function ReportsView({
  reportStudents, filteredReports, reportSearch, setReportSearch,
  reportLoading, openReport, classArm,
}) {
  return (
            <div className="animate-fade-up">
              <div className="grid gap-5 lg:grid-cols-3">
                <TopStudents
                  students={reportStudents}
                  onView={(id) => openReport(id)}
                  title={`Best students · ${classArm}`}
                />

                <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-navy-800">Generate report cards</h2>
                      <p className="text-sm text-navy-400">
                        Search students in {classArm} and open their A4 PDF report card.
                      </p>
                    </div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                      <input
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        placeholder="Search by name or email…"
                        className="w-56 rounded-xl border border-navy-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {filteredReports.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/50 px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50/60"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                          {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-navy-800">{s.name}</p>
                          <p className="truncate text-xs text-navy-400">{s.email}</p>
                        </div>
                        <div className="hidden text-right sm:block">
                          <p className="text-sm font-bold text-navy-800">{s.average}%</p>
                          <p className="text-xs text-navy-400">{s.subjects} subjects</p>
                        </div>
                        {s.grade && (
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold ring-1 ${gradeBadgeClasses(s.grade)}`}>
                            {s.grade}
                          </span>
                        )}
                        <button
                          onClick={() => openReport(s.id)}
                          disabled={reportLoading}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
                        >
                          {reportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                          View Report
                        </button>
                      </div>
                    ))}
                    {filteredReports.length === 0 && (
                      <p className="py-10 text-center text-sm text-navy-400">
                        No students found{reportStudents.length === 0 ? ` in ${classArm} yet.` : " matching your search."}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
                <Trophy className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>Auto-ranked.</strong> Students are sorted by overall average — the top performers
                  appear first, so you can spot your best students at a glance. Click any student to preview
                  or download their report card as a branded A4 PDF.
                </p>
              </div>
            </div>
  );
}
