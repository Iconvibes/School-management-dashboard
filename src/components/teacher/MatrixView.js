"use client";

import { Check, ChevronDown, ClipboardList, Loader2, Plus, RotateCcw, Save, Search } from "lucide-react";
import { gradeBadgeClasses, MAX_CA, MAX_EXAM } from "@/lib/grading";

export default function MatrixView({
  classArm, setClassArm, teacherArms, subject, setSubject, teacherSubjects,
  students, filteredRows: filteredStudents, search, setSearch,
  rows, savedMap, saving, totalEntered, computeRow, setScore, saveAll,
  setAddModal,
}) {
  return (
          <>
          {/* Selectors */}
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
                <ClipboardList className="h-4 w-4 text-brand-600" /> Subject
              </span>
              <div className="relative">
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-navy-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  {teacherSubjects.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
              </div>
            </label>
          </div>

          {/* Matrix header */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy-800">
                {students.length} students in {classArm}
              </h2>
              <p className="text-sm text-navy-400">
                CA is out of {MAX_CA}, Exam out of {MAX_EXAM}. Totals and grades compute live.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search students…"
                  className="w-44 rounded-xl border border-navy-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <button
                onClick={() => setAddModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
              >
                <Plus className="h-4 w-4" /> Add student
              </button>
              <button
                onClick={saveAll}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save scores ({totalEntered})
              </button>
            </div>
          </div>

          {/* Grading grid */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                    <th className="px-5 py-3.5">Student</th>
                    <th className="px-5 py-3.5 text-center">CA (0–{MAX_CA})</th>
                    <th className="px-5 py-3.5 text-center">Exam (0–{MAX_EXAM})</th>
                    <th className="px-5 py-3.5 text-center">Total</th>
                    <th className="px-5 py-3.5 text-center">Grade</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => {
                    const row = rows[student.id] || { ca: "", exam: "" };
                    const { ca, exam, total, grade } = computeRow(row);
                    const isSaved = savedMap[student.id] && rows[student.id]?.ca !== "";
                    const isDirty =
                      (row.ca !== "" || row.exam !== "") &&
                      (!savedMap[student.id] ||
                        Number(row.ca) !== Number(savedMap[student.id]?.ca) ||
                        Number(row.exam) !== Number(savedMap[student.id]?.exam));
                    return (
                      <tr
                        key={student.id}
                        className={`border-b border-navy-50 transition hover:bg-brand-50/30 ${
                          isDirty ? "bg-amber-50/40" : ""
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                              {student.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-navy-800">{student.name}</p>
                              <p className="text-xs text-navy-400">{student.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={MAX_CA}
                            value={row.ca}
                            onChange={(e) => setScore(student.id, "ca", e.target.value)}
                            onBlur={(e) => setScore(student.id, "ca", Math.min(MAX_CA, Math.max(0, Number(e.target.value) || 0)))}
                            placeholder="—"
                            className="w-20 rounded-lg border border-navy-200 bg-white px-2 py-2 text-center text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                          />
                        </td>
                        <td className="px-5 py-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={MAX_EXAM}
                            value={row.exam}
                            onChange={(e) => setScore(student.id, "exam", e.target.value)}
                            onBlur={(e) => setScore(student.id, "exam", Math.min(MAX_EXAM, Math.max(0, Number(e.target.value) || 0)))}
                            placeholder="—"
                            className="w-20 rounded-lg border border-navy-200 bg-white px-2 py-2 text-center text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                          />
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span
                            className={`text-lg font-bold ${
                              total >= 70
                                ? "text-emerald-600"
                                : total >= 50
                                ? "text-brand-600"
                                : total >= 40
                                ? "text-amber-600"
                                : total > 0
                                ? "text-rose-600"
                                : "text-navy-300"
                            }`}
                          >
                            {row.ca !== "" || row.exam !== "" ? total : "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          {row.ca !== "" || row.exam !== "" ? (
                            <span
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold ring-1 ${gradeBadgeClasses(grade)}`}
                            >
                              {grade}
                            </span>
                          ) : (
                            <span className="text-navy-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {isDirty ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-600/20">
                              <RotateCcw className="h-3 w-3" /> Unsaved
                            </span>
                          ) : isSaved ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                              <Check className="h-3 w-3" /> Saved
                            </span>
                          ) : (
                            <span className="text-navy-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-navy-400">
                        No students in {classArm} yet. Click “Add student” to enroll one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-navy-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> A (70–100)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> B (60–69)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> C (50–59)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> D (40–49)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> F (below 40)
            </span>
          </div>
          </>
  );
}
