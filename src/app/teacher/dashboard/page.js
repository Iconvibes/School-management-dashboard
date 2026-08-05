"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  Loader2,
  ClipboardList,
  Check,
  Save,
  Search,
  ShieldCheck,
  RotateCcw,
  ChevronDown,
  FileText,
  Trophy,
  CalendarCheck,
  UserCheck,
  UserX,
  Plus,
  UserPlus,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import TopStudents from "@/components/TopStudents";
import ReportCardModal from "@/components/ReportCardModal";
import Modal from "@/components/Modal";
import { computeGrade, gradeBadgeClasses, getSubjects, MAX_CA, MAX_EXAM } from "@/lib/grading";

export default function TeacherDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState("matrix"); // "matrix" | "attendance" | "reports"
  // Attendance state
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attRows, setAttRows] = useState([]);
  const [attLoaded, setAttLoaded] = useState(false);
  const [attSaving, setAttSaving] = useState(false);
  const [classArm, setClassArm] = useState("");
  const [subject, setSubject] = useState("");
  const [reportStudents, setReportStudents] = useState([]);
  const [reportSearch, setReportSearch] = useState("");
  const [reportPayload, setReportPayload] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [rows, setRows] = useState({}); // studentId -> { ca, exam }
  const [savedMap, setSavedMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  // Add student modal
  const [addModal, setAddModal] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", assignedClass: "" });

  const subjects = useMemo(() => getSubjects(), []);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meData.user || meData.user.role !== "TEACHER") {
        router.replace("/login");
        return;
      }
      setSession(meData);
      const preferred = meData.user.assignedClass || meData.school?.activeArms?.[0] || "";
      setClassArm(preferred);
      setSubject(subjects[0] || "");
      setLoading(false);
    })();
  }, [router, subjects]);

  // Load students when class arm changes
  useEffect(() => {
    if (!classArm) return;
    fetch(`/api/users?role=STUDENT&classArm=${encodeURIComponent(classArm)}`)
      .then((r) => r.json())
      .then((data) => {
        setStudents(data.users || []);
        setRows((prev) => {
          const next = { ...prev };
          data.users.forEach((u) => {
            if (next[u.id] === undefined) next[u.id] = { ca: "", exam: "" };
          });
          return next;
        });
      });
  }, [classArm]);

  // Respond to sidebar hash links: /teacher/dashboard#reports / #attendance
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "reports") setView("reports");
      if (hash === "attendance") setView("attendance");
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  // Load attendance register for the selected class arm + date.
  // Aborts the previous request so a stale register can never overwrite
  // a newer one when switching class arm / date quickly.
  useEffect(() => {
    if (view !== "attendance" || !classArm) return;
    const controller = new AbortController();
    fetch(`/api/attendance?classArm=${encodeURIComponent(classArm)}&date=${attDate}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        setAttRows(data.rows || []);
        setAttLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAttLoaded(true);
      });
    return () => controller.abort();
  }, [view, classArm, attDate]);

  // Load ranked students (for the Report Cards view) when class arm changes
  useEffect(() => {
    if (!classArm) return;
    fetch(`/api/reports?classArm=${encodeURIComponent(classArm)}&limit=200`)
      .then((r) => r.json())
      .then((data) => setReportStudents(data.students || []))
      .catch(() => {});
  }, [classArm]);

  // Load saved scores when subject + class arm change
  useEffect(() => {
    if (!classArm || !subject) return;
    fetch(`/api/scores?classArm=${encodeURIComponent(classArm)}&subject=${encodeURIComponent(subject)}`)
      .then((r) => r.json())
      .then((data) => {
        const map = {};
        const saved = {};
        (data.scores || []).forEach((s) => {
          map[s.studentId] = { ca: s.caScore, exam: s.examScore };
          // Store the saved values so dirty-comparison works (not just a boolean)
          saved[s.studentId] = { ca: s.caScore, exam: s.examScore };
        });
        setSavedMap(saved);
        setRows((prev) => {
          const next = { ...prev };
          Object.keys(map).forEach((id) => (next[id] = map[id]));
          return next;
        });
      });
  }, [classArm, subject]);

  function setScore(studentId, field, value) {
    setRows((prev) => {
      const next = { ...prev, [studentId]: { ...(prev[studentId] || {}), [field]: value } };
      return next;
    });
  }

  function computeRow(row) {
    const ca = Math.min(MAX_CA, Math.max(0, Number(row?.ca) || 0));
    const exam = Math.min(MAX_EXAM, Math.max(0, Number(row?.exam) || 0));
    const total = ca + exam;
    return { ca, exam, total, grade: computeGrade(total) };
  }

  const totalEntered = Object.keys(rows).filter((id) => rows[id]?.ca !== "" && rows[id]?.exam !== "").length;

  const filteredStudents = students.filter((s) =>
    (s.name + s.email).toLowerCase().includes(search.toLowerCase())
  );

  const filteredReports = reportStudents.filter((s) =>
    (s.name + s.email + (s.assignedClass || "")).toLowerCase().includes(reportSearch.toLowerCase())
  );

  async function openReport(studentId) {
    setReportLoading(true);
    setReportPayload(null);
    try {
      const res = await fetch(`/api/reports/${studentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load report");
      setReportPayload(data);
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setReportLoading(false);
    }
  }

  async function saveAll() {
    setSaving(true);
    try {
      const payload = Object.keys(rows)
        .filter((id) => rows[id]?.ca !== "" || rows[id]?.exam !== "")
        .map((id) => ({ studentId: id, caScore: rows[id].ca, examScore: rows[id].exam }));

      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classArm, subject, rows: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save scores");

      setSavedMap(
        Object.fromEntries(
          payload.map((p) => [
            p.studentId,
            { ca: Number(p.caScore), exam: Number(p.examScore) },
          ])
        )
      );
      setToast(`Saved ${payload.length} score${payload.length === 1 ? "" : "s"} for ${subject} · ${classArm}`);
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function addStudent() {
    setAddSaving(true);
    try {
      const payload = {
        name: addForm.name,
        email: addForm.email,
        password: addForm.password,
        role: "STUDENT",
        // The API locks assigned teachers to their own class arm anyway;
        // unassigned teachers pick one from the modal.
        assignedClass: session.user.assignedClass || addForm.assignedClass,
      };
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add student");

      setAddModal(false);
      setAddForm({ name: "", email: "", password: "", assignedClass: "" });
      // Refetch the roster so the new student appears immediately.
      fetch(`/api/users?role=STUDENT&classArm=${encodeURIComponent(classArm)}`)
        .then((r) => r.json())
        .then((d) => setStudents(d.users || []));
      setToast(`${data.user.name} added to ${payload.assignedClass || classArm} successfully`);
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setAddSaving(false);
    }
  }

  async function saveAttendance() {
    setAttSaving(true);
    try {
      const payload = attRows
        .filter((r) => r.present !== null)
        .map((r) => ({ studentId: r.studentId, present: r.present }));
      if (payload.length === 0) throw new Error("Mark at least one student first");
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classArm, date: attDate, rows: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save attendance");
      const present = payload.filter((p) => p.present).length;
      setToast(`Saved attendance · ${present} present, ${payload.length - present} absent (${attDate})`);
      setTimeout(() => setToast(""), 3500);
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(""), 3500);
    } finally {
      setAttSaving(false);
    }
  }

  function setAttStatus(studentId, present) {
    setAttRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, present } : r))
    );
  }

  const attPresent = attRows.filter((r) => r.present === true).length;
  const attAbsent = attRows.filter((r) => r.present === false).length;
  const attMarked = attPresent + attAbsent;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-navy-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar role="TEACHER" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-navy-200/70 bg-white/80 px-5 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-navy-600 hover:bg-navy-50 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-sm font-bold text-navy-800">
                {view === "matrix" ? "Grading Matrix" : "Report Cards"}
              </p>
              <p className="text-xs text-navy-400">
                {session.school?.currentSession} · {session.school?.currentTerm}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/20 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Teacher
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              {session.user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-8">
          {/* View toggle */}
          <div className="mb-6 inline-flex gap-1 rounded-xl bg-navy-100 p-1">
            <button
              onClick={() => {
                setView("matrix");
                history.replaceState(null, "", "/teacher/dashboard");
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                view === "matrix" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
              }`}
            >
              <ClipboardList className="h-4 w-4" /> Grading Matrix
            </button>
            <button
              onClick={() => {
                setView("attendance");
                history.replaceState(null, "", "/teacher/dashboard#attendance");
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                view === "attendance" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
              }`}
            >
              <CalendarCheck className="h-4 w-4" /> Attendance
            </button>
            <button
              onClick={() => {
                setView("reports");
                history.replaceState(null, "", "/teacher/dashboard#reports");
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                view === "reports" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
              }`}
            >
              <FileText className="h-4 w-4" /> Report Cards
            </button>
          </div>

          {/* ATTENDANCE VIEW */}
          {view === "attendance" && (
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
                        {(session.school?.activeArms || []).map((arm) => (
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
          )}

          {/* REPORT CARDS VIEW */}
          {view === "reports" && (
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
          )}

          {/* GRADING MATRIX VIEW */}
          {view === "matrix" && (
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
                  {(session.school?.activeArms || []).map((arm) => (
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
                  {subjects.map((s) => (
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
          )}
        </div>
      </div>

      {/* Report card preview modal */}
      <ReportCardModal
        open={reportPayload !== null}
        onClose={() => setReportPayload(null)}
        school={reportPayload?.school}
        student={reportPayload?.student}
        scores={reportPayload?.scores || []}
        summary={reportPayload?.summary}
        attendance={reportPayload?.attendance}
        fileName={reportPayload?.student?.name?.toLowerCase().replace(/[^a-z]+/g, "-")}
      />

      {/* Add student modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="Add student"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Full name</span>
            <input
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="Full name"
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Email</span>
            <input
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              placeholder="email@school.edu"
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Temporary password</span>
            <input
              type="text"
              value={addForm.password}
              onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              placeholder="At least 6 characters"
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          {session.user.assignedClass ? (
            <div className="flex items-start gap-2 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-sm text-navy-600">
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p>
                This student will be added to <strong>{session.user.assignedClass}</strong>.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">Class arm</span>
              <select
                value={addForm.assignedClass}
                onChange={(e) => setAddForm({ ...addForm, assignedClass: e.target.value })}
                className="w-full appearance-none rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">Choose a class arm</option>
                {(session.school?.activeArms || []).map((arm) => (
                  <option key={arm}>{arm}</option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={addStudent}
            disabled={addSaving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
          >
            {addSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
            Add student
          </button>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}
