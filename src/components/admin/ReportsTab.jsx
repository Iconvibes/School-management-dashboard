"use client";

import { useState, useMemo } from "react";
import { FileText, Loader2, Search, Trophy } from "lucide-react";
import { gradeBadgeClasses } from "@/lib/grading";
import TopStudents from "@/components/TopStudents";
import { useAdminShell } from "./context/AdminContext";
import { useTabFetch } from "@/hooks/useTabFetch";

/**
 * Report Cards tab — fully self-contained.
 * Manages its own fetch, search, class filter, and report modal.
 */
export default function ReportsTab({ openReportModal }) {
  const { session, showToast } = useAdminShell();
  const [search, setSearch] = useState("");
  const [reportClass, setReportClass] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  const activeArms = session.school?.activeArms || [];

  const reportsUrl = "/api/reports?limit=200" + (reportClass ? "&classArm=" + encodeURIComponent(reportClass) : "");

  const { data: reportStudents, loading } = useTabFetch(reportsUrl, {
    enabled: true,
    deps: [reportClass],
    transform: (d) => d.students || [],
  });

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = reportStudents || [];
    if (!q) return list;
    return list.filter(
      (s) =>
        (s.name + s.email + (s.assignedClass || "")).toLowerCase().includes(q)
    );
  }, [reportStudents, search]);

  async function openReport(studentId) {
    setReportLoading(true);
    try {
      const res = await fetch(`/api/reports/${studentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load report");
      openReportModal(data);
    } catch (err) {
      showToast(err.message);
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <div className="mt-5 animate-fade-up">
      {/* Class filter + search row */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 py-2">
          <FileText className="h-4 w-4 text-brand-600" />
          <select
            value={reportClass}
            onChange={(e) => setReportClass(e.target.value)}
            className="bg-transparent text-sm font-medium text-navy-700 outline-none"
          >
            <option value="">All class arms</option>
            {activeArms.map((arm) => (
              <option key={arm}>{arm}</option>
            ))}
          </select>
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search any student by name, email or class…"
            className="w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <TopStudents
          students={reportStudents || []}
          onView={(id) => openReport(id)}
          title={"Best students" + (reportClass ? ` · ${reportClass}` : " · whole school")}
        />

        <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-navy-100 px-6 py-4">
            <h2 className="text-lg font-bold text-navy-800">All student report cards</h2>
            <p className="text-sm text-navy-400">
              Read any student&apos;s report card and export it as a branded A4 PDF.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Class</th>
                  <th className="px-6 py-3">Subjects</th>
                  <th className="px-6 py-3">Average</th>
                  <th className="px-6 py-3">Grade</th>
                  <th className="px-6 py-3">Standing</th>
                  <th className="px-6 py-3 text-right">Report</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((s) => (
                  <tr key={s.id} className="border-b border-navy-50 transition hover:bg-brand-50/30">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                          {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-navy-800">{s.name}</p>
                          <p className="text-xs text-navy-400">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-600">
                        {s.assignedClass || "Unassigned"}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-navy-500">{s.subjects}</td>
                    <td className="px-6 py-3.5">
                      <span className="font-extrabold text-navy-800">{s.average}%</span>
                    </td>
                    <td className="px-6 py-3.5">
                      {s.grade ? (
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold ring-1 ${gradeBadgeClasses(s.grade)}`}>
                          {s.grade}
                        </span>
                      ) : (
                        <span className="text-navy-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-xs font-semibold text-navy-500">{s.standing}</td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={() => openReport(s.id)}
                        disabled={reportLoading}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
                      >
                        {reportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-navy-400">
                      No students found. Adjust your search or add students first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <Trophy className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Best students are auto-ranked</strong> by overall average every time this page loads.
          Use the search box to look up a student by name, email or class arm, then open or print their report card.
        </p>
      </div>
    </div>
  );
}
