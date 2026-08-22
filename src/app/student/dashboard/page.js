"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import {
  Menu,
  Loader2,
  Download,
  BookOpen,
  ShieldCheck,
  TrendingUp,
  Award,
  Layers,
  Wallet,
  CalendarCheck,
  CalendarDays,
  Trophy,
  BellRing,
  Clock,
  Printer,
  Lock,
  KeyRound,
  Check,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ExportMyDataButton from "@/components/ExportMyDataButton";
import RequestErasureButton from "@/components/RequestErasureButton";
import ReportCardModal from "@/components/ReportCardModal";
import ErrorBoundary from "@/components/ErrorBoundary";
import PrintableTimetable from "@/components/PrintableTimetable";
import { gradeBadgeClasses, standingFromAverage, standingRemark, ordinal } from "@/lib/grading";
import { DAYS, getDayTimeline, getPeriodTimes, MAX_PERIOD, PERIODS, schoolDayOf } from "@/lib/timetable";
import { bounceToLogin } from "@/lib/auth-client";
import ResourcesView from "@/components/student/ResourcesView";

const naira = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Shown until a student has at least one recorded score. Neutral, encouraging
// styling — no red "Needs Support" badge for results that simply don't exist yet.
const PENDING_STANDING = {
  label: "Results Pending",
  color: "#64748b",
  classes: "bg-navy-100 text-navy-500 ring-navy-500/20",
  remark: "Your teachers haven't recorded your results yet — check back after the first assessment.",
};

export default function StudentDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printTtOpen, setPrintTtOpen] = useState(false);
  const [reminders, setReminders] = useState([]);
  // View state: "report" (default) | "timetable" — the sidebar links to
  // /student/dashboard#timetable, so the hash drives the active view.
  const [view, setView] = useState("report");
  const [ttMode, setTtMode] = useState("week"); // "week" | "today"
  const [ttEntries, setTtEntries] = useState([]);
  const [ttLoaded, setTtLoaded] = useState(false);
  // Change-password modal state
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwDone, setPwDone] = useState(false);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meData.user || meData.user.role !== "STUDENT") {
        bounceToLogin(router);
        return;
      }
      setSession(meData);

      const [scoresRes, remindersRes] = await Promise.all([
        fetch("/api/scores/student"),
        fetch("/api/student/reminders"),
      ]);
      setData(await scoresRes.json());
      setReminders((await remindersRes.json()).reminders || []);
      setLoading(false);
    })();
  }, [router]);

  // Sidebar hash links: /student/dashboard#timetable opens the class schedule.
  // The tab buttons keep the hash in sync (clearing it when leaving), so the
  // URL and the visible view can never disagree.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if ("timetable" === hash || "resources" === hash) {
        setView(hash);
        window.scrollTo({ top: 0 });
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  // Load the class-arm timetable (the shared schedule for ALL of the student's
  // arm — one timetable for every SS1 Science student) + the school's bell
  // schedule when the Timetable view opens.
  useEffect(() => {
    if (view !== "timetable" || !session) return;
    Promise.all([
      fetch("/api/timetable").then((r) => r.json()),
      fetch("/api/school").then((r) => r.json()),
    ])
      .then(([tt]) => {
        setTtEntries(tt.entries || []);
        setTtLoaded(true);
      })
      .catch(() => setTtLoaded(true));
  }, [view, session]);

  const summary = useMemo(() => {
    if (!data)
      return { hasScores: false, subjects: 0, average: 0, standing: null, best: null, position: null, outOf: 0 };
    const hasScores = (data.scores?.length || 0) > 0;
    const avg = hasScores ? data.summary?.average || 0 : 0;
    const standing = hasScores ? standingFromAverage(avg) : PENDING_STANDING;
    const best = hasScores
      ? data.scores.reduce((a, b) => (b.totalScore > a.totalScore ? b : a))
      : null;
    return {
      hasScores,
      subjects: data.summary?.subjects || 0,
      average: avg,
      // No rank until the first scores exist — an all-zero position is noise.
      position: hasScores ? data.summary?.position || null : null,
      outOf: hasScores ? data.summary?.outOf || 0 : 0,
      standing: { ...standing, remark: standing.remark || standingRemark(standing.label) },
      best,
    };
  }, [data]);

  // Timetable view — the arm-wide schedule keyed by day|period, with the
  // teacher's name on every slot so students know who takes each subject.
  const ttByDayPeriod = useMemo(() => {
    const m = {};
    ttEntries.forEach((e) => {
      m[`${e.day}|${e.period}`] = e;
    });
    return m;
  }, [ttEntries]);

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

  const todayName = schoolDayOf(new Date());
  const isToday = (day) => todayName === day;
  // Today's bell — which periods actually run today (a short Friday has no
  // period 7/8), with their real times.
  const todayTimes = useMemo(
    () => (todayName ? getPeriodTimes(session?.school, todayName) : []),
    [session?.school, todayName]
  );
  const todayPeriods = useMemo(
    () => new Set(todayTimes.map((p) => Number(p.period))),
    [todayTimes]
  );
  const todaySlots = todayName
    ? todayTimes
        .map((p) => ({
          period: p.period,
          entry: ttByDayPeriod[`${todayName}|${p.period}`],
        }))
        .filter((s) => s.entry)
    : [];
  const timeFor = (period) => {
    const pt = todayTimes.find((p) => Number(p.period) === Number(period));
    return pt ? `${pt.start}–${pt.end}` : "";
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const brand = session.school?.brandColor || "#2563EB";

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar role="STUDENT" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-w-0 flex-1 lg:pl-64">
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
                {view === "timetable" ? "My Timetable" : "My Report Card"}
              </p>
              <p className="text-xs text-navy-400">
                {session.school?.currentSession} · {session.school?.currentTerm}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Student
            </span>
            <button
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
            >
              <Download className="h-4 w-4" /> Report Card (PDF)
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-8">
          {/* View tabs — My Report Card (default) / My Timetable (hash-linked) */}
          <div className="mb-6 inline-flex rounded-xl bg-navy-100 p-1 lg:hidden">
            <button
              onClick={() => {
                setView("report");
                if (location.hash) history.replaceState(null, "", location.pathname);
                window.scrollTo({ top: 0 });
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                view === "report" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
              }`}
            >
              My Report Card
            </button>
            <button
              onClick={() => {
                setView("timetable");
                if (!location.hash) history.replaceState(null, "", "#timetable");
                window.scrollTo({ top: 0 });
              }}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                view === "timetable" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
              }`}
            >
              <CalendarDays className="h-4 w-4" /> My Timetable
            </button>
          </div>

          {view === "timetable" && (
            <div className="animate-fade-up">
<ErrorBoundary label="My Timetable">
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-navy-100 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-bold text-navy-800">
                      {session.user.assignedClass || "My class"} — weekly timetable
                    </h2>
                    <p className="text-sm text-navy-400">
                      Set by your school. Every student in{" "}
                      <strong className="font-semibold text-navy-600">{session.user.assignedClass || "your class"}</strong>{" "}
                      follows this same schedule — one timetable per class arm.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPrintTtOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700"
                    >
                      <Printer className="h-3.5 w-3.5" /> Print
                    </button>
                    <div className="inline-flex rounded-xl bg-navy-100 p-1">
                    <button
                      onClick={() => setTtMode("week")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        ttMode === "week" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                      }`}
                    >
                      This week
                    </button>
                    <button
                      onClick={() => setTtMode("today")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        ttMode === "today" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                      }`}
                    >
                      Today
                    </button>
                    </div>
                  </div>
                </div>

                {ttMode === "week" ? (
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
                                <p className="text-[10px] text-navy-400">{timeFor(block.period)}</p>
                              </td>
                              {DAYS.map((d) => {
                                // A period that isn't on this day's bell (e.g.
                                // Friday ends at period 6) never shows.
                                if (!(dayPeriodSets[d] || new Set()).has(Number(block.period))) {
                                  return (
                                    <td key={d} className={`px-2 py-2 text-center ${isToday(d) ? "bg-brand-50/40" : ""}`}>
                                      <span className="text-[10px] font-medium text-navy-300">not scheduled</span>
                                    </td>
                                  );
                                }
                                const slot = ttByDayPeriod[`${d}|${block.period}`];
                                return (
                                  <td key={d} className={`px-2 py-2 text-center ${isToday(d) ? "bg-brand-50/40" : ""}`}>
                                    {slot ? (
                                      <div className="inline-flex flex-col items-center gap-0.5 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-1.5 shadow-sm">
                                        <span className="text-xs font-bold text-brand-800">{slot.subject}</span>
                                        <span className="text-[10px] font-medium text-brand-600">
                                          {slot.teacherName || "Staff"}
                                        </span>
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
                ) : (
                  <div className="divide-y divide-navy-50">
                    {todayName ? (
                      todaySlots.length ? (
                        todaySlots.map(({ period, entry }) => (
                          <div
                            key={period}
                            className="flex flex-wrap items-center gap-4 px-6 py-4"
                          >
                            <div className="w-20 shrink-0">
                              <p className="text-sm font-bold text-navy-700">Period {period}</p>
                              <p className="flex items-center gap-1 text-[11px] text-navy-400">
                                <Clock className="h-3 w-3" /> {timeFor(period)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2 shadow-sm">
                              <p className="text-sm font-bold text-brand-800">{entry.subject}</p>
                              <p className="text-xs font-medium text-brand-600">
                                {entry.teacherName || "Staff"}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="px-6 py-10 text-center text-sm text-navy-400">
                          No classes scheduled for {todayName}. Enjoy the break!
                        </p>
                      )
                    ) : (
                      <p className="px-6 py-10 text-center text-sm text-navy-400">
                        School is closed on weekends — see you Monday.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-navy-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Your class schedule
                </span>
                <span className="text-navy-400">
                  {ttLoaded
                    ? `${Object.keys(ttByDayPeriod).length} slots this week · shared by everyone in ${session.user.assignedClass || "your class"}`
                    : "Loading your schedule…"}
                </span>
              </div>
              </ErrorBoundary>
            </div>
          )}

          {view === "report" && (
          <ErrorBoundary label="Report Card">          {/* Fee reminders — shown when the school reminded the student directly
              (no linked parent on file, so the parent portal couldn't carry it). */}
          {reminders.length > 0 && (
            <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-5">
              <div className="flex items-center gap-2">
                <BellRing className="h-5 w-5 text-violet-600" />
                <h2 className="text-lg font-bold text-navy-800">
                  {reminders.length} fee reminder{reminders.length === 1 ? "" : "s"} from the school
                </h2>
              </div>
              <div className="mt-3 space-y-2">
                {reminders.map((r) => (
                  <div key={r.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-violet-100">
                    <p className="text-sm font-bold text-navy-800">{r.subject}</p>
                    <p className="mt-0.5 text-xs text-navy-500">{r.preview}</p>
                    <p className="mt-1 text-[11px] text-navy-400">
                      {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-violet-700">
                Please settle your outstanding balance at the school office, or ask a parent or
                guardian to complete the payment for you.
              </p>
            </div>
          )}

          {/* Profile banner */}
          <div
            className="relative overflow-hidden rounded-2xl p-8 text-white shadow-xl"
            style={{ background: `linear-gradient(135deg, #0f172a 0%, ${brand} 130%)` }}
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-6">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-extrabold shadow-lg"
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }}
              >
                {session.user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-extrabold tracking-tight">{session.user.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-navy-200">
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-4 w-4" /> {session.user.assignedClass || "Unassigned class"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {/* The school's uploaded logo sits beside its name in
                        every portal header — branding follows the tenant
                        everywhere (the book icon is the no-logo fallback). */}
                    {session.school?.logoUrl ? (
                      <img
                        src={session.school.logoUrl}
                        alt=""
                        className="h-5 w-5 rounded bg-white/90 object-contain"
                      />
                    ) : (
                      <BookOpen className="h-4 w-4" />
                    )}
                    {session.school?.name}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold ring-1 ${summary.standing?.classes}`}
                >
                  <Award className="h-4 w-4" /> {summary.standing?.label}
                </span>
                <p className="mt-2 text-xs text-navy-200">
                  {summary.hasScores
                    ? `${summary.subjects} subjects · Avg ${summary.average}%`
                    : "Results will appear here once your teachers record them"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => { setPwModal(true); setPwDone(false); setPwError(""); setPwForm({ current: "", newPw: "", confirm: "" }); }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Change password
                  </button>
                  <ExportMyDataButton />
                </div>
              </div>
              <RequestErasureButton className="!bg-white/10 hover:!bg-white/20" />
            </div>
          </div>

          {/* Performance overview */}
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-brand-600" />
                <h2 className="font-bold text-navy-800">Overall average</h2>
              </div>
              {summary.hasScores ? (
                <>
                  <p className="mt-3 text-4xl font-extrabold text-navy-800">{summary.average}%</p>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-navy-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, summary.average)}%`,
                        background: `linear-gradient(to right, ${brand}, ${brand}cc)`,
                      }}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm font-medium text-navy-400">
                  No results recorded this term yet — your average will show here.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-600" />
                <h2 className="font-bold text-navy-800">Class position</h2>
              </div>
              <p className="mt-3 text-3xl font-extrabold text-navy-800">
                {summary.hasScores && summary.position ? ordinal(summary.position) : "—"}
              </p>
              <p className="mt-1 text-sm text-navy-400">
                {summary.hasScores
                  ? summary.position
                    ? `of ${summary.outOf} students in ${session.user.assignedClass || "your class"}`
                    : "Based on term averages"
                  : "Ranking appears once your results are recorded"}
              </p>
            </div>

            <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-amber-600" />
                <h2 className="font-bold text-navy-800">Academic standing</h2>
              </div>
              <p className="mt-3 text-xl font-extrabold text-navy-800">{summary.standing?.label}</p>
              <p className="mt-1 text-sm leading-6 text-navy-400">{summary.standing?.remark}</p>
            </div>
          </div>

          {/* Fee + attendance strip */}
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-600" />
                <h2 className="font-bold text-navy-800">Fee balance</h2>
              </div>
              <p className="mt-3 text-3xl font-extrabold text-navy-800">
                {data?.fee ? naira(data.fee.balance) : "—"}
              </p>
              <p className="mt-1 text-sm text-navy-400">
                {data?.fee?.feePaid
                  ? "Fully paid for this term ✓"
                  : `${naira(data?.fee?.paid || 0)} paid of ${naira(data?.fee?.amount || 0)}`}
              </p>
            </div>

            <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-brand-600" />
                <h2 className="font-bold text-navy-800">Attendance</h2>
              </div>
              <p className="mt-3 text-3xl font-extrabold text-navy-800">
                {data?.attendance?.present ?? 0}
                <span className="text-base font-semibold text-navy-400"> / {data?.attendance?.total || 0} days</span>
              </p>
              <p className="mt-1 text-sm text-navy-400">Days present this term</p>
            </div>

            <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-emerald-600" />
                <h2 className="font-bold text-navy-800">Best subject</h2>
              </div>
              {summary.best ? (
                <>
                  <p className="mt-3 text-xl font-extrabold text-navy-800">{summary.best.subject}</p>
                  <p className="mt-1 text-sm text-navy-400">
                    {summary.best.totalScore}/100 · Grade{" "}
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ring-1 ${gradeBadgeClasses(summary.best.grade)}`}>
                      {summary.best.grade}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-navy-400">No results recorded yet</p>
              )}
            </div>
          </div>

          {/* Subject cards */}
          <h2 className="mt-10 text-lg font-bold text-navy-800">Performance by subject</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.scores || []).map((s) => (
              <div
                key={s.subject}
                className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-navy-900/5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-navy-800">{s.subject}</p>
                    <p className="mt-0.5 text-xs text-navy-400">{s.classArm}</p>
                  </div>
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-base font-bold ring-1 ${gradeBadgeClasses(s.grade)}`}>
                    {s.grade}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-navy-50 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">CA</p>
                    <p className="text-sm font-bold text-navy-800">{s.caScore}/40</p>
                  </div>
                  <div className="rounded-lg bg-navy-50 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">Exam</p>
                    <p className="text-sm font-bold text-navy-800">{s.examScore}/60</p>
                  </div>
                  <div className="rounded-lg py-2" style={{ background: `${brand}14` }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">Total</p>
                    <p className="text-sm font-extrabold" style={{ color: brand }}>{s.totalScore}</p>
                  </div>
                </div>
              </div>
            ))}
            {(data?.scores || []).length === 0 && (
              <div className="rounded-2xl border border-dashed border-navy-200 bg-white p-10 text-center text-navy-400 sm:col-span-2 lg:col-span-3">
                No scores have been recorded yet for this term. Your teachers will add them soon.
              </div>
            )}            </div>
          </ErrorBoundary>
          )}

          {view === "resources" && (
            <ErrorBoundary label="Resources">
              <ResourcesView
                classArm={session.user.assignedClass}
                subject=""
              />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* Print-friendly weekly timetable modal */}
      <PrintableTimetable
        open={printTtOpen}
        onClose={() => setPrintTtOpen(false)}
        school={session.school}
        mode="student"
        personName={session.user.name}
        personLabel={session.user.assignedClass}
        entries={ttEntries}
      />

      {/* Report card preview + PDF export modal */}
      <ReportCardModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        school={session.school}
        student={session.user}
        scores={data?.scores || []}
        summary={{
          subjects: summary.subjects,
          average: summary.average,
          position: summary.position,
          outOf: summary.outOf,
          standing: summary.standing,
        }}
        attendance={data?.attendance}
        fileName={session.user.name.toLowerCase().replace(/[^a-z]+/g, "-")}
      />

      {/* Change password modal */}
      {pwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPwModal(false)}>
          <div
            className="mx-4 w-full max-w-md animate-fade-up rounded-2xl border border-navy-200/70 bg-white p-6 shadow-xl shadow-navy-900/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy-800">
                <Lock className="mr-2 inline h-5 w-5 text-brand-600" />
                Change password
              </h2>
              <button onClick={() => setPwModal(false)} className="rounded-lg p-1.5 text-navy-300 transition hover:bg-navy-100 hover:text-navy-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {pwDone ? (
              <div className="mt-5 animate-fade-up space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                    <Check className="h-4 w-4" />
                    Password changed successfully
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Your new password is now active. Use it next time you sign in.
                  </p>
                  <p className="mt-2 border-t border-emerald-200 pt-2 text-xs text-emerald-700">
                    Your new password has been recorded on your account, so your school
                    can always look it up if you forget it.
                  </p>
                </div>
                <button
                  onClick={() => setPwModal(false)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 font-semibold text-white transition hover:bg-navy-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (pwForm.newPw !== pwForm.confirm) {
                    setPwError("Passwords do not match");
                    return;
                  }
                  if (pwForm.newPw.length < 6) {
                    setPwError("New password must be at least 6 characters");
                    return;
                  }
                  setPwSaving(true);
                  setPwError("");
                  try {
                    const res = await fetch("/api/auth/change-password", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.newPw }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Failed to change password");
                    setPwDone(true);
                  } catch (err) {
                    setPwError(err.message);
                  } finally {
                    setPwSaving(false);
                  }
                }}
                className="mt-5 space-y-4"
              >
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-navy-700">Current password</span>
                  <input
                    type="password"
                    value={pwForm.current}
                    onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                    placeholder="Your current password"
                    className="w-full rounded-xl border border-navy-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-navy-700">New password</span>
                  <input
                    type="password"
                    value={pwForm.newPw}
                    onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                    placeholder="At least 6 characters"
                    className="w-full rounded-xl border border-navy-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-navy-700">Confirm new password</span>
                  <input
                    type="password"
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                    placeholder="Repeat new password"
                    className="w-full rounded-xl border border-navy-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </label>

                {pwError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {pwError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pwSaving || !pwForm.current || !pwForm.newPw || !pwForm.confirm}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pwSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
                  {pwSaving ? "Changing…" : "Change password"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
