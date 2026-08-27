"use client";

import {
  AlertTriangle,
  Banknote,
  BellRing,
  CheckCircle2,
  History,
  Loader2,
  Receipt,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { naira, AuditBadge } from "./utils";
import { useAdminShell } from "./context/AdminContext";
import { useFeeContext } from "./context/FeeContext";

/**
 * Fee Management tab — extracted from admin dashboard page.js.
 * Consumes shared state from AdminContext instead of receiving props.
 */
export default function FeesTab() {
  const {
    isSuper, session,
    confirmPayment, saveFeeStructure,
    setPayModal, setPayForm,
    setReminderModal, setReminderResult, loadReminderTemplates,
    setReconcileModal, setReconcileResult,
  } = useAdminShell();
  const { state: feeState } = useFeeContext();
  const {
    feeTotals, pendingReconciles, pendingPayments, confirmingId,
    feeClass, setFeeClass, feeDefaultersOnly, setFeeDefaultersOnly,
    feeDraft, setFeeDraft, feeLedger, feeSaving, audit,
  } = feeState;
  return (
    <div className="mt-5 animate-fade-up">
                {/* Summary cards */}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    icon={Receipt}
                    label="Total Billed"
                    value={naira(feeTotals?.billed)}
                    sub="Termly fee structures × enrolment"
                    accent="brand"
                  />
                  <MetricCard
                    icon={Banknote}
                    label="Collected"
                    value={naira(feeTotals?.collected)}
                    sub={`${naira(feeTotals?.outstanding)} outstanding`}
                    accent="emerald"
                  />
                  <MetricCard
                    icon={AlertTriangle}
                    label="Defaulters"
                    value={feeTotals?.defaulters ?? 0}
                    sub={`${feeTotals?.paid ?? 0} students fully paid`}
                    accent="amber"
                  />
                  <MetricCard
                    icon={Wallet}
                    label="Collection Rate"
                    value={
                      feeTotals?.billed
                        ? `${Math.round((feeTotals.collected / feeTotals.billed) * 100)}%`
                        : "—"
                    }
                    sub="Amount collected ÷ billed"
                    accent="navy"
                  />
                </div>
  
                {/* Reconcile & forward — reminders that went to the STUDENT (no
                    parent at send time) and can now be pushed to a linked parent. */}
                {pendingReconciles.length > 0 && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/30">
                        <Send className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-sky-900">
                          {pendingReconciles.reduce((a, p) => a + p.reminders.length, 0)} reminder{pendingReconciles.reduce((a, p) => a + p.reminders.length, 0) === 1 ? "" : "s"} can be forwarded to parents
                        </p>
                        <p className="truncate text-xs text-sky-700">
                          These went to the student when no parent was linked — now that a parent exists, send them a copy too.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setReconcileModal(true);
                        setReconcileResult(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-600/30 transition hover:bg-sky-500"
                    >
                      <Send className="h-4 w-4" /> Reconcile &amp; forward
                      <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                        {pendingReconciles.length}
                      </span>
                    </button>
                  </div>
                )}
  
                {/* Payments awaiting confirmation (from the parent portal) */}
                {pendingPayments.length > 0 && (
                  <div className="mt-5 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50/60 px-6 py-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <h2 className="text-lg font-bold text-navy-800">Awaiting your confirmation</h2>
                      </div>
                      <span className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white">
                        {pendingPayments.length} pending
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                            <th className="px-6 py-3">Student</th>
                            <th className="px-6 py-3">Receipt</th>
                            <th className="px-6 py-3">Method</th>
                            <th className="px-6 py-3 text-right">Amount</th>
                            <th className="px-6 py-3">Paid on</th>
                            <th className="px-6 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingPayments.map((p) => (
                            <tr key={p.id} className="border-b border-amber-50 transition hover:bg-amber-50/40">
                              <td className="px-6 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-sm font-bold text-amber-600">
                                    {p.studentName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-navy-800">{p.studentName}</p>
                                    <p className="text-xs text-navy-400">{p.assignedClass || "Unassigned"}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-3.5">
                                <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-bold text-navy-600">
                                  {p.receiptNo}
                                </span>
                              </td>
                              <td className="px-6 py-3.5 text-navy-500">{p.method}</td>
                              <td className="px-6 py-3.5 text-right font-bold text-amber-700">{naira(p.amount)}</td>
                              <td className="px-6 py-3.5 text-navy-500">
                                {new Date(p.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-3.5 text-right">
                                {isSuper ? (
                                  <button
                                    onClick={() => confirmPayment(p.id)}
                                    disabled={confirmingId === p.id}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:opacity-60"
                                  >
                                    {confirmingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                    Confirm
                                  </button>
                                ) : (
                                  <span
                                    title="Only the Super Admin can confirm parent-portal payments"
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-100 px-3.5 py-2 text-xs font-semibold text-navy-500"
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Super Admin only
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-amber-100 bg-amber-50/40 px-6 py-3 text-xs text-amber-700">
                      These payments were initiated from the parent portal and only count toward balances
                      once you confirm the money was received.
                    </div>
                  </div>
                )}
  
                {/* Filters */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 py-2">
                    <Receipt className="h-4 w-4 text-brand-600" />
                    <select
                      value={feeClass}
                      onChange={(e) => setFeeClass(e.target.value)}
                      className="bg-transparent text-sm font-medium text-navy-700 outline-none"
                    >
                      <option value="">All class arms</option>
                      {(session.school?.activeArms || []).map((arm) => (
                        <option key={arm}>{arm}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => setFeeDefaultersOnly((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                      feeDefaultersOnly
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-navy-200 bg-white text-navy-600 hover:border-amber-300"
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {feeDefaultersOnly ? "Showing defaulters" : "Defaulters only"}
                  </button>
                  <button
                    onClick={() => {
                      setReminderModal("all");
                      setReminderResult(null);
                      loadReminderTemplates();
                    }}
                    disabled={(feeTotals?.remindable ?? 0) === 0}
                    title="Send a fee reminder to every parent with an outstanding balance (or unpaid fees)"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BellRing className="h-4 w-4" />
                    Send reminders
                    {(feeTotals?.remindable ?? 0) > 0 && (
                      <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {feeTotals.remindable}
                      </span>
                    )}
                  </button>
                </div>
  
                {/* Fee structures editor */}
                <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                  <div className="border-b border-navy-100 px-6 py-4">
                    <h2 className="text-lg font-bold text-navy-800">Termly fee structures</h2>
                    <p className="text-sm text-navy-400">
                      Set the termly fee per class arm. Students in each arm are billed this amount automatically.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                          <th className="px-6 py-3">Class Arm</th>
                          <th className="px-6 py-3">Termly Fee</th>
                          <th className="px-6 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(session.school?.activeArms || []).map((arm) => (
                          <tr key={arm} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                            <td className="px-6 py-3.5">
                              <span className="font-semibold text-navy-800">{arm}</span>
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-navy-400">₦</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={feeDraft[arm] ?? ""}
                                  disabled={!isSuper}
                                  onChange={(e) => setFeeDraft((d) => ({ ...d, [arm]: e.target.value }))}
                                  placeholder="e.g. 185000"
                                  className="w-40 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-navy-50 disabled:text-navy-400"
                                />
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              {isSuper ? (
                                <button
                                  onClick={() => saveFeeStructure(arm)}
                                  disabled={feeSaving}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
                                >
                                  {feeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  Save
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-navy-100 px-3.5 py-2 text-xs font-semibold text-navy-500">
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Super Admin only
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {(session.school?.activeArms || []).length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-6 py-10 text-center text-navy-400">
                              Configure class arms in the school onboarding first.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
  
                {/* Ledger */}
                <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                  <div className="border-b border-navy-100 px-6 py-4">
                    <h2 className="text-lg font-bold text-navy-800">
                      Fee ledger{feeDefaultersOnly ? " — defaulters" : ""}
                    </h2>
                    <p className="text-sm text-navy-400">
                      Record partial or full payments. Balances update automatically.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                          <th className="px-6 py-3">Student</th>
                          <th className="px-6 py-3">Class</th>
                          <th className="px-6 py-3 text-right">Billed</th>
                          <th className="px-6 py-3 text-right">Paid</th>
                          <th className="px-6 py-3 text-right">Pending</th>
                          <th className="px-6 py-3 text-right">Balance</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feeLedger.map((l) => (
                          <tr key={l.studentId} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-600">
                                  {l.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-navy-800">{l.name}</p>
                                  <p className="text-xs text-navy-400">{l.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-600">
                                {l.assignedClass || "Unassigned"}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-right font-medium text-navy-700">{naira(l.amount)}</td>
                            <td className="px-6 py-3.5 text-right font-semibold text-emerald-600">{naira(l.paid)}</td>
                            <td className="px-6 py-3.5 text-right">
                              {l.pending > 0 ? (
                                <span className="font-semibold text-amber-600">{naira(l.pending)}</span>
                              ) : (
                                <span className="text-navy-200">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <span className={`font-bold ${l.balance > 0 ? "text-amber-600" : "text-navy-300"}`}>
                                {naira(l.balance)}
                              </span>
                              {l.carryover > 0 && (
                                <p className="mt-0.5 text-[10px] font-medium text-violet-600">
                                  includes {naira(l.carryover)} carried from last term
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                                  l.feePaid
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                    : "bg-rose-50 text-rose-700 ring-rose-600/20"
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${l.feePaid ? "bg-emerald-500" : "bg-rose-500"}`} />
                                {l.feePaid ? "Paid" : l.balance > 0 ? "Outstanding" : "Unbilled"}
                              </span>
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center justify-end gap-2">
                                {(l.balance > 0 || (l.amount === 0 && !l.feePaid)) && (
                                  <button
                                    onClick={() => {
                                      setReminderModal(l.studentId);
                                      setReminderResult(null);
                                      loadReminderTemplates();
                                    }}
                                    title={`Send a fee reminder to ${l.name}'s parent`}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3.5 py-2 text-xs font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-100"
                                  >
                                    <BellRing className="h-3.5 w-3.5" />
                                    Remind
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setPayModal(l.studentId);
                                    setPayForm((f) => ({ ...f, amount: l.balance > 0 ? String(l.balance) : "" }));
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-brand-600/30 transition hover:bg-brand-500"
                                >
                                  <Banknote className="h-3.5 w-3.5" />
                                  Record payment
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {feeLedger.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-6 py-12 text-center text-navy-400">
                              No students found{feeDefaultersOnly ? " with outstanding balances" : ""}. Adjust your filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
  
                {/* Audit trail — who did what, and when (reconciliation) */}
                <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                  <div className="border-b border-navy-100 px-6 py-4">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                      <History className="h-5 w-5 text-brand-600" />
                      Audit trail
                    </h2>
                    <p className="text-sm text-navy-400">
                      Every fee action — who did it, and when. Use this to reconcile payments, confirmations and receipts.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                          <th className="px-6 py-3">When</th>
                          <th className="px-6 py-3">Action</th>
                          <th className="px-6 py-3">Who</th>
                          <th className="px-6 py-3">Student</th>
                          <th className="px-6 py-3">Receipt</th>
                          <th className="px-6 py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.map((e) => (
                          <tr key={e.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                            <td className="whitespace-nowrap px-6 py-3.5 text-xs text-navy-500">
                              {new Date(e.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-3.5">
                              <AuditBadge action={e.action} />
                            </td>
                            <td className="px-6 py-3.5">
                              <p className="font-semibold text-navy-800">{e.actorName}</p>
                              <p className="text-xs text-navy-400">
                                {e.actorRole === "PARENT"
                                  ? "Parent portal"
                                  : e.actorRole === "SUPER_ADMIN"
                                    ? "School admin"
                                    : e.actorRole === "BURSAR"
                                      ? "Bursar"
                                      : e.actorRole === "REGISTRAR"
                                        ? "Registrar"
                                        : e.actorRole || "System"}
                              </p>
                            </td>
                            <td className="px-6 py-3.5">
                              {e.studentName ? (
                                <>
                                  <p className="font-medium text-navy-700">{e.studentName}</p>
                                  {e.classArm && <p className="text-xs text-navy-400">{e.classArm}</p>}
                                </>
                              ) : (
                                <span className="text-navy-300">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5">
                              {e.receiptNo ? (
                                <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-bold text-navy-600">
                                  {e.receiptNo}
                                </span>
                              ) : (
                                <span className="text-navy-300">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right font-bold text-navy-800">
                              {e.amount > 0 ? naira(e.amount) : "—"}
                            </td>
                          </tr>
                        ))}
                        {audit.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-navy-400">
                              No fee actions logged yet. Every payment you record or confirm — and every parent
                              payment or receipt download — will appear here.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
  
                <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    <strong>Automatic receipts.</strong> Every recorded payment gets a unique receipt number
                    (e.g. RCT-1001). Partial payments are supported — a student is marked <strong>Paid</strong> only
                    once their balance reaches zero.
                  </p>
                </div>
    </div>
  );
}
