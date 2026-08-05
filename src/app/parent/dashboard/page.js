"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ReportCardModal from "@/components/ReportCardModal";
import Modal from "@/components/Modal";
import { gradeBadgeClasses, ordinal } from "@/lib/grading";

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
  // Pay Now flow
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", method: "CARD" });
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meData.user || meData.user.role !== "PARENT") {
        router.replace("/login");
        return;
      }
      setSession(meData);
      const res = await fetch("/api/parent/children");
      const body = await res.json();
      setData(body);
      if (body.children?.length) setSelectedId(body.children[0].id);
      setLoading(false);
    })();
  }, [router]);

  const children = data?.children || [];
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

  function openPay() {
    if (!selected) return;
    setPayForm({ amount: selected.fee.balance > 0 ? String(selected.fee.balance) : "", method: "CARD" });
    setPayResult(null);
    setPayOpen(true);
  }

  async function submitPay() {
    if (!selected) return;
    setPaying(true);
    try {
      const res = await fetch("/api/parent/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: selected.id, ...payForm }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Payment failed");
      setPayResult(body.payment);
      // Refresh children data
      const r2 = await fetch("/api/parent/children");
      setData(await r2.json());
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

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-navy-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar role="PARENT" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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
              <p className="text-sm font-bold text-navy-800">My Children</p>
              <p className="text-xs text-navy-400">
                {data?.school?.currentSession} · {data?.school?.currentTerm}
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
              {/* Child selector */}
              <div className="flex flex-wrap gap-3">
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
                        onClick={openPay}
                        disabled={selected.fee.balance <= 0}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <CreditCard className="h-4 w-4" />
                        Pay Now
                      </button>
                      {selected.fee.pending > 0 && (
                        <p className="mt-2 text-center text-[11px] text-navy-400">
                          Balance updates once the school confirms your payment.
                        </p>
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
                    </div>
                  </div>

                  {/* Subjects */}
                  {reportPayload && reportPayload.student?.id === selected.id && (
                    <div className="mt-5 hidden">{/* subject breakdown is inside the modal */}</div>
                  )}
                </div>
              )}
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

      {/* Pay Now modal */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Pay Now — ${selected?.name || ""}`}>
        {payResult ? (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-navy-800">Payment submitted</h3>
            <p className="mt-1 text-sm text-navy-500">
              {naira(payResult.amount)} sent for {selected?.name} — the school will
              confirm it before it clears.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
              Receipt: {payResult.receiptNo} · Awaiting confirmation
            </p>
            <button
              onClick={() => {
                setPayOpen(false);
                setPayResult(null);
              }}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
              <p className="text-xs text-navy-400">Outstanding balance</p>
              <p className="text-xl font-extrabold text-navy-800">{naira(selected?.fee.balance)}</p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">Amount (₦)</span>
              <input
                type="number"
                min={0}
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                placeholder="e.g. 185000"
                className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">Payment method</span>
              <select
                value={payForm.method}
                onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <button
              onClick={submitPay}
              disabled={paying || !payForm.amount}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
              {paying ? "Processing…" : "Pay now"}
            </button>
            <p className="text-center text-xs text-navy-400">
              A receipt is generated automatically. Payments clear only after the
              school confirms receipt. (Demo — no real charge.)
            </p>
          </div>
        )}
      </Modal>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}
