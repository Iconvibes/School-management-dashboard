"use client";

import { useState } from "react";
import { CreditCard, Building2, Send, Loader2, CheckCircle2, Copy, Check } from "lucide-react";

const METHODS = ["TRANSFER", "CASH", "POS", "USSD"];

/**
 * Report Payment modal for parent dashboard.
 * Shows school bank account details and lets parents report that they've
 * made a payment. Admin/bursar then confirms the payment.
 */
export default function ReportPaymentModal({ open, onClose, school, student, onSubmit, submitting }) {
  const [form, setForm] = useState({
    amount: "",
    method: "TRANSFER",
    bankReference: "",
    datePaid: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const [copied, setCopied] = useState(null);

  if (!open || !student) return null;

  const naira = (n) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);

  const bank = school?.bankDetails || {};
  const hasBankDetails = bank.bankName && bank.accountNumber;

  function copyToClipboard(text, field) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) return;
    await onSubmit({
      studentId: student.id,
      amount: Number(form.amount),
      method: form.method,
      bankReference: form.bankReference,
      datePaid: form.datePaid,
      note: form.note,
    });
    setForm({ amount: "", method: "TRANSFER", bankReference: "", datePaid: new Date().toISOString().slice(0, 10), note: "" });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy-800">Report Payment</h2>
            <p className="text-sm text-navy-400">for {student.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100">✕</button>
        </div>

        {/* Outstanding balance */}
        <div className="mt-4 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
          <p className="text-xs text-navy-400">Outstanding balance</p>
          <p className="text-xl font-extrabold text-navy-800">{naira(student.fee?.balance || 0)}</p>
        </div>

        {/* School bank details */}
        {hasBankDetails && (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-brand-600" />
              <p className="text-xs font-bold text-brand-700">School Account Details</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-navy-500">Bank</span>
                <span className="text-sm font-semibold text-navy-800">{bank.bankName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-navy-500">Account Name</span>
                <span className="text-sm font-semibold text-navy-800">{bank.accountName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-navy-500">Account Number</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-navy-800 font-mono">{bank.accountNumber}</span>
                  <button
                    onClick={() => copyToClipboard(bank.accountNumber, "account")}
                    className="rounded p-1 text-brand-500 hover:bg-brand-100"
                  >
                    {copied === "account" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              {bank.sortCode && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-navy-500">Sort Code</span>
                  <span className="text-sm font-semibold text-navy-800 font-mono">{bank.sortCode}</span>
                </div>
              )}
            </div>
            {bank.otherInstructions && (
              <p className="mt-3 text-xs text-brand-600">{bank.otherInstructions}</p>
            )}
          </div>
        )}

        {!hasBankDetails && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-center">
            <p className="text-xs text-amber-700">School bank details not configured. Contact the school office for payment instructions.</p>
          </div>
        )}

        {/* Payment report form */}
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Amount (₦)</span>
            <input
              type="number"
              min={1}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="e.g. 50000"
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Payment Method</span>
            <select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          {form.method === "TRANSFER" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">Bank Reference / Transaction ID</span>
              <input
                value={form.bankReference}
                onChange={(e) => setForm({ ...form, bankReference: e.target.value })}
                placeholder="e.g. GTB-20250106-12345"
                className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              <p className="mt-1 text-[11px] text-navy-400">The reference from your bank transfer receipt helps the school match your payment.</p>
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Date Paid</span>
            <input
              type="date"
              value={form.datePaid}
              onChange={(e) => setForm({ ...form, datePaid: e.target.value })}
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Note (optional)</span>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. Part payment for first term"
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.amount || Number(form.amount) <= 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? "Submitting..." : "Report Payment"}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-navy-200 px-6 py-3 text-sm font-semibold text-navy-600 transition hover:bg-navy-50"
          >
            Cancel
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-navy-400">
          Your payment will appear as &quot;Pending&quot; until the school confirms it. The balance updates automatically once confirmed.
        </p>
      </div>
    </div>
  );
}
