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
import useFeeActions from "@/components/admin/useFeeActions";
import useTimetableActions from "@/components/admin/useTimetableActions";

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

  // ---- Fee + reminder actions (extracted sub-hook) ------------------------
  const {
    refreshFeeData, confirmPayment, saveFeeStructure, recordPayment,
    loadReminderTemplates, sendReminders, reconcileAndForward,
  } = useFeeActions({
    showToast, safeFetch, feeClass, feeDefaultersOnly,
    setFeeLedger, setFeeTotals, setPendingPayments, setStats, setAudit,
    setConfirmingId, setFeeSaving, feeDraft, setFeeStructures,
    payModal, setPayModal, payForm, setPayForm,
    reminderMessage, setReminderMessage, reminderStudentMessage, setReminderStudentMessage,
    setReminderSending, setReminderResult, setReconcileSending, setReconcileResult,
    setPendingReconciles,
  });

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

  // ---- Timetable + bell schedule + rollover (extracted sub-hook) ----------
  const {
    ttByKey, ttFilled, ttTeachersForSubject, ttFlaggedSlots, ttSpark,
    dayTimelines, dayPeriodSets, bellDraft,
    openTtCell, saveTtSlot, clearTtSlot, checkTtConflicts, scanSchedule,
    fixTtConflict, swapTtTeacher,
    setPeriodTime, setBreakTime, selectBellDay, setBellDayPeriodCount,
    resetBellDay, savePeriodTimes,
    openRollover, previewRollover, confirmRollover,
  } = useTimetableActions({
    session, setSession, showToast, setStats, setFeeStructures, setFeeDraft,
    teachers, subjects,
    ttArm, setTtArm, ttEntries, setTtEntries, ttModal, setTtModal, ttDraft, setTtDraft,
    setTtSaving, ttConflictsOpen, setTtConflictsOpen, setTtConflictsLoading,
    setTtConflictFixing, ttHealth, setTtHealth, setTtHealthScanning,
    periodTimesDraft, setPeriodTimesDraft, setPeriodTimesSaving,
    breakDraft, setBreakDraft, bellDay, setBellDay, dailyDrafts, setDailyDrafts,
    setRolloverOpen, rolloverTermName, setRolloverTermName, rolloverSession,
    setRolloverSession, setRolloverPreview, setRolloverPreviewing, setRolloverSaving,
  });

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
