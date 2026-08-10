"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  CalendarDays,
  BellRing,
  AlarmClock,
  X,
  Printer,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import TopStudents from "@/components/TopStudents";
import ReportCardModal from "@/components/ReportCardModal";
import PrintableTimetable from "@/components/PrintableTimetable";
import Modal from "@/components/Modal";
import { computeGrade, gradeBadgeClasses, getSubjects, MAX_CA, MAX_EXAM } from "@/lib/grading";
import { DAYS, getDayTimeline, MAX_PERIOD, PERIODS, schoolDayOf } from "@/lib/timetable";
import { bounceTeacherSelection } from "@/lib/teacher-scope";
import { bounceToLogin } from "@/lib/auth-client";
import { useClassAlerts } from "@/hooks/useClassAlerts";

export default function TeacherDashboard() {
  const router = useRouter();
  // Live class-alert scheduler — rings (banner + notification + chime) when a
  // period this teacher teaches is about to start, on ANY view of the portal.
  // scopeVersion re-mounts the scheduler's data load when a live scope refresh
  // actually bounced the selection, so a revoked arm stops ringing at once.
  const [scopeVersion, setScopeVersion] = useState(0);
  const classAlerts = useClassAlerts(scopeVersion);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState("matrix"); // "matrix" | "attendance" | "timetable" | "reports"
  // My Timetable state — the SUPER_ADMIN-set weekly schedule, filtered to the
  // slots THIS teacher teaches (their own subject × arm entries).
  const [ttEntries, setTtEntries] = useState([]);
  const [ttLoaded, setTtLoaded] = useState(false);
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
  const [printTtOpen, setPrintTtOpen] = useState(false);
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

  // Subject-specialist teaching model: a teacher teaches SUBJECTS across
  // MULTIPLE arms (one Mathematics teacher covers all twelve classes). The
  // arm and subject selectors below only offer what THIS teacher is assigned
  // — the API enforces the same scope, so a teacher can never even try an
  // arm or subject they don't teach.
  const teacherArms = useMemo(() => {
    const mine = session?.user?.assignedClasses?.length
      ? session.user.assignedClasses
      : session?.user?.assignedClass
        ? [session.user.assignedClass]
        : [];
    // Unassigned teachers fall back to the school's arms (legacy behavior).
    return mine.length ? mine : session?.school?.activeArms || [];
  }, [session]);
  const teacherSubjects = useMemo(() => {
    const mine = session?.user?.subjects?.length ? session.user.subjects : [];
    // Legacy teachers without subject assignments keep the full subject list.
    return mine.length ? mine : subjects;
  }, [session, subjects]);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meData.user || meData.user.role !== "TEACHER") {
        bounceToLogin(router);
        return;
      }
      setSession(meData);
      const preferred =
        meData.user.assignedClasses?.[0] || meData.user.assignedClass || meData.school?.activeArms?.[0] || "";
      setClassArm(preferred);
      setSubject(meData.user.subjects?.[0] || subjects[0] || "");
      setLoading(false);
    })();
  }, [router, subjects]);

  // ---- Live scope enforcement ----------------------------------------------
  // The API revalidates the teacher's subject-specialist scope on EVERY
  // request, so an admin's assignedClasses/subjects edit takes effect server-
  // side immediately. The selectors, however, hold the selection from the last
  // /api/auth/me — if the admin revoked the currently selected arm or subject,
  // the dashboard must bounce onto a valid one instead of keeping a stale
  // (now 403-ing) value. Re-read /me on a cadence + on tab focus, and bounce.
  // The in-flight guard dedupes concurrent triggers (a revoked arm 403s the
  // students AND reports fetches in the same tick — one /me read is enough).
  const refreshBusy = useRef(false);
  const refreshScope = useCallback(async () => {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    try {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meData.user || meData.user.role !== "TEACHER") {
        bounceToLogin(router);
        return;
      }
      const next = bounceTeacherSelection({
        currentArm: classArm,
        currentSubject: subject,
        assignedClasses: meData.user.assignedClasses || [],
        assignedClass: meData.user.assignedClass || "",
        subjects: meData.user.subjects || [],
        schoolArms: meData.school?.activeArms || [],
        allSubjects: subjects,
      });
      const changed = [];
      if (next.classArm !== classArm) changed.push(next.classArm);
      if (next.subject !== subject) changed.push(next.subject);
      // Keep the session fresh so the selectors (and any legacy single-arm
      // fallback) render the teacher's CURRENT scope, not a stale snapshot.
      setSession(meData);
      if (next.classArm !== classArm) setClassArm(next.classArm);
      if (next.subject !== subject) setSubject(next.subject);
      if (changed.length > 0) {
        setScopeVersion((v) => v + 1); // reload the alert scheduler's data
        setToast(`Your assignment changed — now showing ${changed.join(" · ")}`);
        setTimeout(() => setToast(""), 4000);
      }
    } catch {
      // A failed /me must never break the portal — the next tick retries.
    } finally {
      refreshBusy.current = false;
    }
  }, [classArm, subject, router, subjects]);

  // Poll the scope on a cadence and whenever the tab regains focus (the
  // teacher likely steps away while the admin edits their assignment). Keyed
  // on refreshScope so the timer always calls the latest bounce logic; the
  // interval re-creating when the selection changes is harmless (the poll is
  // a fallback — the 403 handlers enforce immediately on interaction).
  useEffect(() => {
    const id = setInterval(refreshScope, 30000);
    const onVisible = () => {
      if (!document.hidden) refreshScope();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshScope]);

  // Stable access to the latest refreshScope for the 403 handlers inside the
  // scoped data fetches below — the API 403s a revoked arm/subject on the very
  // next request, so those fetches bounce the selection IMMEDIATELY instead of
  // waiting for the next scope poll (and without re-running the fetch effects
  // every time the selection changes).
  const refreshScopeRef = useRef(refreshScope);
  useEffect(() => {
    refreshScopeRef.current = refreshScope;
  }, [refreshScope]);

  // Scoped data fetches (students, scores, attendance, reports) 403 the moment
  // the selected arm/subject is revoked — that IS the enforcement signal, so
  // bounce the selection right away rather than letting the UI sit on a dead
  // value until the next poll tick. Network failures resolve to an empty body
  // (never an unhandled rejection); the next poll tick retries the scope.
  const scopedFetch = useCallback((url) =>
    fetch(url)
      .then((r) => {
        if (r.status === 403) refreshScopeRef.current();
        return r.json();
      })
      .catch(() => ({})), []);

  // Load students when class arm changes
  useEffect(() => {
    if (!classArm) return;
    scopedFetch(`/api/users?role=STUDENT&classArm=${encodeURIComponent(classArm)}`)
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
  }, [classArm, scopedFetch]);

  // Respond to sidebar hash links: /teacher/dashboard#reports / #attendance
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "reports" || hash === "attendance" || hash === "timetable") {
        setView(hash);
        window.scrollTo({ top: 0 });
      }
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
      .then((r) => {
        if (r.status === 403) refreshScopeRef.current();
        return r.json();
      })
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
    scopedFetch(`/api/reports?classArm=${encodeURIComponent(classArm)}&limit=200`)
      .then((data) => setReportStudents(data.students || []));
  }, [classArm, scopedFetch]);

  // Load my timetable (all my assigned arms) when the view opens. The loaded
  // flag only flips to true once the fetch settles — no sync setState here.
  useEffect(() => {
    if (view !== "timetable") return;
    // mine=1: only THIS teacher's slots — no need to download (and filter)
    // every class in their arms.
    fetch("/api/timetable?mine=1")
      .then((r) => r.json())
      .then((data) => {
        setTtEntries(data.entries || []);
        setTtLoaded(true);
      })
      .catch(() => setTtLoaded(true));
  }, [view]);

  // Load saved scores when subject + class arm change
  useEffect(() => {
    if (!classArm || !subject) return;
    scopedFetch(`/api/scores?classArm=${encodeURIComponent(classArm)}&subject=${encodeURIComponent(subject)}`)
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
  }, [classArm, subject, scopedFetch]);

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
        // The API forces the arm into the teacher's assigned set (the
        // currently selected arm is always one of theirs); arm-less teachers
        // pick one from the modal.
        assignedClass: classArm || addForm.assignedClass,
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

  // My Timetable — only the slots where THIS teacher is the assigned teacher
  // (their subject × arm entries), keyed by day|period for the weekly grid.
  // The realistic school day: periods 1-4, the mid-day break, then 5-8.
  const dayTimeline = useMemo(() => getDayTimeline(session?.school), [session?.school]);
  // Per-weekday timelines: each day column resolves its OWN bell schedule, so
  // a short day (Friday ends at period 6) shows only its own periods.
  const dayTimelines = useMemo(
    () => Object.fromEntries(DAYS.map((d) => [d, getDayTimeline(session?.school, d)])),
    [session?.school]
  );
  const dayPeriodSets = useMemo(
    () =>
      Object.fromEntries(
        DAYS.map((d) => [
          d,
          new Set(
            (dayTimelines[d] || [])
              .filter((b) => b.type === "teaching")
              .map((b) => Number(b.period))
          ),
        ])
      ),
    [dayTimelines]
  );

  const ttByDayPeriod = useMemo(() => {
    const m = {};
    ttEntries
      .filter((e) => e.teacherId === session?.user?.id)
      .forEach((e) => {
        m[`${e.day}|${e.period}`] = e;
      });
    return m;
  }, [ttEntries, session]);
  const myCount = Object.keys(ttByDayPeriod).length;
  const myArms = [
    ...new Set(
      ttEntries
        .filter((e) => e.teacherId === session?.user?.id)
        .map((e) => e.classArm)
    ),
  ];
  // Weekend (5=Sat, 6=Sun) must NEVER highlight a school day — schoolDayOf
  // returns null on weekends, so no column ever matches.
  const todayName = schoolDayOf(new Date());
  const isToday = (day) => todayName === day;

  // Class alerts — the scheduler hook drives the ringing; these handlers just
  // wire the controls to the prefs API (enabled / lead / sound).
  async function toggleClassAlerts() {
    const res = await classAlerts.updatePref({ enabled: !classAlerts.prefs.enabled });
    if (!res.ok && res.error) {
      setToast(res.error);
      setTimeout(() => setToast(""), 3000);
    }
  }

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

      <div className="min-w-0 flex-1 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-navy-200/70 bg-white/80 px-5 backdrop-blur-lg">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-navy-600 hover:bg-navy-50 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* The school's uploaded logo sits beside its name in every
                portal header — branding follows the tenant everywhere. */}
            {session.school?.logoUrl && (
              <img
                src={session.school.logoUrl}
                alt=""
                className="h-7 w-7 shrink-0 rounded-lg bg-white object-contain ring-1 ring-navy-100"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy-800">{session.school?.name}</p>
              <p className="truncate text-xs text-navy-400">
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
          {/* View toggle — scrolls horizontally on small screens so the four
              views never push the page wider than the viewport */}
          <div className="mb-6 -mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex w-max gap-1 rounded-xl bg-navy-100 p-1">
            <button
              onClick={() => {
                setView("matrix");
                history.replaceState(null, "", "/teacher/dashboard");
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
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
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
                view === "attendance" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
              }`}
            >
              <CalendarCheck className="h-4 w-4" /> Attendance
            </button>
            <button
              onClick={() => {
                setView("timetable");
                history.replaceState(null, "", "/teacher/dashboard#timetable");
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
                view === "timetable" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
              }`}
            >
              <CalendarDays className="h-4 w-4" /> My Timetable
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
          )}

          {/* MY TIMETABLE VIEW */}
          {view === "timetable" && (
            <div className="animate-fade-up">
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-navy-100 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-bold text-navy-800">My weekly timetable</h2>
                    <p className="text-sm text-navy-400">
                      Set by your school admin. Each cell is a class <strong>you</strong> teach — the
                      subject and the class arm are on every slot, so you always know where to be and when.
                    </p>
                  </div>
                  <button
                    onClick={() => setPrintTtOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print timetable
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-4 py-3">Period</th>
                        {DAYS.map((d) => {
                          const count = (dayTimelines[d] || []).filter((b) => b.type === "teaching").length;
                          return (
                            <th key={d} className={`px-4 py-3 text-center ${isToday(d) ? "text-brand-600" : ""}`}>
                              {d}
                              {count < MAX_PERIOD && (
                                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                  {count} periods
                                </span>
                              )}
                              {isToday(d) && (
                                <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  Today
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
                              // Friday ends at period 6) never rings or shows.
                              if (!(dayPeriodSets[d] || new Set()).has(Number(block.period))) {
                                return (
                                  <td key={d} className={`px-2 py-2 text-center ${isToday(d) ? "bg-brand-50/40" : ""}`}>
                                    <span className="text-[10px] font-medium text-navy-300">not scheduled</span>
                                  </td>
                                );
                              }
                              const mine = ttByDayPeriod[`${d}|${block.period}`];
                              return (
                                <td key={d} className={`px-2 py-2 text-center ${isToday(d) ? "bg-brand-50/40" : ""}`}>
                                  {mine ? (
                                    <div className="inline-flex flex-col items-center gap-0.5 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-1.5 shadow-sm">
                                      <span className="text-xs font-bold text-brand-800">{mine.subject}</span>
                                      <span className="text-[10px] font-medium text-brand-600">{mine.classArm}</span>
                                    </div>
                                  ) : (
                                    <span className="text-navy-200">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-navy-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Your teaching slots
                </span>
                <span className="text-navy-400">
                  {ttLoaded
                    ? `${myCount} period${myCount === 1 ? "" : "s"} this week across ${myArms.length} class arm${myArms.length === 1 ? "" : "s"}${myArms.length ? ` (${myArms.join(", ")})` : ""}`
                    : "Loading your schedule…"}
                </span>
              </div>

              {/* CLASS ALERTS & REMINDERS — ring when a class period starts */}
              <div className="mt-5 rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                      <BellRing className="h-5 w-5 text-brand-600" /> Class alerts &amp; reminders
                    </h2>
                    <p className="mt-0.5 text-sm text-navy-400">
                      Ring when a class you teach is about to start — an alarm banner here, a desktop notification,
                      and a chime if sound is on. Alerts fire on every view of this portal, not just the timetable.
                    </p>
                  </div>
                  <button
                    onClick={toggleClassAlerts}
                    className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                      classAlerts.prefs.enabled
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500"
                        : "bg-navy-100 text-navy-600 hover:bg-navy-200"
                    }`}
                  >
                    <BellRing className="h-4 w-4" />
                    {classAlerts.prefs.enabled ? "Alerts on" : "Alerts off"}
                  </button>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">Ring how early?</span>
                    <div className="relative">
                      <select
                        value={classAlerts.prefs.leadMinutes}
                        onChange={(e) => classAlerts.updatePref({ leadMinutes: Number(e.target.value) })}
                        className="w-full appearance-none rounded-xl border border-navy-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      >
                        {classAlerts.leadOptions.map((m) => (
                          <option key={m} value={m}>
                            {m === 0 ? "At the exact start" : `${m} minute${m === 1 ? "" : "s"} before`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">Chime</span>
                    <button
                      onClick={() => classAlerts.updatePref({ soundOn: !classAlerts.prefs.soundOn })}
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition ${
                        classAlerts.prefs.soundOn
                          ? "bg-brand-50 text-brand-700 ring-1 ring-brand-600/20 hover:bg-brand-100"
                          : "bg-navy-50 text-navy-500 ring-1 ring-navy-200 hover:bg-navy-100"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <AlarmClock className="h-4 w-4" />
                        {classAlerts.prefs.soundOn ? "Sound on" : "Sound off"}
                      </span>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${classAlerts.prefs.soundOn ? "bg-emerald-500" : "bg-navy-300"}`}
                      />
                    </button>
                  </label>

                  <div className="rounded-xl border border-navy-100 bg-navy-50/50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400">Next class</p>
                    {classAlerts.next ? (
                      <div className="mt-1">
                        <p className="text-sm font-bold text-navy-800">
                          {classAlerts.next.subject} · {classAlerts.next.classArm}
                        </p>
                        <p className="text-xs text-navy-500">
                          {classAlerts.minutesToLabel(classAlerts.next.startMinutes)}
                          {classAlerts.next.startsInMin <= 0
                            ? " · in progress"
                            : ` · in ${classAlerts.next.startsInMin} min`}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-navy-400">No classes left today</p>
                    )}
                  </div>
                </div>

                {classAlerts.notifPermission === "default" && (
                  <p className="mt-4 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-brand-800">
                    <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Turn alerts on to enable <strong>desktop notifications</strong> — the alarm rings even when this
                    tab is in the background.
                  </p>
                )}
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
          )}
        </div>
      </div>

      {/* Print-friendly weekly timetable modal */}
      <PrintableTimetable
        open={printTtOpen}
        onClose={() => setPrintTtOpen(false)}
        school={session.school}
        mode="teacher"
        personName={session.user.name}
        entries={ttEntries}
      />

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
          {/* Own arms, NOT the school-arms fallback — an arm-less teacher must
              still get the picker (and never the false "an arm you teach" copy). */}
          {session.user.assignedClasses?.length || session.user.assignedClass ? (
            <div className="flex items-start gap-2 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-sm text-navy-600">
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p>
                This student will be added to <strong>{classArm}</strong> — an arm you teach.
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

      {/* Class-starts alarm banner — the "it's time" ring */}
      {classAlerts.alert && (
        <div className="fixed left-1/2 top-20 z-50 w-[min(92vw,640px)] -translate-x-1/2 animate-fade-up">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 shadow-2xl">
            <span className="flex h-11 w-11 shrink-0 animate-pulse items-center justify-center rounded-xl bg-amber-500 text-white shadow-lg shadow-amber-500/40">
              <AlarmClock className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-900">
                Class starting — {classAlerts.alert.subject} · {classAlerts.alert.classArm}
              </p>
              <p className="text-xs text-amber-700">
                {classAlerts.minutesToLabel(classAlerts.alert.startMinutes)} · {classAlerts.alert.day} — get to
                class!
              </p>
            </div>
            <button
              onClick={classAlerts.dismissAlert}
              className="rounded-lg p-1.5 text-amber-400 transition hover:bg-amber-100 hover:text-amber-700"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}
