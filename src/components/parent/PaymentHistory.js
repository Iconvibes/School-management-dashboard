"use client";

import { useState, useEffect } from "react";
import { ReceiptText, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const METHOD_COLORS = {
  CARD: "bg-blue-50 text-blue-700",
  TRANSFER: "bg-emerald-50 text-emerald-700",
  USSD: "bg-purple-50 text-purple-700",
  POS: "bg-amber-50 text-amber-700",
  CASH: "bg-navy-50 text-navy-600",
};

/**
 * Payment history timeline for parent dashboard.
 * Shows all fee payments with status, method, and receipt.
 */
export default function PaymentHistory({ studentId, studentName }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const naira = (n) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);

  useEffect(() => {
    loadPayments();
  }, [studentId]);

  async function loadPayments() {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fees/payments?studentId=${studentId}`);
      const data = await res.json();
      setPayments(data.payments || data.entries || []);
    } catch {}
    setLoading(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-navy-400">Loading payment history...</div>;
  }

  const totalPaid = payments
    .filter((p) => p.status === "CONFIRMED")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const pending = payments.filter((p) => p.status === "PENDING");

  return (
    <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-navy-800">
          Payment History · {studentName || "Student"}
        </h3>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          {naira(totalPaid)} paid
        </span>
      </div>

      {payments.length === 0 ? (
        <div className="mt-6 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-navy-300" />
          <p className="mt-2 text-sm text-navy-500">No payments recorded yet.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-0">
          {/* Timeline line */}
          <div className="relative ml-4 border-l-2 border-navy-100 pl-6">
            {payments.map((p, i) => (
              <div key={p.id || i} className="relative pb-6 last:pb-0">
                {/* Timeline dot */}
                <div
                  className={`absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full ${
                    p.status === "CONFIRMED"
                      ? "bg-emerald-100"
                      : p.status === "PENDING"
                      ? "bg-amber-100"
                      : "bg-red-100"
                  }`}
                >
                  {p.status === "CONFIRMED" ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  ) : p.status === "PENDING" ? (
                    <Clock className="h-3 w-3 text-amber-600" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-red-600" />
                  )}
                </div>

                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy-800">{naira(p.amount)}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${METHOD_COLORS[p.method] || METHOD_COLORS.CASH}`}>
                        {p.method || "CASH"}
                      </span>
                      <span className="text-[10px] text-navy-400">
                        {p.receiptNo || "No receipt"}
                      </span>
                    </div>
                    {p.note && (
                      <p className="mt-1 text-xs text-navy-400">{p.note}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-bold ${
                      p.status === "CONFIRMED" ? "text-emerald-600" :
                      p.status === "PENDING" ? "text-amber-600" : "text-red-500"
                    }`}>
                      {p.status}
                    </span>
                    <p className="mt-0.5 text-[10px] text-navy-400">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pending.length > 0 && (
            <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
              {pending.length} payment{pending.length !== 1 ? "s" : ""} pending confirmation from the school.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
