"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import {
  Menu,
  Loader2,
  BookOpen,
  ShieldCheck,
  HeartHandshake,
  Wallet,
  CalendarCheck,
  Trophy,
  FileText,
  CreditCard,
  Users,
  ChevronRight,
  PieChart,
  CheckCircle2,
  ReceiptText,
  BellRing,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ExportMyDataButton from "@/components/ExportMyDataButton";
import RequestErasureButton from "@/components/RequestErasureButton";
import ReportCardModal from "@/components/ReportCardModal";
import ReceiptModal from "@/components/ReceiptModal";
import MessagingPanel from "@/components/MessagingPanel";
import AttendanceCalendar from "@/components/parent/AttendanceCalendar";
import GradeTrends from "@/components/parent/GradeTrends";
import PaymentHistory from "@/components/parent/PaymentHistory";
import ErrorBoundary from "@/components/ErrorBoundary";
import ReportPaymentModal from "@/components/parent/ReportPaymentModal";
import Modal from "@/components/Modal";
import { gradeBadgeClasses, ordinal } from "@/lib/grading";
import { summarizeFamilyFees } from "@/lib/family-fees";
import { bounceToLogin } from "@/lib/auth-client";

const naira = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const METHODS = ["CARD", "TRANSFER", "USSD", "POS", "CASH"];

export default function ParentDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [reportPayload, setReportPayload] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  // Receipts — shown once a payment is confirmed by the school
  const [receiptChild, setReceiptChild] = useState(null);
  // Report Payment flow (bank transfer / cash / POS)
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState(null);
  // Fee reminders from the school (children with outstanding balances)
  const [reminders, setReminders] = useState([]);
  const [toast, setToast] = useState("");
  const [attendanceDetail, setAttendanceDetail] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [showAttendanceDetail, setShowAttendanceDetail] = useState(false);

  // Refetch the children + fee ledger + reminders. Returns the body so
  // callers can inspect it (e.g. pick the first child on first load).
  const refresh = useCallback(async () => {
    const res = await fetch("/api/parent/children");
    const body = await res.json();
    setData(body);
    // Reminders are best-effort — a school reminder can arrive at any time.
    try {
      const rr = await fetch("/api/parent/reminders");
      const rb = await rr.json();
      if (rb.reminders) setReminders(rb.reminders);
    } catch {}
    return body;
  }, []);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meData.user || meData.user.role !== "PARENT") {
        bounceToLogin(router);
        return;
      }
      setSession(meData);
      const body = await refresh();
      if (body.children?.length) setSelectedId(body.children[0].id);
      setLoading(false);
    })();
  }, [router, refresh]);

  // Keep the portal fresh — a school confirmation (and its receipt) can arrive
  // at any time, so refetch when the tab regains focus and on a light poll,
  // mirroring the admin notification bell. Closes the loop without a reload.
  useEffect(() => {
    let alive = true;
    // Tab return fires both `focus` and `visibilitychange`, so dedupe to one
    // fetch per switch.
    let lastRefetch = 0;
    const refetch = () => {
      const now = Date.now();
      if (!alive || now - lastRefetch < 2000) return;
      lastRefetch = now;
      refresh();
    };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", refetch);
    const id = setInterval(refetch, 30000);
    return () => {
      alive = false;
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", refetch);
      clearInterval(id);
    };
  }, [refresh]);

  // Memoized so the family summary's useMemo dependency stays stable.
  const children = useMemo(() => data?.children || [], [data]);
  const selected = children.find((c) => c.id === selectedId) || children[0] || null;
  const brand = data?.school?.brandColor || "#2563EB";

  async function openReport(studentId) {
    setReportLoading(true);
    setReportPayload(null);
    try {
      const res = await fetch(`/api/reports/${studentId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load report");
      setReportPayload(body);
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setReportLoading(false);
    }
  }

  async function loadAttendance(studentId) {
    setAttendanceLoading(true);
    setAttendanceDetail(null);
    try {
      const res = await fetch(`/api/parent/attendance?studentId=${studentId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load attendance");
      setAttendanceDetail(body);
      setShowAttendanceDetail(true);
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setAttendanceLoading(false);
    }
  }

  function openPay(child) {
    // Called from the selected child's card (no arg) or from the family
    // summary rows (any child). The target is captured in its own state so
    // the modal always pays for exactly the child it was opened for, even if
    // the selection behind it changes.
    const target = child || selected;
    if (!target) return;
    setPayTarget(target);
    setSelectedId(target.id);
    setPayResult(null);
    setPayOpen(true);
  }

  async function submitPayment(paymentData) {
    if (!payTarget) return;
    setPaying(true);
    try {
      const res = await fetch("/api/parent/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: payTarget.id,
          amount: paymentData.amount,
          method: paymentData.method,
          bankReference: paymentData.bankReference,
          datePaid: paymentData.datePaid,
          note: paymentData.note,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Payment report failed");
      setPayResult(body.payment);
      await refresh();
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setPaying(false);
    }
  }

  const summary = useMemo(() => {
    if (!selected) return null;
    const avg = selected.average || 0;
    const standing = avg >= 70 ? "Distinction" : avg >= 60 ? "Very Good" : avg >= 50 ? "Good" : avg >= 40 ? "Credit" : "Needs Support";
    return { avg, standing };
  }, [selected]);

  // Combined balance across every linked child — the family-level view.
  const feeSummary = useMemo(() => summarizeFamilyFees(children), [children]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar role="PARENT" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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
            {session?.school?.logoUrl && (
              <img
                src={session.school.logoUrl}
                alt=""
                className="h-7 w-7 shrink-0 rounded-lg bg-white object-contain ring-1 ring-navy-100"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy-800">{session?.school?.name}</p>
              <p className="truncate text-xs text-navy-400">
                {session?.school?.currentSession} · {session?.school?.currentTerm}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 sm:flex">
              <HeartHandshake className="h-3.5 w-3.5" /> Parent
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              {session.user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-8">
          {children.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-navy-200 bg-white p-14 text-center">
              <Users className="mx-auto h-10 w-10 text-navy-300" />
              <h2 className="mt-4 text-lg font-bold text-navy-800">No children linked yet</h2>
              <p className="mt-2 max-w-md mx-auto text-sm text-navy-400">
                Your school&apos;s admin will link your child&apos;s account to this
                parent portal. Once linked, report cards, attendance and fee
                balances will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Fee reminders from the school — children with outstanding balances */}
              {reminders.length > 0 && (
                <div className="mb-5 animate-fade-up rounded-2xl border border-violet-200 bg-violet-50 p-5">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-5 w-5 text-violet-600" />
                    <h2 className="text-sm font-bold text-violet-800">
                      {reminders.length} fee reminder{reminders.length === 1 ? "" : "s"} from the school
                    </h2>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {reminders.map((r) => (
                      <div key={r.id} className="rounded-xl border border-violet-100 bg-white p-3.5">
                        <p className="text-sm font-bold text-navy-800">{r.subject}</p>
                        <p className="mt-0.5 text-xs text-navy-500">{r.preview}</p>
                        <p className="mt-1 text-[11px] text-navy-400">
                          {new Date(r.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-violet-600/80">
                    You can clear these balances with Pay Now below — the school confirms each payment.
                  </p>
                </div>
              )}

              {/* Family balance — combined across all linked children */}
              <div className="animate-fade-up overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-800 to-emerald-600 text-white shadow-xl">
                <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                <div className="relative p-6 sm:p-8">
                  <div className="flex flex-wrap items-end justify-between gap-5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                        <PieChart className="h-4 w-4" />
                        Family balance · {feeSummary.children} linked child{feeSummary.children === 1 ? "" : "ren"}
                      </p>
                      <p className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
                        {naira(feeSummary.balance)}
                      </p>
                      <p className="mt-2 text-sm text-emerald-100/90">
                        {feeSummary.withBalance === 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" /> All children are fully paid for this term
                          </span>
                        ) : (
                          <>
                            {feeSummary.withBalance} of {feeSummary.children} child
                            {feeSummary.children === 1 ? "" : "ren"} still{" "}
                            {feeSummary.withBalance === 1 ? "has" : "have"} an outstanding balance
                          </>
                        )}
                      </p>
                    </div>

                    {/* Stat tiles */}
                    <div className="grid grid-cols-3 gap-3 text-right">
                      {[
                        { label: "Total billed", value: naira(feeSummary.billed) },
                        { label: "Paid", value: naira(feeSummary.paid) },
                        { label: "Awaiting confirmation", value: naira(feeSummary.pending) },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur"
                        >
                          <p className="text-lg font-extrabold leading-tight">{s.value}</p>
                          <p className="mt-0.5 text-[11px] font-medium text-emerald-100/80">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Per-child rows — manage every payment from one view */}
                  <div className="mt-6 overflow-hidden rounded-xl bg-black/20 ring-1 ring-white/10">
                    {children.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-white/5"
                      >
                        <button
                          onClick={() => setSelectedId(c.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          title={`View ${c.name}`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold ring-1 ring-white/20">
                            {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{c.name}</span>
                            <span className="block truncate text-xs text-emerald-100/70">
                              {c.assignedClass || "Unassigned"}
                            </span>
                          </span>
                        </button>

                        {c.fee.pending > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/90 px-2.5 py-1 text-[11px] font-bold text-amber-950">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {naira(c.fee.pending)} pending
                          </span>
                        )}

                        {c.receipts?.length > 0 && (
                          <button
                            onClick={() => setReceiptChild(c)}
                            title={`${c.receipts.length} receipt${c.receipts.length === 1 ? "" : "s"} available`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white ring-1 ring-white/25 transition hover:bg-white/25"
                          >
                            <ReceiptText className="h-3 w-3" />
                            Receipt{c.receipts.length > 1 ? `s (${c.receipts.length})` : ""}
                          </button>
                        )}

                        <div className="text-right">
                          <p className={`text-sm font-extrabold ${c.fee.balance > 0 ? "text-white" : "text-emerald-200"}`}>
                            {c.fee.balance > 0 ? naira(c.fee.balance) : "Paid ✓"}
                          </p>
                          <p className="text-[11px] text-emerald-100/80">
                            {naira(c.fee.paid)} of {naira(c.fee.amount)}
                          </p>
                        </div>

                        <button
                          onClick={() => openPay(c)}
                          disabled={c.fee.balance <= 0 || c.fee.pending > 0}
                          title={c.fee.pending > 0 ? "Awaiting school confirmation" : c.fee.balance <= 0 ? "Fully paid" : "Pay now"}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3.5 py-2 text-xs font-bold text-emerald-950 shadow-md shadow-black/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-emerald-100/40"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          Pay
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Child selector */}
              <div className="mt-6 flex flex-wrap gap-3">
                {children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      selectedId === c.id
                        ? "border-brand-300 bg-white shadow-lg shadow-brand-600/10"
                        : "border-navy-200/70 bg-white/60 hover:border-brand-200 hover:bg-white"
                    }`}
                  >
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: brand }}
                    >
                      {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-navy-800">{c.name}</span>
                      <span className="block text-xs text-navy-400">{c.assignedClass || "Unassigned"}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-navy-300" />
                  </button>
                ))}
              </div>

              {selected && (
                <div className="mt-6 animate-fade-up">
                  {/* Banner */}
                  <div
                    className="relative overflow-hidden rounded-2xl p-8 text-white shadow-xl"
                    style={{ background: `linear-gradient(135deg, #0f172a 0%, ${brand} 130%)` }}
                  >
                    <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                    <div className="relative flex flex-wrap items-center gap-6">
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-extrabold shadow-lg"
                        style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }}
                      >
                        {selected.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <h1 className="text-2xl font-extrabold tracking-tight">{selected.name}</h1>
                        <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-navy-200">
                          <span className="inline-flex items-center gap-1.5">
                            <BookOpen className="h-4 w-4" /> {selected.assignedClass || "Unassigned class"}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Trophy className="h-4 w-4" />{" "}
                            {selected.position
                              ? `${ordinal(selected.position)} of ${selected.outOf}`
                              : "No rank yet"}
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold ring-1 ring-white/25">
                          <Trophy className="h-4 w-4" /> {summary?.standing}
                        </span>
                        <p className="mt-2 text-xs text-navy-200">
                          {selected.subjects} subjects · Avg {selected.average}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stat cards */}
                  <div className="mt-6 grid gap-5 lg:grid-cols-3">
                    {/* Report card */}
                    <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-brand-600" />
                        <h2 className="font-bold text-navy-800">Report card</h2>
                      </div>
                      <p className="mt-2 text-3xl font-extrabold text-navy-800">{selected.average}%</p>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-navy-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, selected.average)}%`,
                            background: `linear-gradient(to right, ${brand}, ${brand}cc)`,
                          }}
                        />
                      </div>
                      {selected.grade && (
                        <span className={`mt-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-base font-bold ring-1 ${gradeBadgeClasses(selected.grade)}`}>
                          {selected.grade}
                        </span>
                      )}
                      <button
                        onClick={() => openReport(selected.id)}
                        disabled={reportLoading}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
                      >
                        {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                        View report card
                      </button>
                    </div>

                    {/* Fee balance + Pay Now */}
                    <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-emerald-600" />
                        <h2 className="font-bold text-navy-800">Fee balance</h2>
                      </div>
                      <p className="mt-2 text-3xl font-extrabold text-navy-800">{naira(selected.fee.balance)}</p>
                      <p className="mt-1 text-sm text-navy-400">
                        {selected.fee.feePaid
                          ? "Fully paid for this term ✓"
                          : `${naira(selected.fee.paid)} paid of ${naira(selected.fee.amount)}`}
                      </p>
                      {selected.fee.pending > 0 && (
                        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {naira(selected.fee.pending)} awaiting school confirmation
                        </p>
                      )}
                      <button
                        onClick={() => openPay()}
                        disabled={selected.fee.balance <= 0 || selected.fee.pending > 0}
                        title={selected.fee.pending > 0 ? "Awaiting school confirmation" : selected.fee.balance <= 0 ? "Fully paid" : "Report payment"}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <CreditCard className="h-4 w-4" />
                        Report Payment
                      </button>
                      {selected.fee.pending > 0 && (
                        <p className="mt-2 text-center text-[11px] text-navy-400">
                          Balance updates once the school confirms your payment.
                        </p>
                      )}

                      {/* Receipt available — the school confirmed the payment */}
                      {selected.receipts?.length > 0 && (
                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                          <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                            <ReceiptText className="h-4 w-4" />
                            Receipt available
                            {selected.receipts.length > 1 && ` (${selected.receipts.length})`}
                          </p>
                          <p className="mt-0.5 text-[11px] text-emerald-600/80">
                            {selected.fee.feePaid
                              ? "Your payment has been confirmed by the school."
                              : "Your payment has been confirmed — download the official receipt."}
                          </p>
                          <button
                            onClick={() => setReceiptChild(selected)}
                            className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition hover:bg-emerald-500"
                          >
                            <ReceiptText className="h-3.5 w-3.5" />
                            View receipt
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Attendance */}
                    <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
                      <div className="flex items-center gap-2">
                        <CalendarCheck className="h-5 w-5 text-amber-600" />
                        <h2 className="font-bold text-navy-800">Attendance</h2>
                      </div>
                      <p className="mt-2 text-3xl font-extrabold text-navy-800">
                        {selected.attendance.present}
                        <span className="text-base font-semibold text-navy-400"> / {selected.attendance.total} days</span>
                      </p>
                      <p className="mt-1 text-sm text-navy-400">
                        {selected.attendance.absent > 5
                          ? `${selected.attendance.absent} days absent — please check in with the school`
                          : "Good attendance this term"}
                      </p>
                      <button
                        onClick={() => loadAttendance(selected.id)}
                        disabled={attendanceLoading}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-navy-200 bg-white py-2.5 text-sm font-semibold text-navy-700 transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-60"
                      >
                        <CalendarCheck className="h-4 w-4" />
                        {attendanceLoading ? "Loading..." : "View daily attendance"}
                      </button>
                    </div>
                  </div>


                  {/* Payment history */}
                  {selected.payments && selected.payments.length > 0 && (
                    <div className="mt-6 rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                      <div className="border-b border-navy-100 px-6 py-4">
                        <div className="flex items-center gap-2">
                          <ReceiptText className="h-5 w-5 text-brand-600" />
                          <h2 className="font-bold text-navy-800">Payment history</h2>
                        </div>
                        <p className="mt-0.5 text-sm text-navy-400">
                          All payments for {selected.name} this term
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                              <th className="px-6 py-3">Date</th>
                              <th className="px-6 py-3">Receipt</th>
                              <th className="px-6 py-3">Method</th>
                              <th className="px-6 py-3 text-right">Amount</th>
                              <th className="px-6 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.payments.map((p) => (
                              <tr key={p.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                                <td className="px-6 py-3.5 text-navy-600">
                                  {new Date(p.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-3.5">
                                  <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-bold text-navy-600">
                                    {p.receiptNo}
                                  </span>
                                </td>
                                <td className="px-6 py-3.5 text-navy-500">{p.method}</td>
                                <td className="px-6 py-3.5 text-right font-bold text-navy-800">{naira(p.amount)}</td>
                                <td className="px-6 py-3.5">
                                  {p.status === "PENDING" ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
                                      Pending
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                      Confirmed
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Attendance detail */}
                  {showAttendanceDetail && attendanceDetail && (
                    <div className="mt-6 rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                      <div className="border-b border-navy-100 px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CalendarCheck className="h-5 w-5 text-amber-600" />
                            <h2 className="font-bold text-navy-800">Daily attendance</h2>
                          </div>
                          <button
                            onClick={() => setShowAttendanceDetail(false)}
                            className="text-sm font-semibold text-navy-400 transition hover:text-navy-600"
                          >
                            Close
                          </button>
                        </div>
                        <p className="mt-0.5 text-sm text-navy-400">
                          {attendanceDetail.summary.present} present / {attendanceDetail.summary.absent} absent / {attendanceDetail.summary.total} days
                        </p>
                      </div>
                      <div className="p-6">
                        {attendanceDetail.records.length === 0 ? (
                          <p className="text-center text-sm text-navy-400">No attendance records yet this term.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                            {attendanceDetail.records.map((r) => (
                              <div
                                key={r.date}
                                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                                  r.present
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-rose-200 bg-rose-50 text-rose-700"
                                }`}
                              >
                                <span className={`h-2 w-2 rounded-full ${r.present ? "bg-emerald-500" : "bg-rose-500"}`} />
                                <span className="font-medium">
                                  {new Date(r.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                </span>
                                <span className="ml-auto text-xs font-bold">
                                  {r.present ? "P" : "A"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Subjects */}
                  {reportPayload && reportPayload.student?.id === selected.id && (
                    <div className="mt-5 hidden">{/* subject breakdown is inside the modal */}</div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Messaging */}
          <div className="mt-8">
            <ErrorBoundary label="Messaging">
              <MessagingPanel session={session} />
            </ErrorBoundary>
          </div>

          {/* GDPR: Data export */}
          <div className="mt-6 flex items-center justify-between rounded-xl border border-navy-200/70 bg-white px-5 py-3.5 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-navy-800">Your data rights</p>
              <p className="text-xs text-navy-400">
                Download a copy of your personal data (GDPR Art. 15).{' '}
                <a href="/privacy" className="underline transition hover:text-brand-600">Privacy Policy</a>
              </p>
            </div>
            <ExportMyDataButton className="!bg-navy-100 !text-navy-700 hover:!bg-navy-200" />
          </div>

          {/* GDPR: Erasure request */}
          <div className="mt-3 flex items-center justify-between rounded-xl border border-navy-200/70 bg-white px-5 py-3.5 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-navy-800">Right to erasure</p>
              <p className="text-xs text-navy-400">
                Request permanent deletion of your data (GDPR Art. 17).
              </p>
            </div>
            <RequestErasureButton className="!bg-navy-100 !text-navy-700 hover:!bg-navy-200" />
          </div>

          {/* Parent dashboard enhancements */}
          {selected && (
            <ErrorBoundary label="Analytics">
              <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <AttendanceCalendar studentId={selected.id} studentName={selected.name} />
                <GradeTrends studentId={selected.id} studentName={selected.name} />
                <PaymentHistory studentId={selected.id} studentName={selected.name} />
              </div>
            </ErrorBoundary>
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

      {/* Receipt modal — download the official receipt after confirmation */}
      <ReceiptModal
        key={receiptChild?.id || "none"}
        open={receiptChild !== null}
        onClose={() => setReceiptChild(null)}
        school={data?.school}
        student={
          receiptChild
            ? { id: receiptChild.id, name: receiptChild.name, assignedClass: receiptChild.assignedClass }
            : null
        }
        receipts={receiptChild?.receipts || []}
        balance={receiptChild?.fee?.balance ?? 0}
        fileName={receiptChild?.name?.toLowerCase().replace(/[^a-z]+/g, "-")}
      />


      {/* Report Payment modal */}
      <ReportPaymentModal
        open={payOpen}
        onClose={() => { setPayOpen(false); setPayResult(null); }}
        school={data?.school}
        student={payTarget}
        onSubmit={submitPayment}
        submitting={paying}
      />

      {/* Payment submitted confirmation */}
      {payResult && !payOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-navy-800">Payment reported</h3>
            <p className="mt-1 text-sm text-navy-500">
              {naira(payResult.amount)} reported for {payTarget?.name}.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
              Awaiting school confirmation
            </p>
            <p className="mt-3 text-xs text-navy-400">
              Your balance will update once the school confirms this payment.
            </p>
            <button
              onClick={() => setPayResult(null)}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
            >
              Done
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
