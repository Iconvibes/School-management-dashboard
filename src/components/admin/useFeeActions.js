"use client";

import {
  DEFAULT_REMINDER_MESSAGE,
  DEFAULT_STUDENT_REMINDER_MESSAGE,
} from "@/lib/notifications";

/**
 * Fee + reminder + reconcile actions — extracted from useAdminActions.js
 * (file-hygiene split). Receives the fee/reminder state setters from the
 * caller and returns the action functions; signatures are unchanged.
 */
export default function useFeeActions({
  showToast,
  safeFetch,
  feeClass,
  feeDefaultersOnly,
  setFeeLedger,
  setFeeTotals,
  setPendingPayments,
  setStats,
  setAudit,
  setConfirmingId,
  setFeeSaving,
  feeDraft,
  setFeeStructures,
  payModal,
  setPayModal,
  payForm,
  setPayForm,
  reminderMessage,
  setReminderMessage,
  reminderStudentMessage,
  setReminderStudentMessage,
  setReminderSending,
  setReminderResult,
  setReconcileSending,
  setReconcileResult,
  setPendingReconciles,
}) {
  // ---- Fee helpers ---------------------------------------------------------
  async function refreshFeeData() {
    const params = new URLSearchParams();
    if (feeClass) params.set("classArm", feeClass);
    if (feeDefaultersOnly) params.set("defaulters", "1");
    try {
      const [lr, sr, ar] = await Promise.all([
        fetch(`/api/fees?${params}`),
        fetch("/api/admin/stats"),
        fetch("/api/fees/audit"),
      ]);
      const ld = await lr.json();
      setFeeLedger(ld.ledger || []);
      setFeeTotals(ld.totals || null);
      setPendingPayments(ld.pendingPayments || []);
      const sd = await sr.json();
      setStats(sd.stats);
      const ad = await ar.json();
      setAudit(ad.entries || []);
    } catch {
      // Best-effort refresh — don't throw from a helper.
    }
  }

  // ---- Fee actions ---------------------------------------------------------

  async function confirmPayment(id) {
    setConfirmingId(id);
    try {
      const res = await safeFetch("/api/fees/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        syncType: "fee-confirm",
        description: `Confirm payment ${id}`,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to confirm payment");
      if (data.offline) {
        showToast(`Payment queued — will confirm when online`);
      } else {
        showToast(`Payment confirmed — balance updated`);
        await refreshFeeData();
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      setConfirmingId(null);
    }
  }

  async function saveFeeStructure(classArm) {
    setFeeSaving(true);
    try {
      const res = await safeFetch("/api/fees/structures", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classArm, amount: feeDraft[classArm] }),
        syncType: "fee-structure",
        description: `Fee structure ${classArm}`,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save fee structure");
      if (data.offline) {
        showToast(`Fee update for ${classArm} queued — will sync when online`);
      } else {
        setFeeStructures((prev) => {
          const existing = prev.find((s) => s.classArm === classArm);
          return existing
            ? prev.map((s) => (s.classArm === classArm ? data.structure : s))
            : [...prev, data.structure];
        });
        await refreshFeeData();
        showToast(`Fee for ${classArm} updated`);
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      setFeeSaving(false);
    }
  }

  async function recordPayment() {
    if (!payModal) return;
    setFeeSaving(true);
    try {
      const res = await safeFetch("/api/fees/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: payModal, ...payForm }),
        syncType: "fee-payment",
        description: `Record payment for student ${payModal}`,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record payment");
      if (data.offline) {
        showToast(`Payment queued — will record when online`);
      } else {
        showToast(`Payment recorded · ${data.payment.receiptNo}`);
      }
      setPayModal(null);
      setPayForm({ amount: "", method: "CASH", note: "" });
      if (!data.offline) await refreshFeeData();
    } catch (err) {
      showToast(err.message);
    } finally {
      setFeeSaving(false);
    }
  }

  // ---- Reminder actions ----------------------------------------------------

  async function loadReminderTemplates() {
    try {
      const res = await fetch("/api/school/reminder-templates");
      if (!res.ok) return;
      const { templates } = await res.json();
      setReminderMessage(
        (templates?.parent && String(templates.parent).trim()) || DEFAULT_REMINDER_MESSAGE
      );
      setReminderStudentMessage(
        (templates?.student && String(templates.student).trim()) || DEFAULT_STUDENT_REMINDER_MESSAGE
      );
    } catch {
      // Keep the current wording on any failure — never blank the modal.
    }
  }

  async function sendReminders(scope) {
    setReminderSending(true);
    setReminderResult(null);
    const batchId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const res = await safeFetch("/api/fees/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(scope === "all" ? {} : { studentIds: [scope] }),
          message: reminderMessage,
          messageStudent: reminderStudentMessage,
          batchId,
        }),
        syncType: "fee-reminder",
        description: `Fee reminder to ${scope === "all" ? "all students" : scope}`,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reminders");
      setReminderResult(data);
      if (data.sent?.length > 0) {
        showToast(
          `Reminder${data.sent.length === 1 ? "" : "s"} sent to ${data.sent.length} parent${data.sent.length === 1 ? "" : "s"} — wording saved as this school's default`
        );
      }
      const ar = await fetch("/api/fees/audit");
      setAudit((await ar.json()).entries || []);
    } catch (err) {
      showToast(err.message);
    } finally {
      setReminderSending(false);
    }
  }

  async function reconcileAndForward() {
    setReconcileSending(true);
    setReconcileResult(null);
    try {
      const res = await fetch("/api/fees/reconcile", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to forward reminders");
      setReconcileResult(data);
      const n = data.forwarded?.length ?? 0;
      if (n > 0) {
        showToast(
          `Forwarded ${data.forwarded.reduce((a, f) => a + (f.remindersForwarded || 0), 0)} reminder${data.forwarded.reduce((a, f) => a + (f.remindersForwarded || 0), 0) === 1 ? "" : "s"} to ${n} parent${n === 1 ? "" : "s"}`
        );
      }
      setPendingReconciles((prev) =>
        prev.filter((p) => !data.forwarded?.some((f) => f.studentId === p.studentId))
      );
      const ar = await fetch("/api/fees/audit");
      setAudit((await ar.json()).entries || []);
    } catch (err) {
      showToast(err.message);
    } finally {
      setReconcileSending(false);
    }
  }

  return {
    refreshFeeData,
    confirmPayment,
    saveFeeStructure,
    recordPayment,
    loadReminderTemplates,
    sendReminders,
    reconcileAndForward,
  };
}
