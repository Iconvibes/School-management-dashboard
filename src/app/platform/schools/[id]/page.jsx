"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ArrowLeft,
  LogIn,
  Users,
  GraduationCap,
  Layers,
  Shield,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRightLeft,
  ChevronRight,
  ChevronDown,
  User,
  Calendar,
  BarChart3,
  Activity,
  Filter,
  X,
  Sparkles,
  Target,
  Info,
  Trash2,
  RotateCcw,
} from "lucide-react";

import { SparkAreaChart, BarChart, ForecastChart, SectionCard } from "./charts";
import {
  formatCurrency,
  formatFullCurrency,
  formatTimeAgo,
  formatDate,
  getDateKey,
  ACTIVITY_COLORS,
} from "./format";

export default function SchoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [school, setSchool] = useState(null);
  const [stats, setStats] = useState(null);
  const [feeSummary, setFeeSummary] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [enrollmentHistory, setEnrollmentHistory] = useState([]);
  const [revenueHistory, setRevenueHistory] = useState([]);
  const [revenueForecast, setRevenueForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(null);
  const [error, setError] = useState(null);

  // Timeline state
  const [activityFilter, setActivityFilter] = useState("");
  // "now" snapshot captured OUTSIDE render (react-hooks/purity): the grace
  // countdown derives from this value, refreshed whenever the school object is
  // fetched — render stays a pure function of state.
  const [deletionClock, setDeletionClock] = useState(() => Date.now());
  const [expandedActivity, setExpandedActivity] = useState(null);

  // Enrollment drill-down state
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Enrollment chart state
  const [enrollMetric, setEnrollMetric] = useState("total"); // total | students | teachers

  // Delete school state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteAction, setDeleteAction] = useState("soft"); // "soft" | "purge"
  const [deleting, setDeleting] = useState(false);
  const [confirmStep, setConfirmStep] = useState(1);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/platform/schools/${params.id}`);
        if (!res.ok) throw new Error("School not found");
        const data = await res.json();
        if (!cancelled) {
          setDeletionClock(Date.now());
          setSchool(data.school);
          setStats(data.stats);
          setFeeSummary(data.feeSummary);
          setRecentActivity(data.recentActivity || []);
          setEnrollmentHistory(data.enrollmentHistory || []);
          setRevenueHistory(data.revenueHistory || []);
          setRevenueForecast(data.revenueForecast || null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [params.id]);

  async function handleImpersonate(userId) {
    setImpersonating(userId);
    try {
      const res = await fetch(`/api/platform/schools/${params.id}/impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Impersonation failed");
      const data = await res.json();
      router.push(data.redirect || "/admin/dashboard");
    } catch (err) {
      alert(err.message);
      setImpersonating(null);
    }
  }


  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/platform/schools/${school.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: deleteAction }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete school");
      }
      router.push("/platform/schools");
    } catch (err) {
      alert(err.message);
      setDeleting(false);
      setShowDeleteModal(false);
      setConfirmStep(1);
      setConfirmText("");
    }
  }

  async function handleRestore() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/platform/schools/${school.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to restore school");
      }
      setSchool((prev) => ({ ...prev, status: "active", deletedAt: null }));
      setShowDeleteModal(false);
      setConfirmStep(1);
      setConfirmText("");
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  }

  function openDeleteModal(action) {
    setDeleteAction(action);
    setShowDeleteModal(true);
    setConfirmStep(1);
    setConfirmText("");
  }

  // Group activities by date
  const groupedActivity = useMemo(() => {
    let filtered = recentActivity;
    if (activityFilter) {
      filtered = recentActivity.filter((e) => e.action === activityFilter);
    }
    const groups = {};
    filtered.forEach((entry) => {
      const key = getDateKey(entry.createdAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, entries]) => ({ date, entries }));
  }, [recentActivity, activityFilter]);

  // Unique action types for filter
  const actionTypes = useMemo(() => {
    const types = new Set(recentActivity.map((e) => e.action));
    return Array.from(types).sort();
  }, [recentActivity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <Link href="/platform/schools" className="mt-3 inline-block text-xs text-cyan-400 hover:text-cyan-300">
          Back to Tenants
        </Link>
      </div>
    );
  }

  if (!school) return null;

  const users = stats?.users || [];
  const students = users.filter((u) => u.role === "STUDENT");
  const teachers = users.filter((u) => u.role === "TEACHER");
  const parents = users.filter((u) => u.role === "PARENT");
  const admins = users.filter((u) => ["SUPER_ADMIN", "BURSAR", "REGISTRAR"].includes(u.role));

  const collectionRate = feeSummary?.totalExpected > 0
    ? Math.round((feeSummary.totalPaid / feeSummary.totalExpected) * 100)
    : 0;

  // Trend indicators
  const enrollmentTrend = enrollmentHistory.length >= 2
    ? enrollmentHistory[enrollmentHistory.length - 1].total - enrollmentHistory[enrollmentHistory.length - 2].total
    : 0;
  const revenueTrend = revenueHistory.length >= 2
    ? revenueHistory[revenueHistory.length - 1].collected - revenueHistory[revenueHistory.length - 2].collected
    : 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/platform/schools"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition hover:text-white"
      >
        <ArrowLeft className="h-3 w-3" /> Back to Tenants
      </Link>

      {/* ═══ Hero Card ═══ */}
      <div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#0f1219] p-6">
        <div
          className="absolute left-0 top-0 h-1 w-full"
          style={{ background: `linear-gradient(to right, ${school.brandColor || "#2563EB"}, transparent)` }}
        />
        <div className="flex items-start gap-5">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white"
            style={{ backgroundColor: school.brandColor || "#2563EB" }}
          >
            {school.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{school.name}</h1>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                  school.status === "active"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : school.status === "frozen"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {school.status?.toUpperCase()}
              </span>
              {!school.isPlatformSchool && school.status !== "deleted" && (
                <button
                  onClick={() => openDeleteModal("soft")}
                  className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
              {!school.isPlatformSchool && school.status === "deleted" && (() => {
                const GRACE_MS = 30 * 24 * 60 * 60 * 1000;
                const deletedAt = school.deletedAt ? new Date(school.deletedAt).getTime() : 0;
                const elapsed = deletedAt ? deletionClock - deletedAt : 0;
                const remaining = Math.max(0, GRACE_MS - elapsed);
                const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000));
                const inGrace = deletedAt && remaining > 0;
                return (
                  <div className="ml-2 flex items-center gap-2">
                    {inGrace && (
                      <>
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400">
                          {daysLeft}d left
                        </span>
                        <button
                          onClick={handleRestore}
                          disabled={deleting}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openDeleteModal("purge")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-600/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Purge Permanently
                    </button>
                  </div>
                );
              })()}
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-gray-400">
              <span>{school.currentSession} · {school.currentTerm}</span>
              {school.billingPlan && (
                <span className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-300">
                  {school.billingPlan}
                </span>
              )}
              {school.subscriptionStatus && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    school.subscriptionStatus === "active"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : school.subscriptionStatus === "trial"
                      ? "bg-blue-500/10 text-blue-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {school.subscriptionStatus}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/[0.03] p-4 text-center">
            <GraduationCap className="mx-auto h-4 w-4 text-cyan-400" />
            <p className="mt-2 text-2xl font-bold text-white">{students.length}</p>
            <p className="text-[10px] font-bold tracking-wider text-gray-500">STUDENTS</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4 text-center">
            <Users className="mx-auto h-4 w-4 text-blue-400" />
            <p className="mt-2 text-2xl font-bold text-white">{teachers.length}</p>
            <p className="text-[10px] font-bold tracking-wider text-gray-500">TEACHERS</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4 text-center">
            <Users className="mx-auto h-4 w-4 text-violet-400" />
            <p className="mt-2 text-2xl font-bold text-white">{parents.length}</p>
            <p className="text-[10px] font-bold tracking-wider text-gray-500">PARENTS</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4 text-center">
            <Layers className="mx-auto h-4 w-4 text-emerald-400" />
            <p className="mt-2 text-2xl font-bold text-white">{school.activeArms?.length || 0}</p>
            <p className="text-[10px] font-bold tracking-wider text-gray-500">CLASS ARMS</p>
          </div>
        </div>
      </div>

      {/* ═══ Enrollment Trends ═══ */}
      <SectionCard
        icon={TrendingUp}
        iconColor="bg-cyan-500/10"
        title="Enrollment Trends"
        subtitle="12-month enrollment growth"
        headerRight={
          <div className="flex items-center gap-2">
            {enrollmentTrend !== 0 && (
              <span className={`flex items-center gap-1 text-xs font-semibold ${enrollmentTrend > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {enrollmentTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {enrollmentTrend > 0 ? "+" : ""}{enrollmentTrend}
              </span>
            )}
            <div className="flex rounded-lg bg-white/[0.03] p-0.5">
              {["total", "students", "teachers"].map((m) => (
                <button
                  key={m}
                  onClick={() => { setEnrollMetric(m); setSelectedMonth(null); }}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-semibold capitalize transition ${
                    enrollMetric === m ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {enrollmentHistory.length > 0 ? (
          <div>
            <div className="flex items-end gap-4 mb-4">
              <p className="text-3xl font-bold text-white">
                {enrollmentHistory[enrollmentHistory.length - 1]?.[enrollMetric === "total" ? "total" : enrollMetric] || 0}
              </p>
              <p className="text-xs text-gray-500 pb-1">
                current {enrollMetric === "total" ? "users" : enrollMetric}
              </p>
            </div>
            <SparkAreaChart
              data={enrollmentHistory}
              dataKey={enrollMetric === "total" ? "total" : enrollMetric}
              color={enrollMetric === "students" ? "#22d3ee" : enrollMetric === "teachers" ? "#60a5fa" : "#a78bfa"}
              height={140}
              onMonthClick={setSelectedMonth}
              selectedMonth={selectedMonth}
            />
            <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-500" /> Students: {enrollmentHistory[enrollmentHistory.length - 1]?.students || 0}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Teachers: {enrollmentHistory[enrollmentHistory.length - 1]?.teachers || 0}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" /> Parents: {enrollmentHistory[enrollmentHistory.length - 1]?.parents || 0}</span>
            </div>

            {/* Drill-down panel for selected month */}
            {selectedMonth && (() => {
              const month = enrollmentHistory.find((m) => m.key === selectedMonth);
              if (!month || !month.joinedUsers || month.joinedUsers.length === 0) return null;
              return (
                <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-cyan-400" />
                      <span className="text-sm font-bold text-white">{month.label}</span>
                      <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400">
                        {month.joinedUsers.length} joined
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedMonth(null)}
                      className="rounded-lg bg-white/[0.05] px-2 py-1 text-[10px] text-gray-400 hover:bg-white/[0.1]"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {month.joinedUsers.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2"
                      >
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white ${
                            u.role === "STUDENT"
                              ? "bg-cyan-500"
                              : u.role === "TEACHER"
                              ? "bg-blue-500"
                              : u.role === "PARENT"
                              ? "bg-violet-500"
                              : "bg-gray-500"
                          }`}
                        >
                          {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-gray-300">{u.name}</p>
                          <p className="text-[10px] text-gray-500">{u.role.replace("_", " ")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-center text-[10px] text-gray-600">
                    Click any month on the chart to see who joined that month
                  </p>
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No enrollment data yet</p>
        )}
      </SectionCard>

      {/* ═══ Revenue History ═══ */}
      <SectionCard
        icon={BarChart3}
        iconColor="bg-emerald-500/10"
        title="Revenue History"
        subtitle="12-month fee collection"
        headerRight={
          <div className="flex items-center gap-2">
            {revenueTrend !== 0 && (
              <span className={`flex items-center gap-1 text-xs font-semibold ${revenueTrend > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {revenueTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {revenueTrend > 0 ? "+" : ""}{formatCurrency(revenueTrend)}
              </span>
            )}
          </div>
        }
      >
        {revenueHistory.length > 0 ? (
          <div>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-bold tracking-wider text-gray-500">TOTAL COLLECTED</p>
                <p className="mt-1 text-xl font-bold text-emerald-400">{formatFullCurrency(feeSummary?.totalPaid || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-gray-500">OUTSTANDING</p>
                <p className="mt-1 text-xl font-bold text-red-400">{formatFullCurrency(feeSummary?.totalBalance || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-gray-500">COLLECTION RATE</p>
                <p className="mt-1 text-xl font-bold text-white">{collectionRate}%</p>
              </div>
            </div>
            <BarChart data={revenueHistory} height={160} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">No revenue data yet</p>
        )}
      </SectionCard>

      {/* ═══ Revenue Forecast ═══ */}
      {revenueForecast && revenueForecast.months && revenueForecast.months.length > 0 && (
        <SectionCard
          icon={Sparkles}
          iconColor="bg-indigo-500/10"
          title="Revenue Forecast"
          subtitle="Next quarter projection based on historical trends"
          headerRight={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${
                  revenueForecast.trend === "growing"
                    ? "bg-emerald-400"
                    : revenueForecast.trend === "declining"
                    ? "bg-red-400"
                    : "bg-gray-400"
                }`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  revenueForecast.trend === "growing"
                    ? "text-emerald-400"
                    : revenueForecast.trend === "declining"
                    ? "text-red-400"
                    : "text-gray-400"
                }`}>
                  {revenueForecast.trend}
                </span>
              </div>
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                {revenueForecast.confidence}% confidence
              </span>
            </div>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-indigo-500/5 p-3">
              <p className="text-[10px] font-bold tracking-wider text-gray-500">PROJECTED Q TOTAL</p>
              <p className="mt-1 text-lg font-bold text-indigo-400">{formatFullCurrency(revenueForecast.projectedTotal)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <p className="text-[10px] font-bold tracking-wider text-gray-500">CURRENT MONTH AVG</p>
              <p className="mt-1 text-lg font-bold text-white">{formatFullCurrency(revenueForecast.currentMonthAvg)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <p className="text-[10px] font-bold tracking-wider text-gray-500">MONTHLY TREND</p>
              <div className="mt-1 flex items-center gap-1">
                {revenueForecast.slope > 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                ) : revenueForecast.slope < 0 ? (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4 text-gray-400" />
                )}
                <span className={`text-lg font-bold ${
                  revenueForecast.slope > 0 ? "text-emerald-400" : revenueForecast.slope < 0 ? "text-red-400" : "text-gray-400"
                }`}>
                  {revenueForecast.slope > 0 ? "+" : ""}{formatCurrency(revenueForecast.slope)}/mo
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <p className="text-[10px] font-bold tracking-wider text-gray-500">METHODOLOGY</p>
              <p className="mt-1 text-xs font-medium text-gray-300">WMA + Trend Blend</p>
              <p className="text-[10px] text-gray-500">60% weighted avg + 40% trend</p>
            </div>
          </div>
          <ForecastChart history={revenueHistory} forecast={revenueForecast} height={180} />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 opacity-90" /> Actual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400 opacity-70" /> Projected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-indigo-400 bg-transparent" style={{ borderWidth: 1.5 }} /> Confidence
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] px-2 py-1">
              <Info className="h-3 w-3 text-gray-600" />
              <span className="text-[9px] text-gray-600">Based on {revenueHistory.length} months of data</span>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ═══ Revenue & Fees (Current Term) ═══ */}
      {feeSummary && feeSummary.studentCount > 0 && (
        <SectionCard
          icon={Wallet}
          iconColor="bg-emerald-500/10"
          title="Revenue & Fees"
          subtitle="Current term fee collection status"
          headerRight={
            <div className="text-right">
              <p className="text-lg font-bold text-white">{collectionRate}%</p>
              <p className="text-[10px] text-gray-500">COLLECTION RATE</p>
            </div>
          }
        >
          {/* Collection Progress Bar */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
              <span>{formatFullCurrency(feeSummary.totalPaid)} collected</span>
              <span>{formatFullCurrency(feeSummary.totalExpected)} expected</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${Math.min(collectionRate, 100)}%` }}
              />
            </div>
          </div>

          {/* Revenue Stats Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[10px] font-bold tracking-wider text-gray-500">COLLECTED</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-emerald-400">{formatFullCurrency(feeSummary.totalPaid)}</p>
            </div>
            <div className="rounded-xl bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-bold tracking-wider text-gray-500">PENDING</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-amber-400">{formatFullCurrency(feeSummary.totalPending)}</p>
            </div>
            <div className="rounded-xl bg-red-500/5 p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[10px] font-bold tracking-wider text-gray-500">OUTSTANDING</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-red-400">{formatFullCurrency(feeSummary.totalBalance)}</p>
            </div>
            <div className="rounded-xl bg-blue-500/5 p-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-[10px] font-bold tracking-wider text-gray-500">STUDENTS</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-blue-400">{feeSummary.studentCount}</p>
            </div>
          </div>

          {/* Student Payment Status */}
          <div className="mt-4 flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-gray-400">{feeSummary.fullyPaidCount} fully paid</span>
            </div>
            {feeSummary.partialCount > 0 && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-gray-400">{feeSummary.partialCount} partial</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              <span className="text-gray-400">{feeSummary.unpaidCount} unpaid</span>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ═══ Activity Timeline ═══ */}
      <SectionCard
        icon={Activity}
        iconColor="bg-cyan-500/10"
        title="Activity Timeline"
        subtitle={`${recentActivity.length} events · ${groupedActivity.length} days`}
        headerRight={
          <div className="flex items-center gap-2">
            {activityFilter && (
              <button
                onClick={() => setActivityFilter("")}
                className="flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-400 transition hover:bg-cyan-500/20"
              >
                <X className="h-3 w-3" /> {activityFilter.replace(/_/g, " ")}
              </button>
            )}
            <div className="relative group">
              <button className="flex items-center gap-1 rounded-md bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 transition hover:bg-white/[0.06]">
                <Filter className="h-3 w-3" /> Filter
              </button>
              <div className="invisible absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-white/10 bg-[#0f1219] p-1.5 shadow-2xl group-hover:visible">
                {actionTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setActivityFilter(type)}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-xs transition ${
                      activityFilter === type ? "bg-cyan-500/10 text-cyan-400" : "text-gray-400 hover:bg-white/[0.05]"
                    }`}
                  >
                    {ACTIVITY_COLORS[type]?.icon || "⚙️"} {type.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
            <Link
              href={`/platform/audit?schoolId=${school.id}`}
              className="flex items-center gap-1 text-[10px] font-semibold text-cyan-400 transition hover:text-cyan-300"
            >
              Full log <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        }
      >
        {groupedActivity.length > 0 ? (
          <div className="space-y-4">
            {groupedActivity.map(({ date, entries }) => (
              <div key={date}>
                {/* Date header */}
                <div className="mb-2 flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-gray-600" />
                  <span className="text-[10px] font-bold tracking-wider text-gray-500">
                    {formatDate(date + "T12:00:00")}
                  </span>
                  <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-gray-600">
                    {entries.length}
                  </span>
                </div>
                {/* Entries */}
                <div className="relative ml-4 border-l border-white/[0.06] pl-4 space-y-1">
                  {entries.map((entry) => {
                    const colors = ACTIVITY_COLORS[entry.action] || ACTIVITY_COLORS.config_change;
                    const isExpanded = expandedActivity === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className="group relative -ml-[17px]"
                      >
                        {/* Timeline dot */}
                        <div className={`absolute left-[-2px] top-3 h-2 w-2 rounded-full ${colors.bg.replace("/10", "/40")} ring-2 ring-[#0f1219]`} />

                        <button
                          onClick={() => setExpandedActivity(isExpanded ? null : entry.id)}
                          className={`w-full rounded-lg px-4 py-3 text-left transition hover:bg-white/[0.015] ${isExpanded ? "bg-white/[0.015]" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm">{colors.icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-300">{entry.description || entry.action.replace(/_/g, " ")}</p>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" /> {entry.actor}
                                </span>
                                <span>·</span>
                                <span>{formatTimeAgo(entry.createdAt)}</span>
                              </div>
                            </div>
                            <ChevronDown className={`h-3.5 w-3.5 text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && entry.meta && (
                          <div className="mx-4 mb-2 rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.05]">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {Object.entries(entry.meta).map(([key, val]) => (
                                <div key={key}>
                                  <span className="text-gray-600">{key.replace(/([A-Z])/g, " $1").toLowerCase()}: </span>
                                  <span className="text-gray-300">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Activity className="mx-auto h-6 w-6 text-gray-700" />
            <p className="mt-2 text-sm text-gray-500">
              {activityFilter ? "No events matching this filter" : "No activity yet"}
            </p>
          </div>
        )}
      </SectionCard>

      {/* ═══ Admin Accounts & Impersonation ═══ */}
      <div className="rounded-xl border border-white/5 bg-[#0f1219]">
        <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
            <Shield className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Admin Accounts</h2>
            <p className="text-xs text-gray-500">Impersonate to troubleshoot or manage</p>
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {admins.map((admin) => (
            <div key={admin.id} className="flex items-center gap-4 px-6 py-4 transition hover:bg-white/[0.02]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white">
                {admin.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{admin.name}</p>
                <p className="text-xs text-gray-500">
                  {admin.email} · <span className="text-gray-400">{admin.role.replace("_", " ")}</span>
                </p>
              </div>
              <button
                onClick={() => handleImpersonate(admin.id)}
                disabled={impersonating !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-400 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {impersonating === admin.id ? (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                ) : (
                  <LogIn className="h-3.5 w-3.5" />
                )}
                {impersonating === admin.id ? "Connecting..." : "Impersonate"}
              </button>
            </div>
          ))}
          {admins.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-gray-500">No admin accounts found</div>
          )}
        </div>
      </div>

      {/* ═══ Class Arms ═══ */}
      {school.activeArms && school.activeArms.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-[#0f1219]">
          <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Layers className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Class Arms</h2>
              <p className="text-xs text-gray-500">{school.activeArms.length} arms configured</p>
            </div>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-2">
              {school.activeArms.map((arm) => {
                const armStudents = students.filter((s) => s.assignedClass === arm);
                return (
                  <div
                    key={arm}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/5"
                  >
                    <span className="text-xs font-medium text-gray-300">{arm}</span>
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-500">
                      {armStudents.length}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowDeleteModal(false); setConfirmStep(1); setConfirmText(""); }} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl">
            {confirmStep === 1 ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                    <Trash2 className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {deleteAction === "purge" ? "Permanently Purge School?" : "Delete School?"}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {deleteAction === "purge"
                        ? "This action cannot be undone"
                        : "School will be recoverable for 30 days"}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4 mb-4">
                  <p className="text-sm text-gray-300">
                    {deleteAction === "purge" ? (
                      <>
                        <span className="font-bold text-red-400">{school.name}</span> and ALL of its data
                        (users, scores, attendance, fees, timetables) will be{" "}
                        <span className="font-bold text-red-400">permanently destroyed</span>.
                        There is no recovery.
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-red-400">{school.name}</span> will be marked as
                        deleted. All users will be logged out immediately. Data stays
                        recoverable for <span className="font-bold text-amber-400">30 days</span>,
                        then is permanently wiped.
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => { setShowDeleteModal(false); setConfirmStep(1); setConfirmText(""); }}
                    className="rounded-lg bg-white/5 px-4 py-2 text-xs font-semibold text-gray-400 transition hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setConfirmStep(2)}
                    className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                      deleteAction === "purge"
                        ? "bg-red-600 text-white hover:bg-red-500"
                        : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    }`}
                  >
                    {deleteAction === "purge" ? "I understand, continue" : "Yes, delete school"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-white mb-2">
                    Type the school name to confirm
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Enter <span className="font-mono font-bold text-red-400">{school.name}</span> below:
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={school.name}
                    className="w-full rounded-xl border border-white/10 bg-[#0a0e17] px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none transition focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && confirmText === school.name) handleDelete();
                    }}
                  />
                </div>
                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => { setConfirmStep(1); setConfirmText(""); }}
                    className="rounded-lg bg-white/5 px-4 py-2 text-xs font-semibold text-gray-400 transition hover:bg-white/10"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={confirmText !== school.name || deleting}
                    className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {deleting ? (
                      <span className="flex items-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Deleting...
                      </span>
                    ) : (
                      deleteAction === "purge" ? "Permanently Delete" : "Delete School"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
}
