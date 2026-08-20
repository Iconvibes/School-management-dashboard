"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardSkeleton from "@/components/DashboardSkeleton";
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
  KeyRound,
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

import AttendanceView from "@/components/teacher/AttendanceView";
import TimetableView from "@/components/teacher/TimetableView";
import ReportsView from "@/components/teacher/ReportsView";
import MatrixView from "@/components/teacher/MatrixView";
import { useTabFetch } from "@/hooks/useTabFetch";


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
  // Change password modal — teachers bootstrap with the school name as their
  // password, then can set their own from here.
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
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

  const attUrl = view === "attendance" && classArm
    ? `/api/attendance?classArm=${encodeURIComponent(classArm)}&date=${attDate}` : null;
  const { data: attResult } = useTabFetch(attUrl, {
    enabled: view === "attendance" && !!classArm,
    deps: [classArm, attDate],
    transform: (d) => d.rows || [],
  });
  useEffect(() => {
    if (attResult) { setAttRows(attResult); setAttLoaded(true); }
  }, [attResult]);

  // Load ranked students (for the Report Cards view) when class arm changes
  useEffect(() => {
    if (!classArm) return;
    scopedFetch(`/api/reports?classArm=${encodeURIComponent(classArm)}&limit=200`)
      .then((data) => setReportStudents(data.students || []));
  }, [classArm, scopedFetch]);

  const { data: ttEntriesResult } = useTabFetch(
    view === "timetable" ? "/api/timetable?mine=1" : null,
    { enabled: view === "timetable", transform: (d) => d.entries || [] }
  );
  useEffect(() => {
    if (ttEntriesResult) { setTtEntries(ttEntriesResult); setTtLoaded(true); }
  }, [ttEntriesResult]);

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

  // Self-service password change: verify current, set new, sign the new
  // session in (other sessions are revoked server-side).
  async function savePassword() {
    setPwError("");
    if (!pwForm.current || !pwForm.next) {
      setPwError("Please fill in your current and new password.");
      return;
    }
    if (pwForm.next.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError("The two new-password fields don't match.");
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || "Could not change password.");
        return;
      }
      setPwModalOpen(false);
      setPwForm({ current: "", next: "", confirm: "" });
      setToast("Password updated — you're now signed in with your new password.");
      setTimeout(() => setToast(""), 4000);
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) {
    return <DashboardSkeleton />;
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
            <button
              onClick={() => {
                setPwError("");
                setPwModalOpen(true);
              }}
              title="Change password"
              className="rounded-lg p-2 text-navy-500 transition hover:bg-navy-50 hover:text-navy-700"
            >
              <KeyRound className="h-4.5 w-4.5" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              {session.user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-8">
          {/* View toggle — scrolls horizontally on small screens so the four
              views never push the page wider than the viewport */}
          <div className="mb-6 -mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex w-max gap-1 rounded-xl bg-navy-100 p-1 lg:hidden">
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
          <AttendanceView
            classArm={classArm}
            setClassArm={setClassArm}
            teacherArms={teacherArms}
            attDate={attDate}
            setAttDate={setAttDate}
            attRows={attRows}
            attLoaded={attLoaded}
            attSaving={attSaving}
            attMarked={attMarked}
            attPresent={attPresent}
            attAbsent={attAbsent}
            saveAttendance={saveAttendance}
            setAttStatus={setAttStatus}
          />
        )}

          {/* MY TIMETABLE VIEW */}
{view === "timetable" && (
          <TimetableView
            ttEntries={ttEntries}
            ttLoaded={ttLoaded}
            setPrintTtOpen={setPrintTtOpen}
            dayTimeline={dayTimeline}
            dayTimelines={dayTimelines}
            dayPeriodSets={dayPeriodSets}
            ttByDayPeriod={ttByDayPeriod}
            myCount={myCount}
            myArms={myArms}
            isToday={isToday}
            classAlerts={classAlerts}
          />
        )}

          {/* REPORT CARDS VIEW */}
{view === "reports" && (
          <ReportsView
            reportStudents={reportStudents}
            filteredReports={filteredReports}
            reportSearch={reportSearch}
            setReportSearch={setReportSearch}
            reportLoading={reportLoading}
            openReport={openReport}
            classArm={classArm}
          />
        )}

          {/* GRADING MATRIX VIEW */}
{view === "matrix" && (
          <MatrixView
            classArm={classArm}
            setClassArm={setClassArm}
            teacherArms={teacherArms}
            subject={subject}
            setSubject={setSubject}
            teacherSubjects={teacherSubjects}
            students={students}
            filteredRows={filteredStudents}
            search={search}
            setSearch={setSearch}
            rows={rows}
            savedMap={savedMap}
            saving={saving}
            totalEntered={totalEntered}
            computeRow={computeRow}
            setScore={setScore}
            saveAll={saveAll}
            setAddModal={setAddModal}
          />
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

      {/* Change password modal — teachers bootstrap with the school name,
          then set their own password. The hint stays here (behind auth),
          never on the public login page. */}
      <Modal
        open={pwModalOpen}
        onClose={() => {
          if (pwSaving) return;
          setPwModalOpen(false);
          setPwError("");
          setPwForm({ current: "", next: "", confirm: "" });
        }}
        title="Change password"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-sm text-navy-600">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span>
              Until you set your own password, your current password is your{" "}
              <strong className="text-navy-700">school&apos;s name</strong>. Setting your own
              password turns the school name off — only your password will work from then on.
            </span>
          </div>
          {pwError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
              {pwError}
            </p>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Current password</span>
            <input
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
              placeholder="Your current password"
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">New password</span>
            <input
              type="password"
              value={pwForm.next}
              onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
              placeholder="At least 6 characters"
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Confirm new password</span>
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              placeholder="Repeat the new password"
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <button
            onClick={savePassword}
            disabled={pwSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {pwSaving ? "Saving…" : "Update password"}
          </button>
        </div>
      </Modal>

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
