"use client";

import { Loader2, Banknote } from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";
import { useFeeContext } from "@/components/admin/context/FeeContext";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Record fee payment modal — manually record a cash/card/transfer payment.
 */
export default function FeePaymentModal() {
  const {
    recordPayment,
  } = useAdminShell();
  const { state: feeState } = useFeeContext();
  const {
    payModal, setPayModal, payForm, setPayForm, feeLedger, feeSaving,
  } = feeState;

  return (
    <Modal
      open={payModal !== null}
      onClose={() => setPayModal(null)}
      title="Record fee payment"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-sm">
          {feeLedger.find((l) => l.studentId === payModal)?.name && (
            <p className="font-bold text-navy-800">
              {feeLedger.find((l) => l.studentId === payModal)?.name}
            </p>
          )}
          <p className="text-xs text-navy-400">
            A receipt number is generated automatically for every payment.
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">
            Amount (₦)
          </span>
          <input
            type="number"
            min={0}
            value={payForm.amount}
            onChange={(e) =>
              setPayForm({ ...payForm, amount: e.target.value })
            }
            placeholder="e.g. 185000"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">
            Payment method
          </span>
          <select
            value={payForm.method}
            onChange={(e) =>
              setPayForm({ ...payForm, method: e.target.value })
            }
            className={inputCls}
          >
            {["CASH", "TRANSFER", "CARD", "POS", "USSD", "OTHER"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">
            Note (optional)
          </span>
          <input
            value={payForm.note}
            onChange={(e) =>
              setPayForm({ ...payForm, note: e.target.value })
            }
            placeholder="e.g. Part payment — tuition only"
            className={inputCls}
          />
        </label>
        <button
          onClick={recordPayment}
          disabled={feeSaving || !payForm.amount}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
        >
          {feeSaving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Banknote className="h-5 w-5" />
          )}
          Record payment
        </button>
      </div>
    </Modal>
  );
}
