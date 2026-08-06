"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  Trophy,
  BellRing,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ReportCardModal from "@/components/ReportCardModal";
import { gradeBadgeClasses, standingFromAverage, standingRemark, ordinal } from "@/lib/grading";

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
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meData.user || meData.user.role !== "STUDENT") {
        router.replace("/login");
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

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-navy-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </main>
    );
  }

  const brand = session.school?.brandColor || "#2563EB";

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar role="STUDENT" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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
              <p className="text-sm font-bold text-navy-800">My Report Card</p>
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
          {/* Fee reminders — shown when the school reminded the student directly
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
                    <BookOpen className="h-4 w-4" /> {session.school?.name}
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
              </div>
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
            )}
          </div>
        </div>
      </div>

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
    </main>
  );
}
