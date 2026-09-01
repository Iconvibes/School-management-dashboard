"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTabFetch } from "@/hooks/useTabFetch";
import { useRouter } from "next/navigation";
import {
  Menu,
  Users,
  GraduationCap,
  Wallet,
  CreditCard,
  Loader2,
  Plus,
  Search,
  X,
  ShieldCheck,
  ChevronRight,
  FileText,
  Trophy,
  Receipt,
  Banknote,
  AlertTriangle,
  CheckCircle2,
  History,
  HeartHandshake,
  UserPlus,
  Upload,
  Download,
  Trash2,
  KeyRound,
  Copy,
  Check,
  BellRing,
  Send,
  UserCog,
  ArrowLeftRight,
  BookOpen,
  ClipboardList,
  RefreshCw,
  CalendarDays,
  ChevronDown,
  Clock,
  Save,
  Pencil,
  Activity,
  RotateCcw,
  CalendarX,
  UserX,
  Link2Off,
  Layers,
  Eye,
  EyeOff,
  Printer,
  Snowflake,
  ImagePlus,
  School,
  BadgeCheck,
  ArrowLeft,
  LayoutDashboard,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import MetricCard from "@/components/MetricCard";
import Modal from "@/components/Modal";
import Logo from "@/components/Logo";
import TopStudents from "@/components/TopStudents";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { AreaChart, DonutChart, DayBars } from "@/components/OverviewCharts";
import ReportCardModal from "@/components/ReportCardModal";
import PrintableCredentials from "@/components/PrintableCredentials";
import ArmStreamSplitter from "@/components/ArmStreamSplitter";
import OverviewTab from "@/components/admin/OverviewTab";
import TeachersTab from "@/components/admin/TeachersTab";
import StudentsTab from "@/components/admin/StudentsTab";
import FeesTab from "@/components/admin/FeesTab";
import ReportsTab from "@/components/admin/ReportsTab";
import ArchivesTab from "@/components/admin/ArchivesTab";
import ClassesTab from "@/components/admin/ClassesTab";
import RolesTab from "@/components/admin/RolesTab";
import LoginsTab from "@/components/admin/LoginsTab";
import TimetableTab from "@/components/admin/TimetableTab";
import SettingsTab from "@/components/admin/SettingsTab";
import SchemeOfWorkTab from "@/components/admin/SchemeOfWorkTab";
import RiskAlerts from "@/components/admin/RiskAlerts";
import TeacherPerformance from "@/components/admin/TeacherPerformance";
import AlumniTab from "@/components/admin/AlumniTab";
import EngagementTab from "@/components/admin/EngagementTab";
import BranchesTab from "@/components/admin/BranchesTab";
import ComplianceTab from "@/components/admin/ComplianceTab";
import BillingTab from "@/components/admin/BillingTab";
import BillingBanner from "@/components/BillingBanner";
import StudentLimitBanner from "@/components/StudentLimitBanner";
import { AdminProvider } from "@/components/admin/context/AdminContext";
import { FeeProvider, useFeeContext, FEE_ACTION_TYPES } from "@/components/admin/context/FeeContext";
import { armAlreadyExists } from "@/lib/arms";
import { downloadBlob, toCSV, withBOM } from "@/lib/csv";
import { getSubjects, gradeBadgeClasses, ordinal, TERMS } from "@/lib/grading";
import {
  DAYS,
  DEFAULT_PERIOD_TIMES,
  getBreakTime,
  getDayTimeline,
  getPeriodTimes,
  MAX_PERIOD,
  PERIODS,
  slotConflictReasons,
} from "@/lib/timetable";
import { can, STAFF_ROLES, summarizeRolePermissions } from "@/lib/permissions";
import useAdminActions from "@/components/admin/useAdminActions";
import { bounceToLogin } from "@/lib/auth-client";
import { safeFetchJson } from "@/lib/safe-fetch";
import { MANAGED_ROLES, ROLE_LABELS } from "@/lib/roles";
import { sparklinePoints } from "@/lib/conflict-scan";
import { payrollToggleDelta, negateToggleDelta } from "@/lib/toggles";
import {
  DEFAULT_REMINDER_MESSAGE,
  DEFAULT_STUDENT_REMINDER_MESSAGE,
} from "@/lib/notifications";
import { warn } from "@/lib/log";
import { naira } from "@/components/admin/utils";
import ScheduleHealthCard from "@/components/admin/ScheduleHealthCard";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getVisibleTabs } from "@/components/admin/tabConfig";
import PushNotificationManager from "@/components/PushNotificationManager";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useSession } from "@/hooks/useSession";
import { timeAgo } from "@/lib/relative-time";
import FreezeRestoreModal from "@/components/admin/modals/FreezeRestoreModal";
import ExitFlowModal from "@/components/admin/modals/ExitFlowModal";
import LinkParentModal from "@/components/admin/modals/LinkParentModal";
import AddUserModal from "@/components/admin/modals/AddUserModal";
import ResetPasswordModal from "@/components/admin/modals/ResetPasswordModal";
import DeleteUserModal from "@/components/admin/modals/DeleteUserModal";
import FeePaymentModal from "@/components/admin/modals/FeePaymentModal";
import FeeReminderModal from "@/components/admin/modals/FeeReminderModal";
import ReconcileModal from "@/components/admin/modals/ReconcileModal";
import ScopeEditorModal from "@/components/admin/modals/ScopeEditorModal";
import TermRolloverModal from "@/components/admin/modals/TermRolloverModal";
import TimetableCellModal from "@/components/admin/modals/TimetableCellModal";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

// Exit-survey options shown when a SUPER_ADMIN deletes their school — the
// answers land in the platform's lead inbox before the tenant is wiped.
const EXIT_REASONS = [
  "Too expensive for our budget",
  "Missing a feature we need",
  "Too complex / hard to learn",
  "Our school is closing",
  "Switching to another platform",
  "Other",
];

// Brand swatches for the Settings tab (same starting palette as onboarding —
// the color well and hex input cover every other school color).
const BRAND_COLORS = ["#2563EB", "#0EA5E9", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#1E293B"];

// Role badge colours for the Roles & Access tab (mirrors ROLE_LABELS).


/** "02:00"-style label for the health card's scheduled-scan line. */
const fmtHour = (h) => `${String(h ?? 2).padStart(2, "0")}:00`;


function AdminDashboardInner() {
  const router = useRouter();
  const offlineSync = useOfflineSync();
  const { meData: initialSession, loading: sessionLoading } = useSession();
  const [session, setSession] = useState(null);
  useEffect(() => { if (initialSession) setSession(initialSession); }, [initialSession]);
  const [lastSync, setLastSync] = useState(null);
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // "teacher" | "student"
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    assignedClass: "",
    staffRole: "BURSAR",
    // Subject-specialist teaching model: subjects × class arms is a teacher's
    // classroom scope (one Mathematics teacher covers all twelve classes).
    subjects: [],
    assignedClasses: [],
  });
  // Report cards tab state
  const [reportStudents, setReportStudents] = useState([]);
  const [reportSearch, setReportSearch] = useState("");
  const [reportClass, setReportClass] = useState("");
  const [reportPayload, setReportPayload] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  // Fee management tab state — extracted to FeeContext for isolated re-renders
  const { state: feeState, dispatch: feeDispatch } = useFeeContext();
  const {
    feeStructures, feeLedger, feeTotals, pendingPayments, confirmingId,
    feeClass, feeDefaultersOnly, feeDraft, payModal, payForm, feeSaving,
    reminderModal, reminderSending, reminderResult, reminderMessage, reminderStudentMessage,
    pendingReconciles, reconcileModal, reconcileSending, reconcileResult, audit,
  } = feeState;
  // Setter adapters — bridge existing useState-style setters to reducer dispatch
  const setFeeStructures = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_STRUCTURES, value: typeof v === "function" ? v(feeStructures) : v });
  const setFeeLedger = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_LEDGER, value: typeof v === "function" ? v(feeLedger) : v });
  const setFeeTotals = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_TOTALS, value: typeof v === "function" ? v(feeTotals) : v });
  const setPendingPayments = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_PENDING_PAYMENTS, value: typeof v === "function" ? v(pendingPayments) : v });
  const setConfirmingId = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_CONFIRMING_ID, value: typeof v === "function" ? v(confirmingId) : v });
  const setFeeClass = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_CLASS, value: typeof v === "function" ? v(feeClass) : v });
  const setFeeDefaultersOnly = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_DEFAULTERS_ONLY, value: typeof v === "function" ? v(feeDefaultersOnly) : v });
  const setFeeDraft = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_DRAFT, value: typeof v === "function" ? v(feeDraft) : v });
  const setPayModal = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_PAY_MODAL, value: typeof v === "function" ? v(payModal) : v });
  const setPayForm = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_PAY_FORM, value: typeof v === "function" ? v(payForm) : v });
  const setFeeSaving = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_SAVING, value: typeof v === "function" ? v(feeSaving) : v });
  const setReminderModal = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_REMINDER_MODAL, value: typeof v === "function" ? v(reminderModal) : v });
  const setReminderSending = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_REMINDER_SENDING, value: typeof v === "function" ? v(reminderSending) : v });
  const setReminderResult = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_REMINDER_RESULT, value: typeof v === "function" ? v(reminderResult) : v });
  const setReminderMessage = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_REMINDER_MESSAGE, value: typeof v === "function" ? v(reminderMessage) : v });
  const setReminderStudentMessage = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_REMINDER_STUDENT_MESSAGE, value: typeof v === "function" ? v(reminderStudentMessage) : v });
  const setPendingReconciles = useMemo(() => (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_PENDING_RECONCILES, value: typeof v === "function" ? v(pendingReconciles) : v }), [feeDispatch, pendingReconciles]);
  const setReconcileModal = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_RECONCILE_MODAL, value: typeof v === "function" ? v(reconcileModal) : v });
  const setReconcileSending = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_RECONCILE_SENDING, value: typeof v === "function" ? v(reconcileSending) : v });
  const setReconcileResult = (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_RECONCILE_RESULT, value: typeof v === "function" ? v(reconcileResult) : v });
  const setAudit = useMemo(() => (v) => feeDispatch({ type: FEE_ACTION_TYPES.SET_AUDIT, value: typeof v === "function" ? v(audit) : v }), [feeDispatch, audit]);
  // Parent linking state
  const [parents, setParents] = useState([]);
  const [linkModal, setLinkModal] = useState(null); // studentId being linked
  const [linkForm, setLinkForm] = useState({
    mode: "select", // "select" | "create"
    parentId: "",
    name: "",
    phone: "",
  });
  // After a successful link, the modal swaps to a success panel showing the
  // auto-derived password (the linked student's full name) so the admin can
  // read it straight to the parent. null = no result shown.
  const [linkResult, setLinkResult] = useState(null); // { parentName, password }
  const [linkSaving, setLinkSaving] = useState(false);
  // Reset-password state
  const [resetTarget, setResetTarget] = useState(null); // user being reset
  const [resetNewPassword, setResetNewPassword] = useState(""); // provided custom pw
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone, setResetDone] = useState(null); // { newPassword } after success
  const [resetCopied, setResetCopied] = useState(false);
  // Created-user display — after adding a student the auto-generated password
  // is shown once (bcrypt means it can never be recovered later).
  const [createdUserDisplay, setCreatedUserDisplay] = useState(null); // { name, email, password }
  // The add-user modal doubles as an edit form — editingUser holds the row
  // being updated (null = plain add).
  const [editingUser, setEditingUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // user pending removal
  const [deletingUser, setDeletingUser] = useState(false);
  // School exit flow (SUPER_ADMIN only): confirm warning → exit survey → done.
  const [exitStep, setExitStep] = useState(null); // null | "confirm" | "survey" | "done"
  const [exitReason, setExitReason] = useState("");
  // Soft-deactivation confirm: null | "freeze" | "reactivate". Freezing the
  // account blocks every non-super-admin login while keeping all data.
  const [freezeModal, setFreezeModal] = useState(null);
  const [schoolBusy, setSchoolBusy] = useState(false);
  const [exitFeedback, setExitFeedback] = useState("");
  const [exitSaving, setExitSaving] = useState(false);
  // ISO date until which a deleted school's data stays recoverable (the
  // DELETE response carries it; the done step prints it).
  const [exitRestorableUntil, setExitRestorableUntil] = useState(null);
  // Teaching-scope editor state — SUPER_ADMIN assigns a teacher's SUBJECTS ×
  // ARMS here (the same scope the API enforces on every classroom route).
  const [scopeTarget, setScopeTarget] = useState(null); // teacher being edited
  const [scopeDraft, setScopeDraft] = useState({ subjects: [], assignedClasses: [], assignedClass: "" });
  const [scopeSaving, setScopeSaving] = useState(false);


  // Roles — SUPER_ADMIN builds the weekly schedule here; the
  // assigned slots surface instantly in every teacher's portal.
  const [ttArm, setTtArm] = useState("");
  const [ttEntries, setTtEntries] = useState([]);
  const [ttModal, setTtModal] = useState(null); // { day, period } cell being edited
  const [ttDraft, setTtDraft] = useState({ subject: "", teacherId: "" });
  const [ttSaving, setTtSaving] = useState(false);
  // Conflicts checker — scans EVERY arm for double-booked teachers and
  // duplicated arm slots, including pre-existing data.
  const [ttConflicts, setTtConflicts] = useState(null); // { teacher: [], arm: [] }
  const [ttConflictsOpen, setTtConflictsOpen] = useState(false);
  const [ttConflictsLoading, setTtConflictsLoading] = useState(false);
  const [ttConflictFixing, setTtConflictFixing] = useState(null); // "arm|day|period"
  // Schedule Health (Overview) — the daily conflict scan with new-collision flag.
  const [ttHealth, setTtHealth] = useState(null);
  const [ttHealthScanning, setTtHealthScanning] = useState(false);
  // Scope-violation swap — entryId -> chosen substitute teacherId.
  const [ttSwapDraft, setTtSwapDraft] = useState({});
  // Period-times editor — the bell schedule that drives the class-alert alarms.
  const [periodTimesDraft, setPeriodTimesDraft] = useState([]);
  const [periodTimesSaving, setPeriodTimesSaving] = useState(false);
  // The school-wide mid-day break (between periods 4 and 5) — editable times.
  const [breakDraft, setBreakDraft] = useState(getBreakTime(null));
  // Per-weekday bell schedules — "All days" edits the school-wide schedule;
  // picking a weekday edits THAT day's own override (e.g. a Friday that ends
  // at period 6). dailyDrafts holds only days the school has customized.
  const [bellDay, setBellDay] = useState("ALL");
  const [dailyDrafts, setDailyDrafts] = useState({});
  // Term rollover modal — moving the school to a new term archives the old
  // term's scores/attendance and clones fees + timetable forward.
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [rolloverTermName, setRolloverTermName] = useState("");
  const [rolloverSession, setRolloverSession] = useState("");
  const [rolloverPreview, setRolloverPreview] = useState(null); // dry-run counts
  const [rolloverPreviewing, setRolloverPreviewing] = useState(false);
  const [rolloverSaving, setRolloverSaving] = useState(false);
  const [roleAudit, setRoleAudit] = useState([]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  // Respond to sidebar hash links: /admin/dashboard#teachers etc.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (["classes", "teachers", "roles", "logins", "students", "fees", "reports", "timetable", "archives", "settings", "scheme", "risk", "performance", "alumni", "engagement", "branches", "compliance", "billing"].includes(hash)) setTab(hash);
      else if (!hash) setTab("overview");
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const reportsUrl = tab === "reports" ? "/api/reports?limit=200" + (reportClass ? "&classArm=" + encodeURIComponent(reportClass) : "") : null;
  const { data: reportsResult } = useTabFetch(reportsUrl, {
    enabled: tab === "reports",
    deps: [reportClass],
    transform: (d) => d.students || [],
  });
  useEffect(() => { if (reportsResult) setReportStudents(reportsResult); }, [reportsResult]);

  useTabFetch("/api/fees/structures", {
    enabled: tab === "fees",
    onData: (d) => {
      setFeeStructures(d.structures || []);
      setFeeDraft(Object.fromEntries((d.structures || []).map((s) => [s.classArm, s.amount])));
    },
  });

  const feeLedgerUrl = tab === "fees" ? "/api/fees?" + new URLSearchParams(Object.entries({ classArm: feeClass || "", defaulters: feeDefaultersOnly ? "1" : "" }).filter(([,v]) => v)).toString() : null;
  useTabFetch(feeLedgerUrl, {
    enabled: tab === "fees",
    deps: [feeClass, feeDefaultersOnly],
    onData: (d) => {
      setFeeLedger(d.ledger || []);
      setFeeTotals(d.totals || null);
      setPendingPayments(d.pendingPayments || []);
    },
  });

  // Timetable entries for the selected arm
  const { data: ttEntriesResult } = useTabFetch(
    tab === "timetable" && ttArm ? "/api/timetable?classArm=" + encodeURIComponent(ttArm) : null,
    { enabled: tab === "timetable" && !!ttArm, deps: [ttArm], transform: (d) => d.entries || [] }
  );
  useEffect(() => { if (ttEntriesResult) setTtEntries(ttEntriesResult); }, [ttEntriesResult]);

  // Timetable: load the school's bell schedule for the period-times editor.
  const ttSchoolResult = useTabFetch("/api/school", {
    enabled: tab === "timetable" && !!ttArm,
    deps: [ttArm],
    onData: (data) => {
      setPeriodTimesDraft(getPeriodTimes(data.school).map((p) => ({ ...p })));
      setBreakDraft(getBreakTime(data.school));
      const ds = data.school?.dailySchedules || {};
      setDailyDrafts(
        Object.fromEntries(
          DAYS.filter((d) => ds[d]).map((d) => [
            d,
            {
              periodTimes: getPeriodTimes(data.school, d).map((p) => ({ ...p })),
              breakTimes: { ...getBreakTime(data.school, d) },
            },
          ])
        )
      );
    },
  });

  const { data: auditData } = useTabFetch("/api/fees/audit", {
    enabled: tab === "fees",
    transform: (d) => d.entries || [],
  });
  useEffect(() => { if (auditData) setAudit(auditData); }, [auditData, setAudit]);

  const { data: reconcileData } = useTabFetch("/api/fees/reconcile", {
    enabled: tab === "fees",
    transform: (d) => d.pending || [],
  });
  useEffect(() => { if (reconcileData) setPendingReconciles(reconcileData); }, [reconcileData, setPendingReconciles]);

  // Roles & Access: role-change audit trail via useTabFetch
  const { data: roleAuditData } = useTabFetch("/api/users/roles/audit", {
    enabled: tab === "roles",
    transform: (d) => d.entries || [],
  });
  useEffect(() => { if (roleAuditData) setRoleAudit(roleAuditData); }, [roleAuditData]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!session?.user || !STAFF_ROLES.includes(session.user.role)) {
      bounceToLogin(router);
      return;
    }
    setLastSync(Date.now());
    setTtArm(session.school?.activeArms?.[0] || "");

    Promise.all([
      fetch("/api/admin/stats"),
      fetch("/api/users?role=TEACHER"),
      fetch("/api/users?role=STUDENT"),
      fetch("/api/users?role=PARENT"),
    ]).then(async ([statsRes, teachersRes, studentsRes, parentsRes]) => {
      setStats((await statsRes.json()).stats);
      setTeachers((await teachersRes.json()).users);
      setStudents((await studentsRes.json()).users);
      setParents((await parentsRes.json()).users);
      if (session.user?.role === "SUPER_ADMIN") {
        fetch("/api/timetable/health")
          .then((r) => r.json())
          .then((d) => setTtHealth(d))
          .catch((e) => warn("tt-health", "refresh failed:", e?.message));
      }
      setLoading(false);
    });
  }, [session, sessionLoading, router]);

  // Tick every minute so "Last synced X ago" relative time updates
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

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
    offlineFetch: offlineSync.offlineFetch,
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


  if (loading) {
    return <DashboardSkeleton />;
  }

  // Role gates for the shared admin console — permission-driven so the UI
  // tracks ROLE_PERMISSIONS (the single source of truth). Every action here
  // is enforced server-side by requirePermission on the same action string,
  // so the menu cannot drift from what the API actually allows.
  const myRole = session.user?.role;
  const isSuper = can(myRole, "users.manage");
  const canFees = can(myRole, "fees.view");
  const canRoster = can(myRole, "students.manage");
  const canReports = can(myRole, "reports.view");
  const canSchoolEdit = can(myRole, "school.edit");
  const ROLE_LABEL = {
    SUPER_ADMIN: "Super Admin",
    BURSAR: "Bursar",
    REGISTRAR: "Registrar",
  };

  const visibleTabs = getVisibleTabs(myRole);
  // A role-specific hash (e.g. /admin/dashboard#fees as a BURSAR) must not
  // land on a tab they can't see — fall back to the first visible tab.
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0].key;

  const maxArm = Math.max(1, ...Object.values(stats.classDistribution || {}));

  return (
    <AdminProvider value={{
      // Core
      session, setSession, stats, setStats, showToast,
      // Roster
      teachers, setTeachers, students, setStudents, parents,
      filteredTeachers, filteredStudents,
      parentNameById, findParentByName, findParentByPhone,
      // Permissions
      isSuper, canFees, canRoster, canReports, canSchoolEdit,
      // Navigation & modals
      tab, setTab, modal, setModal, setFreezeModal,
      // User CRUD
      form, setForm, saving, editingUser,
      createdUserDisplay, closeCreatedUserDisplay, closeAddModal,
      createUser, togglePayroll, toggleFee, openReset, openEdit,
      deleteTarget, setDeleteTarget, deletingUser, confirmDeleteUser,
      resetTarget, setResetTarget, resetNewPassword, setResetNewPassword, resetDone,
      resetCopied, resetPassword, copyNewPassword,
      // Parent linking
      linkModal, setLinkModal, unlinkParent, linkParent, linkSaving,
      linkResult, linkForm, setLinkForm,
      // Report cards
      reportPayload, setReportPayload, openReport, reportLoading,
      // Fee management
      feeStructures, feeLedger, feeTotals, pendingPayments, audit,
      pendingReconciles, confirmingId,
      feeClass, setFeeClass, feeDefaultersOnly, setFeeDefaultersOnly,
      feeDraft, setFeeDraft, feeSaving, confirmPayment, saveFeeStructure,
      payModal, setPayModal, payForm, setPayForm, recordPayment,
      reminderModal, setReminderModal, reminderSending, reminderResult,
      setReminderResult, reminderMessage, setReminderMessage,
      reminderStudentMessage, setReminderStudentMessage,
      sendReminders, loadReminderTemplates,
      reconcileModal, setReconcileModal, reconcileSending,
      reconcileResult, setReconcileResult, reconcileAndForward,
      // Timetable
      ttArm, setTtArm, ttEntries, ttByKey, ttFilled, ttConflicts,
      ttConflictsOpen, setTtConflictsOpen, ttConflictsLoading,
      ttConflictFixing, dayTimeline, dayTimelines, dayPeriodSets,
      openTtCell, saveTtSlot, clearTtSlot, checkTtConflicts,
      fixTtConflict, swapTtTeacher, ttSwapDraft, setTtSwapDraft,
      ttHealth, ttHealthScanning, scanSchedule, ttFlaggedSlots, ttModal, setTtModal, ttDraft, setTtDraft, ttSaving,
      ttTeachersForSubject, bellDraft, bellDay, dailyDrafts,
      selectBellDay, setBellDayPeriodCount, setPeriodTime,
      setBreakTime, resetBellDay, savePeriodTimes, periodTimesSaving,
      // Term rollover
      rolloverOpen, setRolloverOpen, openRollover, rolloverTermName,
      setRolloverTermName, rolloverSession, setRolloverSession,
      rolloverPreview, setRolloverPreview, rolloverPreviewing,
      rolloverSaving, previewRollover, confirmRollover,
      // Scope editor
      subjects, scopeTarget, setScopeTarget, scopeDraft, setScopeDraft,
      scopeSaving, openScope, saveScope,
      // School lifecycle
      flipSchoolStatus, schoolBusy, exitStep, setExitStep, submitExitSurvey, exitRestorableUntil,
      // Helpers
      naira, subjects, myRole,
      feeDelta, maxArm, router,
    }}>
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar role={myRole} open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeTab={activeTab} />

      {/* min-w-0: the flex item must be allowed to shrink below its content's
          min-width, or wide children (metric grids, tables, tab strips) blow
          the whole page out horizontally on small screens */}
      <div className="min-w-0 flex-1 lg:pl-64">
        {/* Impersonation timeout banner — only shown when platform admin is impersonating */}
        {session?.impersonation && (
          <ImpersonationBanner impersonation={session.impersonation} />
        )}
        {/* Billing enforcement banner */}
        <div className="px-4 pt-4">
          <BillingBanner isSuperAdmin={isSuper} />
          {isSuper && <StudentLimitBanner />}
        </div>
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-navy-200/70 bg-white/80 px-5 backdrop-blur-lg">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="shrink-0 rounded-lg p-2 text-navy-600 hover:bg-navy-50 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* The school's uploaded logo sits beside its name in every
                portal header — branding follows the tenant everywhere.
                Clicking the name returns to the dashboard Overview from any
                tab (the logo-to-home convention). */}
            <button
              onClick={() => {
                setTab("overview");
                history.replaceState(null, "", "/admin/dashboard");
              }}
              title="Back to dashboard"
              className="group flex min-w-0 items-center gap-3 text-left"
            >
              {session.school?.logoUrl && (
                <img
                  src={session.school.logoUrl}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-lg bg-white object-contain ring-1 ring-navy-100"
                />
              )}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 truncate text-sm font-bold text-navy-800 transition group-hover:text-brand-600">
                  {activeTab !== "overview" && <ArrowLeft className="h-3.5 w-3.5 shrink-0" />}
                  {session.school?.name}
                </span>
                <span className="truncate text-xs text-navy-400">
                  {session.school?.currentSession} · {session.school?.currentTerm}
                  {lastSync && (
                    <span className="ml-2 inline-flex items-center gap-1 text-navy-300">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-navy-300" />
                      synced {timeAgo(lastSync)}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" /> {ROLE_LABEL[myRole] || myRole}
            </span>
            {session?.school?.id && session?.user?.id && (
              <PushNotificationManager schoolId={session.school.id} userId={session.user.id} />
            )}
            {offlineSync.pendingCount > 0 && !offlineSync.isOffline && (
              <button
                onClick={offlineSync.syncPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-600/20 transition hover:bg-amber-100"
              >
                {offlineSync.syncing ? "Syncing…" : `${offlineSync.pendingCount} pending`}
              </button>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              {session.user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Soft-deactivation banner — the SUPER_ADMIN is the only one who can
            still sign in to a frozen school, so they always see this with the
            reactivate action right there. */}
        {session.school?.status !== "active" && (
          <div
            className={`border-b px-5 py-3 ${
              session.school?.status === "frozen" ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"
            }`}
          >
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${session.school?.status === "frozen" ? "text-amber-600" : "text-rose-600"}`}
                />
                {session.school?.status === "frozen" ? (
                  <p className="text-sm text-amber-900">
                    <strong>{session.school?.name}</strong> is deactivated — all staff and student
                    logins are blocked. Your data is safe and nothing has been deleted; reactivate
                    the account anytime to resume.
                  </p>
                ) : (
                  <p className="text-sm text-rose-900">
                    <strong>{session.school?.name}</strong> was deleted{" "}
                    {session.school?.deletedAt
                      ? `on ${new Date(session.school.deletedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
                      : ""}
                    . Its data is kept and recoverable for 30 days — restore the account to keep
                    it, otherwise it will be permanently removed.
                  </p>
                )}
              </div>
              <button
                onClick={() => setFreezeModal(session.school?.status === "frozen" ? "reactivate" : "restore")}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500"
              >
                <RefreshCw className="h-3.5 w-3.5" />{" "}
                {session.school?.status === "frozen" ? "Reactivate school" : "Restore school"}
              </button>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-7xl px-5 py-8">
          {/* Metric cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={Users}
              label="Total Students"
              value={stats.totalStudents}
              sub="Across all class arms"
              accent="brand"
            />
            <MetricCard
              icon={GraduationCap}
              label="Active Teachers"
              value={stats.activeTeachers}
              sub={`${stats.payrollPaid} paid · ${stats.payrollPending} pending`}
              accent="navy"
            />
            <MetricCard
              icon={Wallet}
              label="Fee Collection"
              value={`${stats.feeRate}%`}
              sub={`${stats.feeCollected} of ${stats.totalStudents} students paid · ${naira(stats.feeCollectedAmount)} collected`}
              accent="emerald"
              spark={stats.collectionTimeline?.map((t) => t.amount)}
            />
            <MetricCard
              icon={CreditCard}
              label="Payroll Status"
              value={`${stats.payrollPaid}/${stats.activeTeachers}`}
              sub={`${stats.payrollPending} teachers awaiting payment`}
              accent="amber"
            />
            {/* Schedule Health — extracted to ScheduleHealthCard.js */}
            {isSuper && <ScheduleHealthCard />}
          </div>

          {/* Pending payment notification — a parent paid and is awaiting confirmation.
              Only shown to roles that can open the Fee Management tab (a registrar
              can't confirm anything, so the banner would be a dead end for them). */}
          {canFees && stats.pendingPayments?.count > 0 && (
            <button
              onClick={() => setTab("fees")}
              className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-left shadow-sm transition hover:border-amber-300 hover:bg-amber-100"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow-md shadow-amber-600/30">
                <Banknote className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-amber-800">
                  {stats.pendingPayments.count} parent payment{stats.pendingPayments.count === 1 ? "" : "s"} awaiting confirmation
                </span>
                <span className="block truncate text-xs text-amber-700">
                  {naira(stats.pendingPayments.amount)} paid via the parent portal — confirm receipt to update balances.
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">
                Review <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
          )}

          {/* Tabs — horizontally scrollable on small screens so the strip
              never pushes the page wider than the viewport */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <div className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
              {/* w-max + nowrap: single-line strip that scrolls on small screens.
                  On desktop (lg) the strip reverts to filling the row and tabs
                  wrap their labels as before, so nothing is cut off. */}
              <div className="flex w-max gap-1 rounded-xl bg-navy-100 p-1 lg:w-full lg:flex-wrap">
                {visibleTabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTab(t.key);
                      history.replaceState(null, "", t.key === "overview" ? "/admin/dashboard" : `/admin/dashboard#${t.key}`);
                    }}
                    className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition lg:whitespace-normal ${
                      activeTab === t.key ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-44 rounded-xl border border-navy-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              {canRoster && (
                <a
                  href="/admin/import"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700"
                  title="Bulk import students & teachers from a CSV"
                >
                  <Upload className="h-4 w-4" /> Import
                </a>
              )}
              {canRoster && (
                <a
                  href="/admin/quick-add"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700"
                  title="Quick-add students by pasting their names"
                >
                  <UserPlus className="h-4 w-4" /> Quick Add
                </a>
              )}
              {isSuper && (
                <>
                  <button
                    onClick={() => setModal("teacher")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700"
                  >
                    <Plus className="h-4 w-4" /> Teacher
                  </button>
                  <button
                    onClick={() => setModal("staff")}
                    title="Add a bursar or registrar account"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700"
                  >
                    <Plus className="h-4 w-4" /> Staff
                  </button>
                </>
              )}
              {canRoster && (
                <button
                  onClick={() => setModal("student")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
                >
                  <Plus className="h-4 w-4" /> Student
                </button>
              )}
            </div>
          </div>

          {/* Overview — clean neutral */}
          {activeTab === "overview" && (
            <div className="mt-6 rounded-2xl bg-white/60 p-1">
              <ErrorBoundary label="Overview"><OverviewTab /></ErrorBoundary>
            </div>
          )}

          {/* Timetable — blue calendar theme */}
          {activeTab === "timetable" && (
            <div className="mt-6 rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/40 p-1 shadow-sm shadow-blue-100/50">
              <TimetableTab />
            </div>
          )}

          {/* Fee Management — emerald money theme */}
          {activeTab === "fees" && (
            <div className="mt-6 rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/40 p-1 shadow-sm shadow-emerald-100/50">
              <FeesTab />
            </div>
          )}

          {/* Report Cards — purple document theme */}
          {activeTab === "reports" && (
            <div className="mt-6 rounded-2xl border border-purple-200/60 bg-gradient-to-br from-purple-50/60 via-white to-violet-50/40 p-1 shadow-sm shadow-purple-100/50">
              <ReportsTab openReportModal={(data) => setReportPayload(data)} />
            </div>
          )}

          {/* Teachers & Payroll — indigo people theme */}
          {activeTab === "teachers" && (
            <div className="mt-6 rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/60 via-white to-blue-50/40 p-1 shadow-sm shadow-indigo-100/50">
              <TeachersTab />
            </div>
          )}

          {/* Students & Fees — cyan theme */}
          {activeTab === "students" && (
            <div className="mt-6 rounded-2xl border border-cyan-200/60 bg-gradient-to-br from-cyan-50/60 via-white to-sky-50/40 p-1 shadow-sm shadow-cyan-100/50">
              <StudentsTab />
            </div>
          )}

          {/* Classes & Arms — orange structure theme */}
          {activeTab === "classes" && (
            <div className="mt-6 rounded-2xl border border-orange-200/60 bg-gradient-to-br from-orange-50/60 via-white to-amber-50/40 p-1 shadow-sm shadow-orange-100/50">
              <ClassesTab />
            </div>
          )}

          {/* Roles & Access — rose security theme */}
          {activeTab === "roles" && (
            <div className="mt-6 rounded-2xl border border-rose-200/60 bg-gradient-to-br from-rose-50/60 via-white to-red-50/40 p-1 shadow-sm shadow-rose-100/50">
              <RolesTab openReset={openReset} />
            </div>
          )}

          {/* Login Details — amber credentials theme */}
          {activeTab === "logins" && (
            <div className="mt-6 rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/60 via-white to-yellow-50/40 p-1 shadow-sm shadow-amber-100/50">
              <LoginsTab openReset={openReset} />
            </div>
          )}          {/* Previous Terms — muted slate archive theme */}
          {activeTab === "archives" && (
            <div className="mt-6 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50/80 via-white to-gray-50/40 p-1 shadow-sm shadow-slate-100/50">
              <ArchivesTab openReportPayload={(data) => setReportPayload(data)} />
            </div>
          )}

          {/* Billing — cyan finance theme */}
          {activeTab === "billing" && (
            <div className="mt-6 rounded-2xl border border-cyan-200/60 bg-gradient-to-br from-cyan-50/60 via-white to-teal-50/40 p-1 shadow-sm shadow-cyan-100/50">
              <ErrorBoundary label="Billing"><BillingTab /></ErrorBoundary>
            </div>
          )}

          {/* Settings — gray config theme */}
          {activeTab === "settings" && (
            <div className="mt-6 rounded-2xl border border-gray-200/60 bg-gradient-to-br from-gray-50/60 via-white to-slate-50/40 p-1 shadow-sm shadow-gray-100/50">
              <ErrorBoundary label="Settings"><SettingsTab setTab={setTab} /></ErrorBoundary>
            </div>
          )}

          {/* Scheme of Work — pink curriculum theme */}
          {activeTab === "scheme" && (
            <div className="mt-6 rounded-2xl border border-pink-200/60 bg-gradient-to-br from-pink-50/60 via-white to-rose-50/40 p-1 shadow-sm shadow-pink-100/50">
              <ErrorBoundary label="Scheme of Work"><SchemeOfWorkTab session={session} /></ErrorBoundary>
            </div>
          )}

          {/* Risk Alerts — red safety theme */}
          {activeTab === "risk" && (
            <div className="mt-6 rounded-2xl border border-red-200/60 bg-gradient-to-br from-red-50/60 via-white to-orange-50/40 p-1 shadow-sm shadow-red-100/50">
              <ErrorBoundary label="Risk Alerts"><RiskAlerts session={session} /></ErrorBoundary>
            </div>
          )}

          {/* Teacher Performance — teal analytics theme */}
          {activeTab === "performance" && (
            <div className="mt-6 rounded-2xl border border-teal-200/60 bg-gradient-to-br from-teal-50/60 via-white to-cyan-50/40 p-1 shadow-sm shadow-teal-100/50">
              <ErrorBoundary label="Teacher Performance"><TeacherPerformance session={session} /></ErrorBoundary>
            </div>
          )}

          {/* Alumni — violet graduates theme */}
          {activeTab === "alumni" && (
            <div className="mt-6 rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50/60 via-white to-purple-50/40 p-1 shadow-sm shadow-violet-100/50">
              <ErrorBoundary label="Alumni"><AlumniTab session={session} /></ErrorBoundary>
            </div>
          )}

          {/* Parent Engagement — lime community theme */}
          {activeTab === "engagement" && (
            <div className="mt-6 rounded-2xl border border-lime-200/60 bg-gradient-to-br from-lime-50/60 via-white to-green-50/40 p-1 shadow-sm shadow-lime-100/50">
              <ErrorBoundary label="Parent Engagement"><EngagementTab session={session} /></ErrorBoundary>
            </div>
          )}

          {/* Branches — sky multi-campus theme */}
          {activeTab === "branches" && (
            <div className="mt-6 rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50/60 via-white to-blue-50/40 p-1 shadow-sm shadow-sky-100/50">
              <ErrorBoundary label="Branches"><BranchesTab session={session} /></ErrorBoundary>
            </div>
          )}

          {/* Compliance — stone legal theme */}
          {activeTab === "compliance" && (
            <div className="mt-6 rounded-2xl border border-stone-200/60 bg-gradient-to-br from-stone-50/60 via-white to-neutral-50/40 p-1 shadow-sm shadow-stone-100/50">
              <ErrorBoundary label="Compliance"><ComplianceTab session={session} /></ErrorBoundary>
            </div>
          )}

        </div>
      </div>

      {/* Report card viewer modal */}
      <ErrorBoundary label="Report Card Viewer"><ReportCardModal
        open={reportPayload !== null}
        onClose={() => setReportPayload(null)}
        school={reportPayload?.school}
        student={reportPayload?.student}
        scores={reportPayload?.scores || []}
        summary={reportPayload?.summary}
        attendance={reportPayload?.attendance}
        fileName={reportPayload?.student?.name?.toLowerCase().replace(/[^a-z]+/g, "-")}
      /></ErrorBoundary>

      <ErrorBoundary label="Link Parent"><LinkParentModal /></ErrorBoundary>

      <ErrorBoundary label="Reconcile Reminders"><ReconcileModal /></ErrorBoundary>

      <ErrorBoundary label="Fee Reminder"><FeeReminderModal /></ErrorBoundary>

      <ErrorBoundary label="Record Payment"><FeePaymentModal /></ErrorBoundary>


      <ErrorBoundary label="Add User"><AddUserModal /></ErrorBoundary>


      <ErrorBoundary label="Reset Password"><ResetPasswordModal /></ErrorBoundary>


      <ErrorBoundary label="Delete User"><DeleteUserModal /></ErrorBoundary>


      {/* Freeze / reactivate / restore — extracted to FreezeRestoreModal.js */}
      <ErrorBoundary label="Freeze / Reactivate"><FreezeRestoreModal /></ErrorBoundary>


      {/* School exit flow — extracted to ExitFlowModal.js */}
      <ErrorBoundary label="Exit Survey"><ExitFlowModal inputCls={inputCls} /></ErrorBoundary>

      <ErrorBoundary label="Scope Editor"><ScopeEditorModal /></ErrorBoundary>


      <ErrorBoundary label="Term Rollover"><TermRolloverModal /></ErrorBoundary>


      <ErrorBoundary label="Timetable Cell"><TimetableCellModal /></ErrorBoundary>


      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
    </AdminProvider>
  );
}

export default function AdminDashboard() {
  return (
    <FeeProvider>
      <AdminDashboardInner />
    </FeeProvider>
  );
}
