/**
 * Replaces the ~1200-line action function block in page.js
 * with a single useAdminActions() hook call.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/app/admin/dashboard/page.js";
const src = readFileSync(FILE, "utf8");
const lines = src.split("\n");

// --- 1. Add import after the last existing import (line ~129) ---
const lastImportIdx = lines.findIndex((l, i) =>
  i > 100 && l.startsWith('import ') && i < lines.findIndex((l2) => l2.includes("const inputCls"))
);
const importLine = 'import useAdminActions from "@/components/admin/useAdminActions";';
if (!lines.some((l) => l.includes("useAdminActions"))) {
  lines.splice(lastImportIdx + 1, 0, importLine);
}

// Re-read after insert
const src2 = lines.join("\n");
const lines2 = src2.split("\n");

// --- 2. Find the block to replace ---
// Start: first "const subjects = getSubjects();" (line ~308)
// End: last "}" before "if (loading)" (line ~1599)
const startIdx = lines2.findIndex((l) => l.trim() === "const subjects = getSubjects();");
const endIdx = lines2.findIndex((l) => l.trim() === "if (loading) {" && lines2.indexOf(l) > 1000);

if (startIdx === -1 || endIdx === -1) {
  console.error("Could not find replacement boundaries:", { startIdx, endIdx });
  process.exit(1);
}

// Find the blank line before "if (loading)" — that's where actions end
let replaceEnd = endIdx - 1;
while (replaceEnd > startIdx && lines2[replaceEnd].trim() === "") replaceEnd--;
replaceEnd += 1; // include the trailing blank line

// --- 3. Build the replacement ---
const replacement = `
  // ---- Hook: all action functions + derived timetable/fee values ----------
  const {
    // Fee actions
    confirmPayment, saveFeeStructure, recordPayment,
    // Reminder actions
    loadReminderTemplates, sendReminders, reconcileAndForward,
    // Report
    openReport,
    // User CRUD
    togglePayroll, toggleFee, createUser, resetPassword,
    openReset, openEdit, closeAddModal, confirmDeleteUser,
    closeCreatedUserDisplay, copyNewPassword,
    // School lifecycle
    flipSchoolStatus, submitExitSurvey,
    // Parent linking
    parentNameById, findParentByName, findParentByPhone,
    linkParent, unlinkParent,
    // Scope
    openScope, saveScope,
    // Timetable actions
    openTtCell, saveTtSlot, clearTtSlot, checkTtConflicts,
    scanSchedule, fixTtConflict, swapTtTeacher,
    // Bell schedule actions
    setPeriodTime, setBreakTime, selectBellDay,
    setBellDayPeriodCount, resetBellDay, savePeriodTimes,
    // Term rollover
    openRollover, previewRollover, confirmRollover,
    // Timetable derived values
    ttByKey, ttFilled, ttTeachersForSubject, ttFlaggedSlots,
    ttSpark, dayTimelines, dayPeriodSets, bellDraft,
    // Subjects
    subjects: hookSubjects,
  } = useAdminActions({
    session, setSession, stats, setStats, showToast,
    teachers, setTeachers, students, setStudents, parents, setParents,
    tab, setTab, router,
    modal, setModal, setFreezeModal,
    form, setForm, saving, setSaving, editingUser, setEditingUser,
    createdUserDisplay, setCreatedUserDisplay,
    feeStructures, setFeeStructures, feeLedger, setFeeLedger,
    feeTotals, setFeeTotals, pendingPayments, setPendingPayments,
    audit, setAudit, feeClass, setFeeClass, feeDefaultersOnly,
    feeDraft, setFeeDraft, feeSaving, setFeeSaving,
    confirmingId, setConfirmingId,
    payModal, setPayModal, payForm, setPayForm,
    reminderModal, setReminderModal, reminderSending, setReminderSending,
    reminderResult, setReminderResult, reminderMessage, setReminderMessage,
    reminderStudentMessage, setReminderStudentMessage,
    pendingReconciles, setPendingReconciles,
    reconcileSending, setReconcileSending, reconcileResult, setReconcileResult,
    deleteTarget, setDeleteTarget, deletingUser, setDeletingUser,
    resetTarget, setResetTarget, resetNewPassword, setResetNewPassword,
    resetDone, setResetDone, resetCopied, setResetCopied,
    resetLoading, setResetLoading,
    linkModal, setLinkModal, linkForm, setLinkForm,
    linkResult, setLinkResult, linkSaving, setLinkSaving,
    scopeTarget, setScopeTarget, scopeDraft, setScopeDraft,
    scopeSaving, setScopeSaving,
    ttArm, setTtArm, ttEntries, setTtEntries,
    ttModal, setTtModal, ttDraft, setTtDraft,
    ttSaving, setTtSaving, ttConflictsOpen, setTtConflictsOpen,
    ttConflictsLoading, setTtConflictsLoading,
    ttConflictFixing, setTtConflictFixing,
    ttHealth, setTtHealth, ttHealthScanning, setTtHealthScanning,
    ttSwapDraft, setTtSwapDraft,
    periodTimesDraft, setPeriodTimesDraft,
    periodTimesSaving, setPeriodTimesSaving,
    breakDraft, setBreakDraft,
    bellDay, setBellDay, dailyDrafts, setDailyDrafts,
    rolloverOpen, setRolloverOpen, rolloverTermName, setRolloverTermName,
    rolloverSession, setRolloverSession, rolloverPreview, setRolloverPreview,
    rolloverPreviewing, setRolloverPreviewing, rolloverSaving, setRolloverSaving,
    schoolBusy, setSchoolBusy, exitStep, setExitStep,
    exitReason, setExitReason, exitFeedback, setExitFeedback,
    exitSaving, setExitSaving, exitRestorableUntil, setExitRestorableUntil,
    setReportPayload, setReportLoading,
    search,
  });

  const subjects = hookSubjects;

  // Fee card delta — last 7 days vs the 7 before, from the collection timeline.
  const feeDelta = useMemo(() => {
    const tl = stats?.collectionTimeline || [];
    if (tl.length < 8) return null;
    const recent = tl.slice(-7).reduce((a, d) => a + (d.amount || 0), 0);
    const prev = tl.slice(-14, -7).reduce((a, d) => a + (d.amount || 0), 0);
    if (!prev) return null;
    return Math.round(((recent - prev) / prev) * 100);
  }, [stats?.collectionTimeline]);

  // Filtered roster lists for the Teachers & Students tabs
  const filteredTeachers = teachers.filter((t) =>
    (t.name + t.email + (t.assignedClass || "")).toLowerCase().includes(search.toLowerCase())
  );
  const filteredStudents = students.filter((s) =>
    (s.name + s.email + (s.assignedClass || "")).toLowerCase().includes(search.toLowerCase())
  );

  const dayTimeline = useMemo(() => getDayTimeline(session?.school), [session?.school]);
`;

// --- 4. Apply the replacement ---
const before = lines2.slice(0, startIdx).join("\n");
const after = lines2.slice(replaceEnd).join("\n");
const result = before + replacement + "\n" + after;

writeFileSync(FILE, result, "utf8");

// Count lines
const newLines = result.split("\n").length;
console.log(`Done. page.js: ${lines2.length} → ${newLines} lines (removed ${lines2.length - newLines})`);
