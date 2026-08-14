"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  PieChart,
  RefreshCw,
  Snowflake,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AreaChart, DonutChart, DayBars } from "@/components/OverviewCharts";

const naira = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Compact naira for chart axes (₦185k / ₦1.2M) and short date labels (Aug 4).
const fmtCompact = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `₦${Math.round(v / 1_000)}k`;
  return `₦${v}`;
};
const fmtDay = (iso) => {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/**
 * The Overview tab of the admin dashboard — fee collection charts, class
 * distribution, attendance trend, quick actions, term rollover and the danger
 * zone. Everything the tab renders comes in through props; the parent keeps
 * ownership of all state and side effects (this component is presentational).
 *
 * @param {Object} props
 * @param {Object} props.stats            getDashboardStats payload
 * @param {number|null} props.feeDelta    collection change % (last 7 vs prior 7 days)
 * @param {number} props.maxArm           largest class-arm size (bar scaling)
 * @param {Object} props.session          current session (user + school)
 * @param {boolean} props.isSuper         can manage users (danger zone, rollover)
 * @param {boolean} props.canRoster       can manage students (roster actions)
 * @param {boolean} props.canFees         can view fees (fee actions)
 * @param {boolean} props.canReports      can view report cards
 * @param {Object} props.router           next/navigation router (page jumps)
 * @param {(tab: string) => void} props.onNavigate   switch the active tab
 * @param {("teacher"|"student") => void} props.onOpenModal
 * @param {() => void} props.onOpenRollover
 * @param {(mode: string) => void} props.onFreeze    open freeze/reactivate/restore
 * @param {() => void} props.onDelete                start the delete flow
 */
export default function OverviewTab({
  stats,
  feeDelta,
  maxArm,
  session,
  isSuper,
  canRoster,
  canFees,
  canReports,
  router,
  onNavigate,
  onOpenModal,
  onOpenRollover,
  onFreeze,
  onDelete,
}) {
  if (!stats) return null;

  return (
    <>
      {/* Row 1 — fee collection: area chart + collection-split donut */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 ring-1 ring-emerald-600/10">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-navy-800">Fee collection</h2>
                <p className="text-xs text-navy-400">Confirmed payments · this term</p>
              </div>
            </div>
            {feeDelta !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                  feeDelta >= 0
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-rose-50 text-rose-700 ring-rose-600/20"
                }`}
              >
                {feeDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {feeDelta >= 0 ? "+" : ""}
                {feeDelta}% vs last 7 days
              </span>
            )}
          </div>
          <div className="mt-4">
            <p className="text-3xl font-extrabold tracking-tight text-navy-800">
              {naira(stats.feeCollectedAmount)}
            </p>
            <p className="mt-1 text-xs font-medium text-navy-400">
              of {naira(stats.feeBilledAmount)} billed · {naira(stats.feeOutstandingAmount)} outstanding
            </p>
          </div>
          <div className="mt-5">
            <AreaChart
              data={(stats.collectionTimeline || []).map((t) => ({ label: fmtDay(t.date), value: t.amount }))}
              color="#10B981"
              formatValue={fmtCompact}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-bold text-navy-800">Collection split</h2>
          </div>
          <p className="text-xs text-navy-400">What families owe vs have paid this term</p>
          <div className="mt-5">
            <DonutChart
              segments={[
                { label: "Collected", value: stats.feeCollectedAmount || 0, color: "#10B981" },
                { label: "Outstanding", value: stats.feeOutstandingAmount || 0, color: "#F59E0B" },
              ]}
              formatValue={fmtCompact}
              centerLabel="billed this term"
            />
          </div>
        </div>
      </div>

      {/* Row 2 — class distribution + attendance trend */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600 ring-1 ring-brand-600/10">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-navy-800">Class distribution</h2>
              <p className="text-xs text-navy-400">Students per class arm</p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {Object.entries(stats.classDistribution || {}).map(([arm, count]) => (
              <div key={arm}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-navy-700">{arm}</span>
                  <span className="text-navy-400">{count} students</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-navy-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
                    style={{ width: `${(count / maxArm) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {Object.keys(stats.classDistribution || {}).length === 0 && (
              <p className="text-sm text-navy-400">No students yet. Add students to see distribution.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600 ring-1 ring-brand-600/10">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-navy-800">Attendance</h2>
              <p className="text-xs text-navy-400">
                Present vs absent · last {stats.attendanceTrend?.length || 0} school day
                {stats.attendanceTrend?.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="mt-5">
            <DayBars
              data={(stats.attendanceTrend || []).map((d) => ({
                label: fmtDay(d.date),
                present: d.present,
                absent: d.absent,
              }))}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium text-navy-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Present
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Absent
            </span>
            {stats.attendanceTrend?.length > 0 && (
              <span className="ml-auto text-navy-400">
                {fmtDay(stats.attendanceTrend[stats.attendanceTrend.length - 1].date)}:{" "}
                {stats.attendanceTrend[stats.attendanceTrend.length - 1].present} present ·{" "}
                {stats.attendanceTrend[stats.attendanceTrend.length - 1].absent} absent
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 3 — quick actions + term rollover */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-navy-200/70 bg-gradient-to-br from-navy-900 to-navy-800 p-6 text-white shadow-sm">
          <LayoutDashboard className="h-6 w-6 text-brand-300" />
          <h2 className="mt-3 text-lg font-bold">Quick actions</h2>
          <p className="mt-1 text-sm text-navy-300">
            Manage your school from one place.
          </p>
          <div className="mt-5 space-y-2.5">
            {[
              ...(canRoster
                ? [
                    { label: "Import students & teachers (CSV)", action: () => router.push("/admin/import") },
                    { label: "Quick-add students (paste names)", action: () => router.push("/admin/quick-add") },
                    { label: "Start from class sizes (paper register)", action: () => router.push("/admin/placeholders") },
                  ]
                : []),
              ...(canRoster
                ? [{ label: "Manage students & fees", action: () => onNavigate("students") }]
                : []),
              ...(canFees
                ? [{ label: "Manage fees & ledger", action: () => onNavigate("fees") }]
                : []),
              ...(canReports
                ? [{ label: "View report cards", action: () => onNavigate("reports") }]
                : []),
              ...(isSuper
                ? [
                    { label: "Manage teachers & payroll", action: () => onNavigate("teachers") },
                    { label: "Add a teacher", action: () => onOpenModal("teacher") },
                  ]
                : []),
              ...(canRoster
                ? [{ label: "Add a student", action: () => onOpenModal("student") }]
                : []),
            ].map((a) => (
              <button
                key={a.label}
                onClick={a.action}
                className="flex w-full items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-navy-100 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
              >
                {a.label}
                <ChevronRight className="h-4 w-4 text-navy-300" />
              </button>
            ))}
          </div>
        </div>

        {/* Term rollover — SUPER_ADMIN moves the school to a new term */}
        {isSuper && (
          <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm lg:col-span-2">
            <div className="flex h-full flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-navy-800">Term rollover</h3>
                  <p className="mt-0.5 text-sm text-navy-400">
                    Currently on{" "}
                    <strong className="text-navy-600">
                      {session?.school?.currentSession} · {session?.school?.currentTerm}
                    </strong>
                    . Starting a new term archives this term&apos;s scores &amp; attendance, carries
                    fee structures and unpaid balances forward, and sends automatic reminders.
                  </p>
                </div>
              </div>
              <button
                onClick={onOpenRollover}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
              >
                <CalendarDays className="h-4 w-4" />
                Start a new term
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Danger zone — SUPER_ADMIN only. Three levels: freeze the account
          (blocks logins, keeps ALL data, reactivatable), delete it (a
          30-day recovery window — restorable, then purged), and the
          permanent wipe (two-step confirm + exit survey). */}
      {isSuper && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50/40 shadow-sm">
          <div className="border-b border-navy-100 bg-white/60 px-6 py-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-rose-800">
              <AlertTriangle className="h-4 w-4" /> Danger zone
            </h3>
            <p className="mt-0.5 text-xs text-navy-400">
              Manage the whole {session?.school?.name} account. Freezing is reversible; deleting
              starts a 30-day recovery window.
            </p>
          </div>

          {/* Freeze / reactivate / restore — all reversible, no data lost. */}
          <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`rounded-xl p-2.5 ${
                  session.school?.status !== "active" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                }`}
              >
                {session.school?.status !== "active" ? <RefreshCw className="h-5 w-5" /> : <Snowflake className="h-5 w-5" />}
              </div>
              <div>
                <h4 className="text-sm font-bold text-navy-800">
                  {session.school?.status === "frozen"
                    ? "Reactivate school account"
                    : session.school?.status === "deleted"
                      ? "Restore school account"
                      : "Freeze school account"}
                </h4>
                <p className="mt-0.5 text-sm text-navy-500">
                  {session.school?.status === "frozen"
                    ? "All staff and student logins are currently blocked. Reactivating resumes them instantly — nothing was deleted."
                    : session.school?.status === "deleted"
                      ? "This school was deleted and its data is kept for a 30-day recovery window. Restoring revives the account and everything in it."
                      : "Blocks all staff and student logins while keeping every byte of data. You can reactivate the account at any time."}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                onFreeze(
                  session.school?.status === "frozen"
                    ? "reactivate"
                    : session.school?.status === "deleted"
                      ? "restore"
                      : "freeze"
                )
              }
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${
                session.school?.status !== "active"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-amber-500 hover:bg-amber-400"
              }`}
            >
              {session.school?.status !== "active" ? <RefreshCw className="h-4 w-4" /> : <Snowflake className="h-4 w-4" />}
              {session.school?.status === "frozen"
                ? "Reactivate school"
                : session.school?.status === "deleted"
                  ? "Restore school"
                  : "Freeze account"}
            </button>
          </div>

          {/* Permanent wipe — only for an active/frozen school (a deleted
              one is already in its recovery window). */}
          {session.school?.status !== "deleted" && (
            <div className="flex flex-col gap-4 border-t border-rose-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-rose-100 p-2.5 text-rose-600">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-rose-800">Deactivate school & delete data</h4>
                  <p className="mt-0.5 text-sm text-navy-500">
                    Delete the school — its data is kept for a 30-day recovery window, then
                    permanently removed. You can restore the account anytime within the window.{" "}
                    <strong className="text-rose-700">After that, there is no going back.</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={onDelete}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
              >
                <Trash2 className="h-4 w-4" />
                Deactivate school & delete data
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
