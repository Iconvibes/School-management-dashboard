"use client";

import { useState } from "react";
import {
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  History,
  Loader2,
} from "lucide-react";
import { ordinal } from "@/lib/grading";
import { useAdminShell } from "./context/AdminContext";
import { useTabFetch } from "@/hooks/useTabFetch";
import { downloadBlob, toCSV, withBOM } from "@/lib/csv";

/**
 * Previous Terms & Alumni tab — fully self-contained.
 * Manages its own archive viewing, arm drill-down, and alumni export.
 */
export default function ArchivesTab({ openReportPayload }) {
  const { session, showToast } = useAdminShell();

  const [archMode, setArchMode] = useState("terms");
  const [archTerms, setArchTerms] = useState([]);
  const [archTerm, setArchTerm] = useState(null);
  const [archArm, setArchArm] = useState(null);
  const [archDetail, setArchDetail] = useState(null);
  const [archLoading, setArchLoading] = useState(false);
  const [archAlumni, setArchAlumni] = useState([]);
  const [archAlumniLoading, setArchAlumniLoading] = useState(false);
  const [archAlumniLoaded, setArchAlumniLoaded] = useState(false);

  const { data: archivesResult } = useTabFetch("/api/school/archives", {
    enabled: true,
    transform: (d) => d.terms || [],
  });
  if (archivesResult && archivesResult !== archTerms) {
    setArchTerms(archivesResult);
    if (!archivesResult.length) {
      setArchTerm(null);
      setArchArm(null);
      setArchDetail(null);
    }
    setArchMode("terms");
    setArchAlumniLoaded(false);
    setArchAlumni([]);
  }

  function selectArchTerm(t) {
    setArchTerm((prev) =>
      prev && prev.session === t.session && prev.term === t.term
        ? null
        : { session: t.session, term: t.term }
    );
    setArchArm(null);
    setArchDetail(null);
  }

  async function selectArchArm(t, arm) {
    if (archArm === arm && archDetail) return;
    setArchArm(arm);
    setArchDetail(null);
    setArchLoading(true);
    try {
      const params = new URLSearchParams({ session: t.session, term: t.term, classArm: arm });
      const res = await fetch(`/api/school/archives?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the archived term");
      setArchDetail(data);
    } catch (err) {
      showToast(err.message);
      setArchDetail(null);
    } finally {
      setArchLoading(false);
    }
  }

  function openArchReport(st) {
    openReportPayload({
      school: archDetail.school,
      student: { name: st.studentName, assignedClass: st.classArm },
      scores: st.scores,
      summary: st.summary,
      attendance: st.attendance,
    });
  }

  async function loadAlumni() {
    setArchMode("alumni");
    if (archAlumniLoaded) return;
    setArchAlumniLoading(true);
    try {
      const res = await fetch("/api/school/archives?alumni=1");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load alumni");
      setArchAlumni(data.alumni || []);
      setArchAlumniLoaded(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setArchAlumniLoading(false);
    }
  }

  async function exportAlumniCsv(e) {
    if (!archAlumni.length) return;
    e.preventDefault();
    try {
      const res = await fetch("/api/school/archives?alumni=1&format=csv");
      if (res.status === 401) {
        showToast("Your session has expired — sign in again to export.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Could not export the CSV");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : "alumni.csv";
      downloadBlob(filename, blob);
      showToast(`Exported ${archAlumni.length} alumni to CSV`);
    } catch (err) {
      showToast(err.message || "Could not export the CSV");
    }
  }

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

        {archMode === "terms" ? (
          <div className="p-6">
            {archTerms.length === 0 ? (
              <p className="py-8 text-center text-sm text-navy-400">No archived terms yet.</p>
            ) : (
              <div className="space-y-3">
                {archTerms.map((t) => {
                  const isOpen = archTerm?.session === t.session && archTerm?.term === t.term;
                  return (
                    <div key={`${t.session}|${t.term}`} className="rounded-xl border border-navy-100 transition hover:border-brand-200">
                      <button
                        onClick={() => selectArchTerm(t)}
                        className="flex w-full items-center justify-between px-5 py-4 text-left"
                      >
                        <div>
                          <p className="text-sm font-bold text-navy-800">
                            {t.session} · {ordinal(t.term)} Term
                          </p>
                          <p className="text-xs text-navy-400">
                            {t.classCount || 0} class{(t.classCount || 0) === 1 ? "" : "es"} ·{" "}
                            {t.armCount || 0} arm{(t.armCount || 0) === 1 ? "" : "s"}
                          </p>
                        </div>
                        <ChevronRight className={`h-5 w-5 text-navy-300 transition ${isOpen ? "rotate-90" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="border-t border-navy-100 px-5 py-3">
                          {archLoading ? (
                            <div className="flex items-center gap-2 py-4 text-sm text-navy-400">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                            </div>
                          ) : archDetail ? (
                            <div className="space-y-3">
                              {/* Arm selector */}
                              <div className="flex flex-wrap gap-2">
                                {archDetail.arms?.map((arm) => (
                                  <button
                                    key={arm}
                                    onClick={() => selectArchArm(t, arm)}
                                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                                      archArm === arm
                                        ? "bg-brand-600 text-white"
                                        : "bg-navy-100 text-navy-600 hover:bg-navy-200"
                                    }`}
                                  >
                                    {arm}
                                  </button>
                                ))}
                              </div>
                              {/* Student detail */}
                              {archArm && archDetail.students && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-sm">
                                    <thead>
                                      <tr className="border-b border-navy-100 text-xs font-semibold uppercase tracking-wider text-navy-400">
                                        <th className="px-4 py-2">Student</th>
                                        <th className="px-4 py-2">Average</th>
                                        <th className="px-4 py-2">Grade</th>
                                        <th className="px-4 py-2 text-right">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {archDetail.students.map((st) => (
                                        <tr key={st.studentName} className="border-b border-navy-50">
                                          <td className="px-4 py-2.5 font-medium text-navy-800">{st.studentName}</td>
                                          <td className="px-4 py-2.5">{st.summary?.average != null ? `${st.summary.average}%` : "—"}</td>
                                          <td className="px-4 py-2.5 font-bold">{st.summary?.overallGrade || "—"}</td>
                                          <td className="px-4 py-2.5 text-right">
                                            <button
                                              onClick={() => openArchReport(st)}
                                              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500"
                                            >
                                              <FileText className="h-3 w-3" /> View report
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="py-4 text-center text-sm text-navy-400">
                              Select a class arm above to view its archived students.
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
        ) : (
          <div className="p-6">
            {archAlumniLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-navy-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading alumni…
              </div>
            ) : archAlumni.length === 0 ? (
              <div className="py-10 text-center">
                <GraduationCap className="mx-auto h-8 w-8 text-navy-300" />
                <p className="mt-3 text-sm text-navy-400">No alumni found.</p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold text-navy-700">{archAlumni.length} alumni</p>
                  <button onClick={exportAlumniCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 hover:border-brand-400 hover:text-brand-600">
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Class</th>
                        <th className="px-4 py-2">Last term</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archAlumni.map((a) => (
                        <tr key={`${a.name}-${a.lastSession}`} className="border-b border-navy-50">
                          <td className="px-4 py-2.5 font-medium text-navy-800">{a.name}</td>
                          <td className="px-4 py-2.5">{a.classArm || "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-navy-500">{a.lastSession} · {a.lastTerm}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
