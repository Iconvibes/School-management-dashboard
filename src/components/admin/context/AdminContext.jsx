"use client";
import { createContext, useContext } from "react";

/**
 * AdminShell context — shared state that every admin tab needs.
 *
 * Provided by page.js, consumed by tab components via useAdminShell().
 * This eliminates prop-drilling for session, stats, roster data, toast,
 * permission flags, filtered lists, and cross-cutting actions (payroll
 * toggle, fee toggle, user CRUD, report-card viewer, etc.).
 *
 * Organisation of the context value (all keys are flat for simplicity;
 * tab components destructure only the keys they need):
 *
 * ── Core ────────────────────────────────────────────────────────
 *   session, setSession, stats, setStats, showToast
 *
 * ── Roster ──────────────────────────────────────────────────────
 *   teachers, setTeachers, students, setStudents, parents
 *   filteredTeachers, filteredStudents
 *   parentNameById, findParentByName, findParentByPhone
 *
 * ── Permissions (derived from session) ───────────────────────────
 *   isSuper, canFees, canRoster, canReports, canSchoolEdit
 *
 * ── Navigation & Modals ─────────────────────────────────────────
 *   tab, setTab, modal, setModal, setFreezeModal
 *
 * ── User CRUD ───────────────────────────────────────────────────
 *   createUser, togglePayroll, toggleFee, openReset, openEdit,
 *   setDeleteTarget, confirmDeleteUser, editingUser
 *
 * ── Parent linking ──────────────────────────────────────────────
 *   linkModal, setLinkModal, unlinkParent, linkParent, linkSaving,
 *   linkResult, linkForm, setLinkForm
 *
 * ── Report cards ────────────────────────────────────────────────
 *   reportPayload, setReportPayload, openReport, reportLoading
 *
 * ── Fee management (state in FeeContext, actions here) ──────────
 *   confirmPayment, saveFeeStructure, recordPayment,
 *   loadReminderTemplates, sendReminders, reconcileAndForward,
 *   (fee state reads: use useFeeContext() in fee tabs/modals)
 *
 * ── Timetable ───────────────────────────────────────────────────
 *   ttArm, setTtArm, ttEntries, ttByKey, ttFilled, ttConflicts,
 *   ttConflictsOpen, setTtConflictsOpen, ttConflictsLoading,
 *   ttConflictFixing, dayTimeline, dayTimelines, dayPeriodSets,
 *   openTtCell, saveTtSlot, clearTtSlot, checkTtConflicts,
 *   fixTtConflict, swapTtTeacher, ttSwapDraft, setTtSwapDraft,
 *   ttHealth, ttHealthScanning, scanSchedule, ttFlaggedSlots,
 *   ttTeachersForSubject, bellDraft, bellDay, dailyDrafts,
 *   selectBellDay, setBellDayPeriodCount, setPeriodTime,
 *   setBreakTime, resetBellDay, savePeriodTimes, periodTimesSaving
 *
 * ── Term rollover ───────────────────────────────────────────────
 *   rolloverOpen, setRolloverOpen, openRollover, rolloverTermName,
 *   setRolloverTermName, rolloverSession, setRolloverSession,
 *   rolloverPreview, setRolloverPreview, rolloverPreviewing,
 *   rolloverSaving, previewRollover, confirmRollover
 *
 * ── Scope editor ────────────────────────────────────────────────
 *   scopeTarget, setScopeTarget, scopeDraft, setScopeDraft,
 *   scopeSaving, openScope, saveScope
 *
 * ── School lifecycle ────────────────────────────────────────────
 *   flipSchoolStatus, exitStep, setExitStep, submitExitSurvey
 */
const AdminContext = createContext(null);

export function AdminProvider({ value, children }) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

/**
 * Consume the admin dashboard context. Must be used inside <AdminProvider>.
 *
 * @returns {Object} The full admin context value — destructure only the
 *   keys your tab component needs so the dependency footprint stays small.
 */
export function useAdminShell() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdminShell must be used inside <AdminProvider>");
  return ctx;
}
