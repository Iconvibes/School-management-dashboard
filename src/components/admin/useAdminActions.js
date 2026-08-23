"use client";

import { useCallback, useMemo, useRef } from "react";
import { getSubjects, TERMS } from "@/lib/grading";
import {
  DEFAULT_PERIOD_TIMES,
  getBreakTime,
  getDayTimeline,
  getPeriodTimes,
  MAX_PERIOD,
  slotConflictReasons,
} from "@/lib/timetable";
import { payrollToggleDelta, negateToggleDelta } from "@/lib/toggles";
import {
  DEFAULT_REMINDER_MESSAGE,
  DEFAULT_STUDENT_REMINDER_MESSAGE,
} from "@/lib/notifications";
import { warn } from "@/lib/log";
import { sparklinePoints } from "@/lib/conflict-scan";

/**
 * All admin dashboard action functions + derived computed values.
 *
 * Receives the full state (setters included) from page.js and returns
 * every action function plus the memoised values derived from state.
 * This keeps page.js as a thin layout shell: state declarations → this hook → JSX.
 */
export default function useAdminActions({
  // Session & core
  session,
  setSession,
  stats,
  setStats,
  showToast,
  // Roster
  teachers,
  setTeachers,
  students,
  setStudents,
  parents,
  setParents,
  // Navigation
  tab,
  setTab,
  router,
  // Modal state
  modal,
  setModal,
  setFreezeModal,
  // Form state
  form,
  setForm,
  saving,
  setSaving,
  editingUser,
  setEditingUser,
  createdUserDisplay,
  setCreatedUserDisplay,
  // Fee state
  feeStructures,
  setFeeStructures,
  feeLedger,
  setFeeLedger,
  feeTotals,
  setFeeTotals,
  pendingPayments,
  setPendingPayments,
  audit,
  setAudit,
  feeClass,
  setFeeClass,
  feeDefaultersOnly,
  feeDraft,
  setFeeDraft,
  feeSaving,
  setFeeSaving,
  confirmingId,
  setConfirmingId,
  // Payment modal
  payModal,
  setPayModal,
  payForm,
  setPayForm,
  // Reminder state
  reminderModal,
  setReminderModal,
  reminderSending,
  setReminderSending,
  reminderResult,
  setReminderResult,
  reminderMessage,
  setReminderMessage,
  reminderStudentMessage,
  setReminderStudentMessage,
  // Reconcile
  pendingReconciles,
  setPendingReconciles,
  reconcileSending,
  setReconcileSending,
  reconcileResult,
  setReconcileResult,
  // User CRUD
  deleteTarget,
  setDeleteTarget,
  deletingUser,
  setDeletingUser,
  resetTarget,
  setResetTarget,
  resetNewPassword,
  setResetNewPassword,
  resetDone,
  setResetDone,
  resetCopied,
  setResetCopied,
  resetLoading,
  setResetLoading,
  // Parent linking
  linkModal,
  setLinkModal,
  linkForm,
  setLinkForm,
  linkResult,
  setLinkResult,
  linkSaving,
  setLinkSaving,
  // Scope editor
  scopeTarget,
  setScopeTarget,
  scopeDraft,
  setScopeDraft,
  scopeSaving,
  setScopeSaving,
  // Timetable
  ttArm,
  setTtArm,
  ttEntries,
  setTtEntries,
  ttModal,
  setTtModal,
  ttDraft,
  setTtDraft,
  ttSaving,
  setTtSaving,
  ttConflictsOpen,
  setTtConflictsOpen,
  ttConflictsLoading,
  setTtConflictsLoading,
  ttConflictFixing,
  setTtConflictFixing,
  ttHealth,
  setTtHealth,
  ttHealthScanning,
  setTtHealthScanning,
  ttSwapDraft,
  setTtSwapDraft,
  // Bell schedule
  periodTimesDraft,
  setPeriodTimesDraft,
  periodTimesSaving,
  setPeriodTimesSaving,
  breakDraft,
  setBreakDraft,
  bellDay,
  setBellDay,
  dailyDrafts,
  setDailyDrafts,
  // Term rollover
  rolloverOpen,
  setRolloverOpen,
  rolloverTermName,
  setRolloverTermName,
  rolloverSession,
  setRolloverSession,
  rolloverPreview,
  setRolloverPreview,
  rolloverPreviewing,
  setRolloverPreviewing,
  rolloverSaving,
  setRolloverSaving,
  // School lifecycle
  schoolBusy,
  setSchoolBusy,
  exitStep,
  setExitStep,
  exitReason,
  setExitReason,
  exitFeedback,
  setExitFeedback,
  exitSaving,
  setExitSaving,
  exitRestorableUntil,
  setExitRestorableUntil,
  // Report cards
  setReportPayload,
  setReportLoading,
  // Search
  search,
  // Offline sync — optional; when provided, fee writes queue offline
  offlineFetch,
}) {
  // Fall back to plain fetch when offlineFetch is not provided (e.g. tests)
  const safeFetch = offlineFetch || fetch;
  const subjects = getSubjects();
  const pendingToggleRef = useRef(new Set());

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

  // ---- Report cards --------------------------------------------------------

  async function openReport(studentId) {
    setReportLoading(true);
    setReportPayload(null);
    try {
      const res = await fetch(`/api/reports/${studentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load report");
      setReportPayload(data);
    } catch (err) {
      showToast(err.message);
    } finally {
      setReportLoading(false);
    }
  }

  // ---- User CRUD -----------------------------------------------------------

  async function togglePayroll(id, current) {
    if (pendingToggleRef.current.has(id)) return;
    const next = current === "PAID" ? "PENDING" : "PAID";
    const delta = payrollToggleDelta(next);
    const undo = negateToggleDelta(delta);
    setTeachers((ts) => ts.map((t) => (t.id === id ? { ...t, payrollStatus: next } : t)));
    setStats((s) => ({
      ...s,
      payrollPaid: s.payrollPaid + delta.payrollPaid,
      payrollPending: s.payrollPending + delta.payrollPending,
    }));
    pendingToggleRef.current.add(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollStatus: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update payroll status");
      }
      showToast(`Payroll marked ${next === "PAID" ? "Paid" : "Pending"}`);
    } catch (err) {
      setTeachers((ts) => ts.map((t) => (t.id === id ? { ...t, payrollStatus: current } : t)));
      setStats((s) => ({
        ...s,
        payrollPaid: s.payrollPaid + undo.payrollPaid,
        payrollPending: s.payrollPending + undo.payrollPending,
      }));
      showToast(err.message || "Failed to update payroll status");
    } finally {
      pendingToggleRef.current.delete(id);
    }
  }

  async function toggleFee(id, current) {
    const key = `fee:${id}`;
    if (pendingToggleRef.current.has(key)) return;
    const next = !current;
    setStudents((ss) => ss.map((s) => (s.id === id ? { ...s, feePaid: next } : s)));
    pendingToggleRef.current.add(key);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feePaid: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update fee status");
      }
      showToast(next ? "Fee marked as collected" : "Fee marked as unpaid");
    } catch (err) {
      setStudents((ss) => ss.map((s) => (s.id === id ? { ...s, feePaid: current } : s)));
      showToast(err.message || "Failed to update fee status");
    } finally {
      pendingToggleRef.current.delete(key);
    }
  }

  async function createUser(role) {
    setSaving(true);
    try {
      const roleEnum = String(role === "staff" ? form.staffRole || "BURSAR" : role || "").toUpperCase();

      if (editingUser) {
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            assignedClass: form.assignedClass,
            subjects: form.subjects,
            assignedClasses: form.assignedClasses,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update");
        const u = data.user;
        if (roleEnum === "TEACHER") setTeachers((ts) => ts.map((t) => (t.id === u.id ? u : t)));
        else if (roleEnum === "STUDENT") setStudents((ss) => ss.map((s) => (s.id === u.id ? u : s)));
        showToast(`${u.name} updated`);
        closeAddModal();
        return;
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: roleEnum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      if (roleEnum === "TEACHER") {
        setTeachers((ts) => [...ts, data.user]);
        setStats((s) => ({
          ...s,
          activeTeachers: s.activeTeachers + 1,
          payrollPending: s.payrollPending + 1,
        }));
      } else if (roleEnum === "BURSAR" || roleEnum === "REGISTRAR") {
        // Staff accounts — no dashboard table rows to update.
      } else {
        const arm = data.user.assignedClass || "Unassigned";
        setStudents((ss) => [...ss, data.user]);
        setStats((s) => ({
          ...s,
          totalStudents: s.totalStudents + 1,
          classDistribution: {
            ...s.classDistribution,
            [arm]: (s.classDistribution?.[arm] || 0) + 1,
          },
        }));
      }

      if (roleEnum === "STUDENT" && data.generatedPassword) {
        setCreatedUserDisplay({
          name: data.user.name,
          email: data.user.email,
          password: data.generatedPassword,
        });
      } else {
        setModal(null);
        setForm({ name: "", email: "", password: "", assignedClass: "", staffRole: "BURSAR", subjects: [], assignedClasses: [] });
        showToast(`${roleEnum === "TEACHER" ? "Teacher" : roleEnum === "BURSAR" ? "Bursar" : roleEnum === "REGISTRAR" ? "Registrar" : "Student"} added successfully`);
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!resetTarget) return;
    setResetLoading(true);
    setResetDone(null);
    try {
      const res = await fetch(`/api/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetNewPassword || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      setResetDone({ newPassword: data.newPassword });
      showToast(`Password reset for ${resetTarget.name}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setResetLoading(false);
    }
  }

  function openReset(user) {
    setResetTarget(user);
    setResetNewPassword("");
    setResetDone(null);
    setResetCopied(false);
  }

  function openEdit(user) {
    setEditingUser(user);
    setForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      assignedClass: user.assignedClass || "",
      staffRole: user.role === "BURSAR" || user.role === "REGISTRAR" ? user.role : "BURSAR",
      subjects: user.subjects || [],
      assignedClasses: user.assignedClasses || [],
    });
    setModal(user.role === "TEACHER" ? "teacher" : user.role === "BURSAR" || user.role === "REGISTRAR" ? "staff" : "student");
  }

  function closeAddModal() {
    setModal(null);
    setEditingUser(null);
    setForm({ name: "", email: "", password: "", assignedClass: "", staffRole: "BURSAR", subjects: [], assignedClasses: [] });
  }

  function confirmDeleteUser() {
    if (!deleteTarget) return;
    setDeletingUser(true);
    fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to remove the account");
        const u = deleteTarget;
        if (u.role === "TEACHER") {
          setTeachers((ts) => ts.filter((t) => t.id !== u.id));
          setStats((s) => ({ ...s, activeTeachers: Math.max(0, s.activeTeachers - 1) }));
        } else if (u.role === "STUDENT") {
          setStudents((ss) => ss.filter((s) => s.id !== u.id));
          setStats((s) => ({ ...s, totalStudents: Math.max(0, s.totalStudents - 1) }));
        }
        showToast(`${u.name} removed`);
        setDeleteTarget(null);
      })
      .catch((err) => showToast(err.message))
      .finally(() => setDeletingUser(false));
  }

  function closeCreatedUserDisplay() {
    setCreatedUserDisplay(null);
    setModal(null);
    setForm({ name: "", email: "", password: "", assignedClass: "", staffRole: "BURSAR", subjects: [], assignedClasses: [] });
    showToast("Student added successfully");
  }

  async function copyNewPassword() {
    if (!resetDone) return;
    try {
      await navigator.clipboard.writeText(resetDone.newPassword);
      setResetCopied(true);
      setTimeout(() => setResetCopied(false), 1500);
    } catch {}
  }

  // ---- School lifecycle ----------------------------------------------------

  async function flipSchoolStatus(action) {
    setSchoolBusy(true);
    try {
      const res = await fetch("/api/school/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update the school account");
      window.location.reload();
    } catch (err) {
      showToast(err.message);
      setFreezeModal(null);
    } finally {
      setSchoolBusy(false);
    }
  }

  async function submitExitSurvey() {
    if (!exitReason) return;
    setExitSaving(true);
    try {
      const res = await fetch("/api/school", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: exitReason, feedback: exitFeedback }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete the school");
      setExitRestorableUntil(data.restorableUntil || null);
      setExitStep("done");
    } catch (err) {
      showToast(err.message);
    } finally {
      setExitSaving(false);
    }
  }

  // ---- Parent linking ------------------------------------------------------

  // Parent helpers — dedupe by name (login ID) and phone (secondary key).
  const parentNameById = useMemo(() => Object.fromEntries(parents.map((p) => [p.id, p.name])), [parents]);

  const findParentByName = useCallback(
    (name) =>
      parents.find(
        (p) =>
          p.role === "PARENT" &&
          String(p.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase()
      ),
    [parents]
  );

  const normPhone = (p) => String(p || "").replace(/\D/g, "");
  const findParentByPhone = useCallback(
    (phone) => {
      const norm = normPhone(phone);
      if (!norm) return null;
      return parents.find((p) => p.role === "PARENT" && normPhone(p.phone) === norm);
    },
    [parents]
  );

  async function linkParent(studentId) {
    setLinkSaving(true);
    try {
      let parentId = linkForm.parentId;
      if (linkForm.mode === "create") {
        if (!String(linkForm.name || "").trim()) {
          throw new Error("Please enter the parent's full name");
        }
        const dup = findParentByName(linkForm.name);
        if (dup) {
          setLinkForm((f) => ({ ...f, mode: "select", parentId: dup.id }));
          showToast(`"${dup.name}" already exists — link them instead of creating a duplicate.`);
          return;
        }
        const phoneDup = findParentByPhone(linkForm.phone);
        if (phoneDup) {
          setLinkForm((f) => ({ ...f, mode: "select", parentId: phoneDup.id }));
          showToast(`"${phoneDup.name}" already uses this phone — link them instead of creating a duplicate.`);
          return;
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: linkForm.name,
            role: "PARENT",
            phone: linkForm.phone,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create parent");
        parentId = data.user.id;
        setParents((ps) => [...ps, data.user]);
      }
      if (!parentId) throw new Error("Select or create a parent first");

      const res2 = await fetch(`/api/users/${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.error || "Failed to link parent");

      setStudents((ss) => ss.map((s) => (s.id === studentId ? { ...s, parentId } : s)));
      const studentName = students.find((s) => s.id === studentId)?.name;
      const parentName =
        linkForm.mode === "create"
          ? String(linkForm.name || "").trim()
          : parents.find((p) => p.id === linkForm.parentId)?.name || "Parent";
      setLinkResult({ parentName, password: studentName || "" });
      setLinkForm({ mode: "select", parentId: "", name: "", phone: "" });
      showToast("Parent linked to student");
    } catch (err) {
      showToast(err.message);
    } finally {
      setLinkSaving(false);
    }
  }

  async function unlinkParent(studentId) {
    const res = await fetch(`/api/users/${studentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null }),
    });
    if (res.ok) {
      setStudents((ss) => ss.map((s) => (s.id === studentId ? { ...s, parentId: null } : s)));
      showToast("Parent unlinked");
    }
  }

  // ---- Scope editor --------------------------------------------------------

  function openScope(t) {
    setScopeDraft({
      subjects: t.subjects?.length ? [...t.subjects] : [],
      assignedClasses: t.assignedClasses?.length
        ? [...t.assignedClasses]
        : t.assignedClass
          ? [t.assignedClass]
          : [],
      assignedClass: t.assignedClass || "",
    });
    setScopeTarget(t);
  }

  async function saveScope() {
    if (!scopeTarget) return;
    setScopeSaving(true);
    try {
      const res = await fetch(`/api/users/${scopeTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjects: scopeDraft.subjects,
          assignedClasses: scopeDraft.assignedClasses,
          assignedClass: scopeDraft.assignedClasses[0] || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save teaching scope");
      const u = data.user;
      setTeachers((ts) =>
        ts.map((t) =>
          t.id === u.id
            ? { ...t, subjects: u.subjects || [], assignedClasses: u.assignedClasses || [], assignedClass: u.assignedClass || "" }
            : t
        )
      );
      setScopeTarget(null);
      showToast(
        `${u.subjects?.length ? u.subjects.join(", ") : "No subjects"} · ${u.assignedClasses?.length ? u.assignedClasses.length + (u.assignedClasses.length === 1 ? " arm" : " arms") : "no arms"} saved for ${u.name.split(" ")[0]}`
      );
    } catch (err) {
      showToast(err.message);
    } finally {
      setScopeSaving(false);
    }
  }

  // ---- Timetable actions ---------------------------------------------------

  // Timetable derived values used by actions and modals.
  const ttByKey = useMemo(() => {
    const m = {};
    ttEntries.forEach((e) => { m[`${e.day}|${e.period}`] = e; });
    return m;
  }, [ttEntries]);

  const ttFilled = ttEntries.length;

  const ttTeachersForSubject = useMemo(
    () => teachers.filter((t) => !t.subjects?.length || t.subjects.includes(ttDraft.subject)),
    [teachers, ttDraft.subject]
  );

  const ttFlaggedSlots = useMemo(() => new Set(ttHealth?.flaggedSlots || []), [ttHealth?.flaggedSlots]);

  const ttSpark = useMemo(() => sparklinePoints(ttHealth?.history), [ttHealth?.history]);

  const dayTimelines = useMemo(
    () => Object.fromEntries(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => [d, getDayTimeline(session?.school, d)])),
    [session?.school]
  );

  const dayPeriodSets = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(dayTimelines).map(([d, tl]) => [
          d,
          new Set((tl || []).filter((b) => b.type === "teaching").map((b) => Number(b.period))),
        ])
      ),
    [dayTimelines]
  );

  const bellDraft = useMemo(() => {
    if (bellDay === "ALL") {
      return { periodTimes: periodTimesDraft, breakTimes: breakDraft, overridden: false };
    }
    const d = dailyDrafts[bellDay] || {
      periodTimes: getPeriodTimes(session?.school, bellDay).map((p) => ({ ...p })),
      breakTimes: { ...getBreakTime(session?.school, bellDay) },
    };
    return { ...d, overridden: Boolean(dailyDrafts[bellDay]) };
  }, [bellDay, periodTimesDraft, breakDraft, dailyDrafts, session?.school]);

  function openTtCell(day, period) {
    const existing = ttByKey[`${day}|${period}`];
    const subject = existing?.subject || subjects[0] || "";
    setTtDraft({
      subject,
      teacherId:
        existing?.teacherId ||
        teachers.find((t) => !t.subjects?.length || t.subjects.includes(subject))?.id ||
        "",
    });
    setTtModal({ day, period });
  }

  async function saveTtSlot() {
    if (!ttModal || !ttDraft.subject || !ttDraft.teacherId) return;
    const slotKey = `${ttArm}|${ttModal.day}|${ttModal.period}`;
    const liveReasons = slotConflictReasons(ttHealth?.conflicts, ttArm, ttModal.day, ttModal.period);
    if (ttFlaggedSlots.has(slotKey) && liveReasons.length === 0) {
      const ok = window.confirm(
        "This slot was flagged by an earlier conflict scan. Reassigning it could " +
          "silently reintroduce the issue. Save anyway?"
      );
      if (!ok) return;
    }
    setTtSaving(true);
    try {
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classArm: ttArm,
          day: ttModal.day,
          period: ttModal.period,
          subject: ttDraft.subject,
          teacherId: ttDraft.teacherId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save slot");
      setTtEntries((prev) => {
        const key = `${data.entry.day}|${data.entry.period}`;
        return [...prev.filter((e) => `${e.day}|${e.period}` !== key), data.entry];
      });
      setTtModal(null);
      showToast(`Period ${ttModal.period} · ${ttModal.day} set for ${ttArm}`);
      fetch("/api/timetable/health")
        .then((r) => r.json())
        .then((d) => setTtHealth(d))
        .catch((e) => warn("tt-health", "refresh failed:", e?.message));
      if (ttConflictsOpen) checkTtConflicts(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtSaving(false);
    }
  }

  async function clearTtSlot() {
    if (!ttModal) return;
    setTtSaving(true);
    try {
      const res = await fetch("/api/timetable", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classArm: ttArm, day: ttModal.day, period: ttModal.period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear slot");
      setTtEntries((prev) =>
        prev.filter((e) => !(e.day === ttModal.day && e.period === ttModal.period))
      );
      setTtModal(null);
      showToast(`Period ${ttModal.period} on ${ttModal.day} freed`);
      if (ttConflictsOpen) checkTtConflicts(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtSaving(false);
    }
  }

  async function checkTtConflicts(silent = false) {
    setTtConflictsLoading(true);
    try {
      const res = await fetch("/api/timetable?conflicts=1");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scan the timetable");
      // Conflicts result is used locally — the tab component reads it from context.
      fetch("/api/timetable/health")
        .then((r) => r.json())
        .then((d) => setTtHealth(d))
        .catch((e) => warn("tt-health", "scan refresh failed:", e?.message));
      setTtConflictsOpen(true);
      const total =
        (data.conflicts.teacher?.length || 0) +
        (data.conflicts.arm?.length || 0) +
        (data.conflicts.scope?.length || 0);
      if (!silent) {
        showToast(
          total ? `${total} conflict${total === 1 ? "" : "s"} found — review them below` : "No conflicts — the schedule is clean"
        );
      }
    } catch (err) {
      if (!silent) showToast(err.message);
    } finally {
      setTtConflictsLoading(false);
    }
  }

  async function scanSchedule() {
    setTtHealthScanning(true);
    try {
      const res = await fetch("/api/timetable/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setTtHealth(data);
      showToast(
        data.conflictCount
          ? `${data.conflictCount} conflict${data.conflictCount === 1 ? "" : "s"} found${data.newConflictCount ? ` — ${data.newConflictCount} new` : ""}`
          : "No conflicts — the schedule is clean"
      );
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtHealthScanning(false);
    }
  }

  async function fixTtConflict(slot) {
    const key = `${slot.classArm}|${slot.day}|${slot.period}`;
    setTtConflictFixing(key);
    try {
      const res = await fetch("/api/timetable", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classArm: slot.classArm, day: slot.day, period: slot.period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to free the slot");
      setTtEntries((prev) =>
        prev.filter((e) => !(e.classArm === slot.classArm && e.day === slot.day && e.period === slot.period))
      );
      showToast(`Freed ${slot.classArm} · ${slot.day}, period ${slot.period}`);
      await checkTtConflicts(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtConflictFixing(null);
    }
  }

  async function swapTtTeacher(violation, teacherId) {
    if (!teacherId) return;
    const fixing = `swap|${violation.entryId}`;
    setTtConflictFixing(fixing);
    try {
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classArm: violation.classArm,
          day: violation.day,
          period: violation.period,
          subject: violation.subject,
          teacherId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Swap failed");
      setTtEntries((prev) => {
        const key = `${data.entry.day}|${data.entry.period}`;
        return [...prev.filter((e) => `${e.day}|${e.period}` !== key), data.entry];
      });
      showToast(`Swapped in ${data.entry.teacherName} for ${violation.subject} · ${violation.classArm}`);
      await checkTtConflicts(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtConflictFixing(null);
    }
  }

  // ---- Bell schedule actions -----------------------------------------------

  function setPeriodTime(period, field, value) {
    if (bellDay === "ALL") {
      setPeriodTimesDraft((prev) =>
        prev.map((p) => (p.period === period ? { ...p, [field]: value } : p))
      );
      return;
    }
    setDailyDrafts((prev) => {
      const cur = prev[bellDay] || {
        periodTimes: getPeriodTimes(session?.school, bellDay).map((p) => ({ ...p })),
        breakTimes: { ...getBreakTime(session?.school, bellDay) },
      };
      return {
        ...prev,
        [bellDay]: {
          ...cur,
          periodTimes: cur.periodTimes.map((p) =>
            p.period === period ? { ...p, [field]: value } : p
          ),
        },
      };
    });
  }

  function setBreakTime(field, value) {
    if (bellDay === "ALL") {
      setBreakDraft((prev) => ({ ...prev, [field]: value }));
      return;
    }
    setDailyDrafts((prev) => {
      const cur = prev[bellDay] || {
        periodTimes: getPeriodTimes(session?.school, bellDay).map((p) => ({ ...p })),
        breakTimes: { ...getBreakTime(session?.school, bellDay) },
      };
      return {
        ...prev,
        [bellDay]: { ...cur, breakTimes: { ...cur.breakTimes, [field]: value } },
      };
    });
  }

  function selectBellDay(day) {
    setBellDay(day);
    if (day !== "ALL" && !dailyDrafts[day]) {
      setDailyDrafts((prev) => ({
        ...prev,
        [day]: {
          periodTimes: getPeriodTimes(session?.school, day).map((p) => ({ ...p })),
          breakTimes: { ...getBreakTime(session?.school, day) },
        },
      }));
    }
  }

  function setBellDayPeriodCount(day, n) {
    setDailyDrafts((prev) => {
      const cur = prev[day] || {
        periodTimes: getPeriodTimes(session?.school, day).map((p) => ({ ...p })),
        breakTimes: { ...getBreakTime(session?.school, day) },
      };
      const count = Math.min(MAX_PERIOD, Math.max(1, Number(n) || 1));
      const periodTimes = Array.from({ length: count }, (_, i) => {
        const p = i + 1;
        const existing = cur.periodTimes.find((x) => Number(x.period) === p);
        const def = DEFAULT_PERIOD_TIMES.find((x) => x.period === p);
        return existing ? { ...existing } : { ...def };
      });
      return { ...prev, [day]: { ...cur, periodTimes } };
    });
  }

  function resetBellDay(day) {
    setDailyDrafts((prev) => {
      const next = { ...prev };
      delete next[day];
      return next;
    });
  }

  async function savePeriodTimes() {
    setPeriodTimesSaving(true);
    try {
      const dailySchedules = Object.fromEntries(
        Object.entries(dailyDrafts).map(([day, d]) => [
          day,
          { periodTimes: d.periodTimes, breakTimes: d.breakTimes },
        ])
      );
      const res = await fetch("/api/school", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodTimes: periodTimesDraft,
          breakTimes: breakDraft,
          dailySchedules,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save period times");
      setSession((s) =>
        s
          ? {
              ...s,
              school: {
                ...s.school,
                periodTimes: data.school?.periodTimes ?? s.school?.periodTimes,
                breakTimes: data.school?.breakTimes ?? s.school?.breakTimes,
                dailySchedules: data.school?.dailySchedules ?? s.school?.dailySchedules,
              },
            }
          : s
      );
      showToast("Bell schedule saved — class alerts and timetables now follow it");
    } catch (err) {
      showToast(err.message);
    } finally {
      setPeriodTimesSaving(false);
    }
  }

  // ---- Term rollover -------------------------------------------------------

  function openRollover() {
    setRolloverTermName("");
    setRolloverSession(session?.school?.currentSession || "");
    setRolloverPreview(null);
    setRolloverOpen(true);
  }

  async function previewRollover() {
    if (!rolloverTermName.trim()) return;
    setRolloverPreviewing(true);
    try {
      const res = await fetch("/api/school/rollover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newTerm: rolloverTermName.trim(),
          newSession: rolloverSession.trim() || session?.school?.currentSession,
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not preview the rollover");
      setRolloverPreview(data.counts);
    } catch (err) {
      setRolloverPreview(null);
      showToast(err.message);
    } finally {
      setRolloverPreviewing(false);
    }
  }

  async function confirmRollover() {
    if (!rolloverTermName.trim()) return;
    setRolloverSaving(true);
    try {
      const res = await fetch("/api/school/rollover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newTerm: rolloverTermName.trim(),
          newSession: rolloverSession.trim() || session?.school?.currentSession,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the new term");
      const c = data.counts || {};
      setSession((s) =>
        s
          ? {
              ...s,
              school: {
                ...s.school,
                currentSession: data.school?.currentSession ?? s.school?.currentSession,
                currentTerm: data.school?.currentTerm ?? s.school?.currentTerm,
              },
            }
          : s
      );
      fetch("/api/admin/stats")
        .then((r) => r.json())
        .then((d) => d.stats && setStats(d.stats))
        .catch((e) => warn("stats", "refresh failed:", e?.message));
      fetch("/api/fees/structures")
        .then((r) => r.json())
        .then((d) => {
          if (d.structures) {
            setFeeStructures(d.structures);
            setFeeDraft(Object.fromEntries(d.structures.map((s) => [s.classArm, s.amount])));
          }
        })
        .catch((e) => warn("fee-structures", "refresh failed:", e?.message));
      showToast(
        `Started ${data.school?.currentSession} · ${data.school?.currentTerm} — archived ${c.scoresArchived || 0} scores and ${c.attendanceArchived || 0} attendance registers; cloned ${c.feesCloned || 0} fee structures and ${c.timetableCloned || 0} timetable slots; carried ${c.carryovers || 0} unpaid balances and sent ${c.remindersSent || 0} automatic reminders`
      );
      setRolloverOpen(false);
      setRolloverPreview(null);
    } catch (err) {
      showToast(err.message);
    } finally {
      setRolloverSaving(false);
    }
  }

  // ---- Return all actions + derived values ---------------------------------

  return {
    // Fee actions
    confirmPayment,
    saveFeeStructure,
    recordPayment,
    // Reminder actions
    loadReminderTemplates,
    sendReminders,
    reconcileAndForward,
    // Report
    openReport,
    // User CRUD
    togglePayroll,
    toggleFee,
    createUser,
    resetPassword,
    openReset,
    openEdit,
    closeAddModal,
    confirmDeleteUser,
    closeCreatedUserDisplay,
    copyNewPassword,
    // School lifecycle
    flipSchoolStatus,
    submitExitSurvey,
    // Parent linking
    parentNameById,
    findParentByName,
    findParentByPhone,
    linkParent,
    unlinkParent,
    // Scope
    openScope,
    saveScope,
    // Timetable actions
    openTtCell,
    saveTtSlot,
    clearTtSlot,
    checkTtConflicts,
    scanSchedule,
    fixTtConflict,
    swapTtTeacher,
    // Bell schedule actions
    setPeriodTime,
    setBreakTime,
    selectBellDay,
    setBellDayPeriodCount,
    resetBellDay,
    savePeriodTimes,
    // Term rollover actions
    openRollover,
    previewRollover,
    confirmRollover,
    // Timetable derived values
    ttByKey,
    ttFilled,
    ttTeachersForSubject,
    ttFlaggedSlots,
    ttSpark,
    dayTimelines,
    dayPeriodSets,
    bellDraft,
    // Subjects
    subjects,
  };
}
