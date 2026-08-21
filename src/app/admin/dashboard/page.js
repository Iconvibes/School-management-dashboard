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
import { AdminProvider } from "@/components/admin/context/AdminContext";
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
import { bounceToLogin } from "@/lib/auth-client";
import { safeFetchJson } from "@/lib/safe-fetch";
import { MANAGED_ROLES, ROLE_LABELS } from "@/lib/roles";
import { sparklinePoints } from "@/lib/conflict-scan";
import { payrollToggleDelta, negateToggleDelta } from "@/lib/toggles";
import {
  DEFAULT_REMINDER_MESSAGE,
  DEFAULT_STUDENT_REMINDER_MESSAGE,
} from "@/lib/notifications";

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
const ROLE_BADGES = {
  SUPER_ADMIN: "bg-navy-900 text-white",
  BURSAR: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REGISTRAR: "bg-brand-50 text-brand-700 ring-brand-600/20",
  TEACHER: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

function PayrollBadge({ status }) {
  const paid = status === "PAID";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
        paid
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
          : "bg-amber-50 text-amber-700 ring-amber-600/20"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${paid ? "bg-emerald-500" : "bg-amber-500"}`} />
      {paid ? "Paid" : "Pending"}
    </span>
  );
}

// Fee audit trail — human labels + badge colours per action type.
const AUDIT_META = {
  PAYMENT_RECORDED: {
    label: "Payment recorded",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  PAYMENT_CONFIRMED: {
    label: "Payment confirmed",
    cls: "bg-blue-50 text-blue-700 ring-blue-600/20",
  },
  PARENT_PAYMENT_SUBMITTED: {
    label: "Parent payment submitted",
    cls: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  RECEIPT_DOWNLOADED: {
    label: "Receipt downloaded",
    cls: "bg-navy-50 text-navy-600 ring-navy-600/20",
  },
  REMINDER_SENT: {
    label: "Reminder sent",
    cls: "bg-violet-50 text-violet-700 ring-violet-600/20",
  },
  REMEDY_FORWARDED: {
    label: "Reminders forwarded",
    cls: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
};

function AuditBadge({ action }) {
  const meta = AUDIT_META[action] || {
    label: action || "Fee action",
    cls: "bg-navy-50 text-navy-600 ring-navy-600/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

/** "02:00"-style label for the health card's scheduled-scan line. */
const fmtHour = (h) => `${String(h ?? 2).padStart(2, "0")}:00`;

/** Compact relative time for the health card's "Scanned …" line. */
function timeAgo(iso) {
  if (!iso) return "never";
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
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
  // Fee management tab state
  const [feeStructures, setFeeStructures] = useState([]);
  const [feeLedger, setFeeLedger] = useState([]);
  const [feeTotals, setFeeTotals] = useState(null);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [confirmingId, setConfirmingId] = useState(null);
  const [feeClass, setFeeClass] = useState("");
  const [feeDefaultersOnly, setFeeDefaultersOnly] = useState(false);
  const [feeDraft, setFeeDraft] = useState({}); // classArm -> amount input
  const [payModal, setPayModal] = useState(null); // studentId
  const [payForm, setPayForm] = useState({ amount: "", method: "CASH", note: "" });
  const [feeSaving, setFeeSaving] = useState(false);
  // Reminder state — "Send reminder" to parents of defaulters
  const [reminderModal, setReminderModal] = useState(null); // null | "all" | studentId
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderResult, setReminderResult] = useState(null); // { sent, skipped } after send
  const [reminderMessage, setReminderMessage] = useState(DEFAULT_REMINDER_MESSAGE); // editable parent template
  const [reminderStudentMessage, setReminderStudentMessage] = useState(DEFAULT_STUDENT_REMINDER_MESSAGE); // no-parent student template
  // Reconcile & forward — push student-addressed reminders to newly linked parents
  const [pendingReconciles, setPendingReconciles] = useState([]);
  const [reconcileModal, setReconcileModal] = useState(false);
  const [reconcileSending, setReconcileSending] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null); // { forwarded, skipped }
  // Fee audit trail — who did what (record / confirm / parent pay / download)
  const [audit, setAudit] = useState([]);
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

  const subjects = getSubjects();

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  // Respond to sidebar hash links: /admin/dashboard#teachers etc.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (["classes", "teachers", "roles", "logins", "students", "fees", "reports", "timetable", "archives", "settings", "scheme", "risk", "performance", "alumni", "engagement", "branches", "compliance"].includes(hash)) setTab(hash);
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
  useEffect(() => { if (auditData) setAudit(auditData); }, [auditData]);

  const { data: reconcileData } = useTabFetch("/api/fees/reconcile", {
    enabled: tab === "fees",
    transform: (d) => d.pending || [],
  });
  useEffect(() => { if (reconcileData) setPendingReconciles(reconcileData); }, [reconcileData]);

  // Roles & Access: role-change audit trail via useTabFetch
  const { data: roleAuditData } = useTabFetch("/api/users/roles/audit", {
    enabled: tab === "roles",
    transform: (d) => d.entries || [],
  });
  useEffect(() => { if (roleAuditData) setRoleAudit(roleAuditData); }, [roleAuditData]);

  async function confirmPayment(id) {
    setConfirmingId(id);
    try {
      const res = await fetch("/api/fees/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to confirm payment");
      showToast(`Payment confirmed — balance updated`);
      // Refresh ledger + pending list + stats
      const params = new URLSearchParams();
      if (feeClass) params.set("classArm", feeClass);
      if (feeDefaultersOnly) params.set("defaulters", "1");
      const lr = await fetch(`/api/fees?${params}`);
      const ld = await lr.json();
      setFeeLedger(ld.ledger || []);
      setFeeTotals(ld.totals || null);
      setPendingPayments(ld.pendingPayments || []);
      const sr = await fetch("/api/admin/stats");
      setStats((await sr.json()).stats);
      const ar = await fetch("/api/fees/audit");
      setAudit((await ar.json()).entries || []);
    } catch (err) {
      showToast(err.message);
    } finally {
      setConfirmingId(null);
    }
  }

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

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      // Any staff role opens the admin console; everyone else is redirected.
      if (!meData.user || !STAFF_ROLES.includes(meData.user.role)) {
        bounceToLogin(router);
        return;
      }
      setSession(meData);
      setTtArm(meData.school?.activeArms?.[0] || "");

      const [statsRes, teachersRes, studentsRes, parentsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/users?role=TEACHER"),
        fetch("/api/users?role=STUDENT"),
        fetch("/api/users?role=PARENT"),
      ]);
      setStats((await statsRes.json()).stats);
      setTeachers((await teachersRes.json()).users);
      setStudents((await studentsRes.json()).users);
      setParents((await parentsRes.json()).users);
      // Schedule Health — the daily conflict scan (auto-runs server-side when
      // stale; the Overview just displays the result). SUPER_ADMIN only.
      if (meData.user?.role === "SUPER_ADMIN") {
        fetch("/api/timetable/health")
          .then((r) => r.json())
          .then((d) => setTtHealth(d))
          .catch((e) => console.warn("[tt-health] refresh failed:", e?.message));
      }
      setLoading(false);
    })();
  }, [router]);

  // Optimistic instant toggles: the badge flips immediately, a failed PATCH
  // reverts it (with the error toast), and pendingToggleRef guards against
  // double-clicks while a flip is in flight so a slow network can't stack
  // two PATCHes for one click. Money and irreversible actions (payments,
  // confirmations, deletions) deliberately stay pessimistic.
  const pendingToggleRef = useRef(new Set());

  async function togglePayroll(id, current) {
    if (pendingToggleRef.current.has(id)) return;
    const next = current === "PAID" ? "PENDING" : "PAID";
    const delta = payrollToggleDelta(next);
    const undo = negateToggleDelta(delta);
    // Flip now — the badge and the Overview stat cards update instantly.
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
      // Revert via the inverse delta — concurrent updates to OTHER rows are
      // preserved because the revert applies to live state, not a snapshot.
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
    // Flip now — the Paid/Unpaid chip updates instantly.
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
      // Exact restore of the pre-flip value — the chip snaps back.
      setStudents((ss) => ss.map((s) => (s.id === id ? { ...s, feePaid: current } : s)));
      showToast(err.message || "Failed to update fee status");
    } finally {
      pendingToggleRef.current.delete(key);
    }
  }

  async function createUser(role) {
    setSaving(true);
    try {
      // The modal value is lowercase ("teacher" | "student" | "staff") but
      // the API requires the uppercase role enum — normalize before sending.
      // For "staff", form.staffRole holds the chosen BURSAR/REGISTRAR.
      const roleEnum = String(role === "staff" ? form.staffRole || "BURSAR" : role || "").toUpperCase();

      // Edit mode: PATCH the existing row (name/class/subjects/arms only —
      // email is the login identity and stays immutable; passwords move
      // through the reset flow).
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
          payrollPending: s.payrollPending + 1, // new teachers start PENDING
        }));
      } else if (roleEnum === "BURSAR" || roleEnum === "REGISTRAR") {
        // Staff accounts land nowhere on this dashboard's tables (no roster/
        // payroll rows for them) — the toast below confirms the creation.
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

      // When a student is created with a password, show the login details in
      // the modal before closing — the admin needs to hand the credentials to
      // the student right away. Gated on the STUDENT role: the server also
      // records the admin-chosen password as generatedPassword for teachers &
      // staff (for the Login Details export), and that must NOT open this
      // popup — the admin just typed that password themselves, and the toast
      // below confirms the creation.
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

  // Open the add-modal in edit mode with the row's current values prefilled.
  // Email is immutable by design (it's the login identity), so it renders
  // read-only here — replacing an account entirely is remove + re-add.
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

  // Soft deactivate / reactivate the school account: freeze blocks every
  // non-super-admin login while keeping ALL data; reactivate flips it back.
  // A page reload re-syncs /api/auth/me (status banner) and all the data.
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

  // Deactivate & wipe the whole school: the exit survey is sent to the
  // platform first, then DELETE /api/school removes the tenant and every byte
  // of its data. Only SUPER_ADMIN can reach this (users.manage).
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

  // Remove a student (left the school) or teacher (departed) — SUPER_ADMIN
  // only, matching the DELETE /api/users policy. Their scores/attendance/fees
  // (student) or timetable slots (teacher) go with them.
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

  // Open the teaching-scope editor for a teacher. Seeds the draft from the
  // teacher's CURRENT scope — multi-arm teachers get their arms, legacy
  // single-arm teachers get their singular arm pre-selected as an arm chip.
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

  // Save the edited scope through PATCH — the API's SUPER_ADMIN gate (and the
  // field-level mayEditUser guard) re-validates it, and the store persists the
  // exact arrays the teacher portal will enforce.
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
          // Keep the legacy display/default arm in sync with the first pick.
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

  const filteredTeachers = teachers.filter((t) =>
    (t.name + t.email + (t.assignedClass || "")).toLowerCase().includes(search.toLowerCase())
  );
  const filteredStudents = students.filter((s) =>
    (s.name + s.email + (s.assignedClass || "")).toLowerCase().includes(search.toLowerCase())
  );

  const parentNameById = Object.fromEntries(parents.map((p) => [p.id, p.name]));
  // Case/whitespace-insensitive match against the loaded parent list — used
  // by the live "already exists" hint under the New-parent name field and by
  // the duplicate guard in linkParent (the server enforces the same rule).
  const findParentByName = (name) =>
    parents.find(
      (p) =>
        p.role === "PARENT" &&
        String(p.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase()
    );
  // Phone is the secondary dedupe key (the importer normalizes the same
  // way): digits only, so "0803 123 4567" and "+2348031234567" are one
  // number. Empty input never matches — a parent with no phone can't be
  // hit by a blank field.
  const normPhone = (p) => String(p || "").replace(/\D/g, "");
  const findParentByPhone = (phone) => {
    const norm = normPhone(phone);
    if (!norm) return null;
    return parents.find((p) => p.role === "PARENT" && normPhone(p.phone) === norm);
  };

  async function linkParent(studentId) {
    setLinkSaving(true);
    try {
      let parentId = linkForm.parentId;
      if (linkForm.mode === "create") {
        // Name-only parents: the admin types just the full name — no email,
        // no password. The password is derived automatically from the linked
        // student's full name (the PATCH below triggers the store's
        // parent-link sync).
        if (!String(linkForm.name || "").trim()) {
          throw new Error("Please enter the parent's full name");
        }
        // Friendly duplicate check against the loaded parent list (the
        // server enforces the same rule authoritatively — this just guides
        // the admin straight to the existing account instead of an error).
        // A parent's name is their login identifier, so a second account
        // with the same name would be silently shadowed by name-based login.
        const dup = findParentByName(linkForm.name);
        if (dup) {
          setLinkForm((f) => ({ ...f, mode: "select", parentId: dup.id }));
          showToast(`“${dup.name}” already exists — link them instead of creating a duplicate.`);
          return;
        }
        // Phone is the secondary dedupe key — if the typed phone already
        // belongs to another parent (and the name didn't match anyone),
        // guide to that account too. The admin can still create a fresh
        // account by clearing the phone field (a shared number is the one
        // legit reason to skip).
        const phoneDup = findParentByPhone(linkForm.phone);
        if (phoneDup) {
          setLinkForm((f) => ({ ...f, mode: "select", parentId: phoneDup.id }));
          showToast(
            `“${phoneDup.name}” already uses this phone — link them instead of creating a duplicate.`
          );
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
      // Surface the auto-derived password right in the modal: the linked
      // student's full name is exactly what the parent types to sign in
      // (case and spacing don't matter). The modal stays open on a success
      // panel so the admin can hand the credentials to the parent.
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

  async function saveFeeStructure(classArm) {
    setFeeSaving(true);
    try {
      const res = await fetch("/api/fees/structures", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classArm, amount: feeDraft[classArm] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save fee structure");
      setFeeStructures((prev) => {
        const existing = prev.find((s) => s.classArm === classArm);
        return existing
          ? prev.map((s) => (s.classArm === classArm ? data.structure : s))
          : [...prev, data.structure];
      });
      // Recompute the ledger + totals right away: students in this arm are now
      // billed, so the ledger rows (and the Send reminders count) must reflect
      // it without a manual page refresh.
      const params = new URLSearchParams();
      if (feeClass) params.set("classArm", feeClass);
      if (feeDefaultersOnly) params.set("defaulters", "1");
      const lr = await fetch(`/api/fees?${params}`);
      const ld = await lr.json();
      setFeeLedger(ld.ledger || []);
      setFeeTotals(ld.totals || null);
      const sr = await fetch("/api/admin/stats");
      setStats((await sr.json()).stats);
      showToast(`Fee for ${classArm} updated`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setFeeSaving(false);
    }
  }

  // Prefill the Send reminder modal with the school's saved wording (falling
  // back to the built-in defaults) so the admin never retypes it. Called each
  // time the modal opens — the parent message and the no-parent student
  // message are loaded independently.
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
    // scope: "all" (every defaulter) or a single studentId (one student's row)
    setReminderSending(true);
    setReminderResult(null);
    // Idempotency key for THIS send attempt — if the request is retried (a
    // double click, a network replay), the API replays the recorded result
    // instead of notifying anyone twice. A fresh key = a legitimately new send.
    const batchId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const res = await fetch("/api/fees/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(scope === "all" ? {} : { studentIds: [scope] }),
          message: reminderMessage,
          messageStudent: reminderStudentMessage,
          batchId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reminders");
      setReminderResult(data);
      if (data.sent?.length > 0) {
        showToast(
          `Reminder${data.sent.length === 1 ? "" : "s"} sent to ${data.sent.length} parent${data.sent.length === 1 ? "" : "s"} — wording saved as this school's default`
        );
      }
      // Refresh the audit trail — the sends are logged there.
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
      // The originals are reconciled — the pending list drops to zero, and the
      // forwards are on the audit trail.
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

  async function recordPayment() {
    if (!payModal) return;
    setFeeSaving(true);
    try {
      const res = await fetch("/api/fees/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: payModal, ...payForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record payment");
      showToast(`Payment recorded · ${data.payment.receiptNo}`);
      setPayModal(null);
      setPayForm({ amount: "", method: "CASH", note: "" });
      // Refresh ledger + stats
      const params = new URLSearchParams();
      if (feeClass) params.set("classArm", feeClass);
      if (feeDefaultersOnly) params.set("defaulters", "1");
      const lr = await fetch(`/api/fees?${params}`);
      const ld = await lr.json();
      setFeeLedger(ld.ledger || []);
      setFeeTotals(ld.totals || null);
      const sr = await fetch("/api/admin/stats");
      setStats((await sr.json()).stats);
      const ar = await fetch("/api/fees/audit");
      setAudit((await ar.json()).entries || []);
    } catch (err) {
      showToast(err.message);
    } finally {
      setFeeSaving(false);
    }
  }

  const naira = (n) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);

  // Fee card delta — last 7 days vs the 7 before, from the collection timeline.
  const feeDelta = useMemo(() => {
    const tl = stats?.collectionTimeline || [];
    if (tl.length < 8) return null;
    const recent = tl.slice(-7).reduce((a, d) => a + (d.amount || 0), 0);
    const prev = tl.slice(-14, -7).reduce((a, d) => a + (d.amount || 0), 0);
    if (!prev) return null;
    return Math.round(((recent - prev) / prev) * 100);
  }, [stats?.collectionTimeline]);

  // ---- Timetable helpers ---------------------------------------------------
  const ttByKey = useMemo(() => {
    const m = {};
    ttEntries.forEach((e) => {
      m[`${e.day}|${e.period}`] = e;
    });
    return m;
  }, [ttEntries]);
  const ttFilled = ttEntries.length;
  // The realistic school day: teaching periods 1-4, the mid-day break, then
  // periods 5-8 — the grid renders this instead of bare period numbers.
  const dayTimeline = useMemo(() => getDayTimeline(session?.school), [session?.school]);
  // Per-weekday timelines: each day column resolves its OWN bell schedule, so
  // a short day (Friday ends at period 6) shows only its own periods.
  const dayTimelines = useMemo(
    () => Object.fromEntries(DAYS.map((d) => [d, getDayTimeline(session?.school, d)])),
    [session?.school]
  );
  const dayPeriodSets = useMemo(
    () =>
      Object.fromEntries(
        DAYS.map((d) => [
          d,
          new Set(
            (dayTimelines[d] || [])
              .filter((b) => b.type === "teaching")
              .map((b) => Number(b.period))
          ),
        ])
      ),
    [dayTimelines]
  );
  // The bell editor's active draft — the school-wide schedule for "All days",
  // or the selected weekday's own override.
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
  // Slots EVER flagged by a conflict scan (persisted history, unioned across
  // scans). Reassigning one warns the admin so a resolved conflict can never
  // silently regress — the history survives clean re-scans on purpose.
  const ttFlaggedSlots = useMemo(() => new Set(ttHealth?.flaggedSlots || []), [ttHealth?.flaggedSlots]);
  // The health card's trend sparkline — per-day conflict counts, rendered
  // only once there are 2+ scan days (a single point is not a trend).
  const ttSpark = useMemo(() => sparklinePoints(ttHealth?.history), [ttHealth?.history]);
  // Teachers who can teach the currently selected subject (legacy teachers
  // without subject assignments count for everything, like the API's check).
  const ttTeachersForSubject = teachers.filter(
    (t) => !t.subjects?.length || t.subjects.includes(ttDraft.subject)
  );

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
    // Regression guard: a slot that an earlier scan flagged (and that is no
    // longer part of a LIVE conflict — i.e. it was fixed) gets a confirm, so
    // reassigning it can't silently undo the fix. Live conflicts don't prompt:
    // the assign API refuses the bad save anyway, and changing the teacher IS
    // the fix.
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
      // Keep the Schedule Health flag state current after the change.
      fetch("/api/timetable/health")
        .then((r) => r.json())
        .then((d) => setTtHealth(d))
        .catch((e) => console.warn("[tt-health] refresh failed:", e?.message));
      if (ttConflictsOpen) checkTtConflicts(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtSaving(false);
    }
  }

  // The editor edits either the school-wide schedule ("ALL") or one weekday's
  // own override — same handlers, different draft target.
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

  // Pick which schedule the editor shows. First touch of a weekday seeds its
  // draft from the school's CURRENT resolution, so edits start from reality.
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

  // The short-day affordance: "how many periods run on this day?" Truncating
  // drops the afternoon periods (a Friday that ends at period 6); extending
  // pads with the default times for the new periods.
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

  // Drop a weekday's override — the day falls back to the school-wide bell.
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
      // Per-day overrides: every customized weekday ships its own full
      // schedule; days absent from dailyDrafts fall back to the school-wide
      // bell (the reset path removes the day, so it clears on save).
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
      // Mirror the saved bell schedule into the session so the grid's day
      // timelines (periods + break, per weekday) reflect the edit without a
      // page reload.
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
  // Open the modal with the school's current session prefilled; the dry-run
  // preview (counts only, nothing mutated) is fetched before confirming.
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
      // Mirror the new term into the session so every header, selector and
      // "this term" figure reflects it without a page reload.
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
      // Refresh term-scoped figures: overview stats + fee structures.
      fetch("/api/admin/stats")
        .then((r) => r.json())
        .then((d) => d.stats && setStats(d.stats))
        .catch((e) => console.warn("[stats] refresh failed:", e?.message));
      fetch("/api/fees/structures")
        .then((r) => r.json())
        .then((d) => {
          if (d.structures) {
            setFeeStructures(d.structures);
            setFeeDraft(Object.fromEntries(d.structures.map((s) => [s.classArm, s.amount])));
          }
        })
        .catch((e) => console.warn("[fee-structures] refresh failed:", e?.message));
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

  // ---- Conflicts checker -----------------------------------------------------
  // Scan every arm (the API resolves teacher names and gates to SUPER_ADMIN).
  // `silent` suppresses the result toast — used for background re-scans after
  // a save/clear so an open panel never shows stale data.
  async function checkTtConflicts(silent = false) {
    setTtConflictsLoading(true);
    try {
      const res = await fetch("/api/timetable?conflicts=1");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scan the timetable");
      setTtConflicts(data.conflicts);
      // Refresh the Schedule Health state too — the scan just recorded through
      // the same runner, so the cell-editor warning (live vs. resolved) must
      // reflect THIS scan, not the Overview's earlier one.
      fetch("/api/timetable/health")
        .then((r) => r.json())
        .then((d) => setTtHealth(d))
        .catch((e) => console.warn("[tt-health] scan refresh failed:", e?.message));
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

  // Manual "Scan now" from the Overview health card — POST records the scan
  // and flags collisions that are new since the previous one.
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

  // One-click fix: free one of the conflicting slots, then re-scan. The grid
  // for the currently selected arm updates too, when the freed slot is in it.
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
      await checkTtConflicts(true); // authoritative re-scan
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtConflictFixing(null);
    }
  }

  // One-click fix for a scope violation: assign a VALID teacher to the slot.
  // The assign API re-validates the substitute (subject, arm, double-booking)
  // server-side, so a stale candidate can never sneak through.
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
      await checkTtConflicts(true); // authoritative re-scan
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtConflictFixing(null);
    }
  }

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

  // Tabs each staff role may open (fees stay with admin+bursar; roster and
  // report cards with admin+registrar; payroll is admin-only).
  const visibleTabs = [
    { key: "overview", label: "Overview" },
    ...(canSchoolEdit ? [{ key: "classes", label: "Classes & Arms" }] : []),
    ...(isSuper ? [{ key: "teachers", label: "Teachers & Payroll" }] : []),
    ...(isSuper ? [{ key: "roles", label: "Roles & Access" }] : []),
    ...(isSuper ? [{ key: "logins", label: "Login Details" }] : []),
    ...(isSuper ? [{ key: "timetable", label: "Timetable" }] : []),
    ...(canRoster ? [{ key: "students", label: "Students & Fees" }] : []),
    ...(canFees ? [{ key: "fees", label: "Fee Management" }] : []),
    ...(canReports ? [{ key: "reports", label: "Report Cards" }] : []),
    // Historical scores/attendance live with the staff who own report cards.
    ...(isSuper || myRole === "REGISTRAR" ? [{ key: "archives", label: "Previous Terms" }] : []),
    // Branding lives with the school owner — logo upload + brand color.
    ...(isSuper ? [{ key: "settings", label: "Settings" }] : []),
    // Scheme of work, risk alerts, teacher performance, alumni.
    ...(isSuper ? [{ key: "scheme", label: "Scheme of Work" }] : []),
    ...(isSuper ? [{ key: "risk", label: "Risk Alerts" }] : []),
    ...(isSuper ? [{ key: "performance", label: "Teacher Performance" }] : []),
    ...(isSuper ? [{ key: "alumni", label: "Alumni" }] : []),
    ...(isSuper ? [{ key: "engagement", label: "Parent Engagement" }] : []),
    ...(isSuper ? [{ key: "branches", label: "Branches" }] : []),
    ...(isSuper ? [{ key: "compliance", label: "Compliance" }] : []),
  ];
  // A role-specific hash (e.g. /admin/dashboard#fees as a BURSAR) must not
  // land on a tab they can't see — fall back to the first visible tab.
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0].key;

  const maxArm = Math.max(1, ...Object.values(stats.classDistribution || {}));

  return (
    <AdminProvider value={{ session, setSession, stats, setStats, teachers, setTeachers, students, setStudents, parents, showToast }}>
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar role={myRole} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* min-w-0: the flex item must be allowed to shrink below its content's
          min-width, or wide children (metric grids, tables, tab strips) blow
          the whole page out horizontally on small screens */}
      <div className="min-w-0 flex-1 lg:pl-64">
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
                </span>
              </span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" /> {ROLE_LABEL[myRole] || myRole}
            </span>
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
            {/* Schedule Health — the daily timetable integrity scan. The
                background job (src/instrumentation.js) runs it at a fixed
                hour; flags collisions AND the other integrity checks (arms
                with unassigned days, unscheduled teachers, orphaned entries)
                new since last scan. */}
            {isSuper && (
              <div
                className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                  ttHealth?.issueCount
                    ? "border-rose-200 hover:shadow-lg hover:shadow-rose-900/5"
                    : "border-navy-200/70 hover:shadow-lg hover:shadow-navy-900/5"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-navy-500">Schedule Health</p>
                    <p
                      className={`mt-2 text-3xl font-bold tracking-tight ${
                        ttHealth?.issueCount ? "text-rose-600" : "text-navy-800"
                      }`}
                    >
                      {!ttHealth ? (
                        <Loader2 className="inline h-7 w-7 animate-spin text-navy-300" />
                      ) : ttHealth.neverScanned ? (
                        "Pending"
                      ) : (ttHealth.issueCount ?? 0) === 0 ? (
                        "Clear"
                      ) : (
                        `${ttHealth.issueCount} issue${ttHealth.issueCount === 1 ? "" : "s"}`
                      )}
                    </p>
                    <p className="mt-1.5 text-xs font-medium text-navy-400">
                      {ttHealth
                        ? ttHealth.neverScanned
                          ? `First scan scheduled ${fmtHour(ttHealth.scanHour)}`
                          : `Scanned ${timeAgo(ttHealth.scannedAt)} · daily scan ${fmtHour(ttHealth.scanHour)}`
                        : "Scanning…"}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl p-2.5 ring-1 ${
                      ttHealth?.issueCount
                        ? "bg-rose-50 text-rose-600 ring-rose-600/10"
                        : "bg-emerald-50 text-emerald-600 ring-emerald-600/10"
                    }`}
                  >
                    <Activity className="h-5 w-5" />
                  </div>
                </div>
                {ttHealth?.newConflictCount > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {ttHealth.newConflictCount} new collision{ttHealth.newConflictCount === 1 ? "" : "s"} since last scan
                  </div>
                )}
                {ttSpark && (
                  <div className="mt-3">
                    <svg
                      viewBox="0 0 120 28"
                      preserveAspectRatio="none"
                      className="h-7 w-full"
                      aria-hidden="true"
                    >
                      <polyline
                        points={ttSpark}
                        fill="none"
                        stroke={ttHealth?.issueCount ? "#f43f5e" : "#10b981"}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p className="mt-1 text-[10px] font-medium text-navy-400">
                      Conflict trend · last {ttHealth.history.length} scan day
                      {ttHealth.history.length === 1 ? "" : "s"}
                    </p>
                  </div>
                )}
                {/* The other integrity checks, surfaced as compact chips —
                    details live in the scan panel (Review in Timetable). */}
                {(ttHealth?.unassignedPeriodCount || 0) +
                  (ttHealth?.unstaffedTeacherCount || 0) +
                  (ttHealth?.orphanedEntryCount || 0) >
                  0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ttHealth.unassignedPeriodCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-600/20">
                        <CalendarX className="h-3 w-3" />
                        {ttHealth.unassignedPeriodCount} unassigned day
                        {ttHealth.unassignedPeriodCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {ttHealth.unstaffedTeacherCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-600/20">
                        <UserX className="h-3 w-3" />
                        {ttHealth.unstaffedTeacherCount} teacher
                        {ttHealth.unstaffedTeacherCount === 1 ? "" : "s"} unscheduled
                      </span>
                    )}
                    {ttHealth.orphanedEntryCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-600/20">
                        <Link2Off className="h-3 w-3" />
                        {ttHealth.orphanedEntryCount} orphaned entr
                        {ttHealth.orphanedEntryCount === 1 ? "y" : "ies"}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={scanSchedule}
                    disabled={ttHealthScanning}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
                  >
                    {ttHealthScanning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {ttHealthScanning ? "Scanning…" : "Scan now"}
                  </button>
                  {ttHealth?.issueCount > 0 && (
                    <button
                      onClick={() => {
                        setTab("timetable");
                        // checkTtConflicts scans AND opens the panel, so the
                        // Review link lands on the real conflicts, not the
                        // un-scanned "No conflicts" default.
                        checkTtConflicts(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-600/20 transition hover:bg-rose-100"
                    >
                      Review in Timetable <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
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

          {/* Overview */}
          {activeTab === "overview" && (
            <OverviewTab
              stats={stats}
              feeDelta={feeDelta}
              maxArm={maxArm}
              session={session}
              isSuper={isSuper}
              canRoster={canRoster}
              canFees={canFees}
              canReports={canReports}
              router={router}
              onNavigate={setTab}
              onOpenModal={setModal}
              onOpenRollover={openRollover}
              onFreeze={setFreezeModal}
              onDelete={() => setExitStep("confirm")}
            />
          )}

          {/* Previous Terms */}
{activeTab === "archives" && (
          <ArchivesTab openReportPayload={(data) => setReportPayload(data)} />
        )}

          {/* Classes & Arms */}
{activeTab === "classes" && (
          <ClassesTab />
        )}

          {/* Teachers */}
{activeTab === "teachers" && (
          <TeachersTab
            filteredTeachers={filteredTeachers}
            isSuper={isSuper}
            togglePayroll={togglePayroll}
            openReset={openReset}
            openScope={openScope}
            openEdit={openEdit}
            setDeleteTarget={setDeleteTarget}
          />
        )}

          {/* Roles & Access */}
{activeTab === "roles" && (
          <RolesTab openReset={openReset} />
        )}

          {/* Login Details */}
{activeTab === "logins" && (
          <LoginsTab openReset={openReset} />
        )}

          {/* Timetable */}
{activeTab === "timetable" && (
          <TimetableTab
            ttArm={ttArm}
            setTtArm={setTtArm}
            ttConflicts={ttConflicts}
            ttConflictsOpen={ttConflictsOpen}
            setTtConflictsOpen={setTtConflictsOpen}
            ttConflictsLoading={ttConflictsLoading}
            ttConflictFixing={ttConflictFixing}
            dayTimeline={dayTimeline}
            dayTimelines={dayTimelines}
            dayPeriodSets={dayPeriodSets}
            ttByKey={ttByKey}
            ttFilled={ttFilled}
            openTtCell={openTtCell}
            checkTtConflicts={checkTtConflicts}
            fixTtConflict={fixTtConflict}
            swapTtTeacher={swapTtTeacher}
            ttSwapDraft={ttSwapDraft}
            setTtSwapDraft={setTtSwapDraft}
            bellDraft={bellDraft}
            bellDay={bellDay}
            dailyDrafts={dailyDrafts}
            selectBellDay={selectBellDay}
            setBellDayPeriodCount={setBellDayPeriodCount}
            setPeriodTime={setPeriodTime}
            setBreakTime={setBreakTime}
            resetBellDay={resetBellDay}
            savePeriodTimes={savePeriodTimes}
            periodTimesSaving={periodTimesSaving}
            session={session}
          />
        )}

          {/* Fee Management */}
{activeTab === "fees" && (
          <FeesTab
            feeTotals={feeTotals}
            pendingReconciles={pendingReconciles}
            pendingPayments={pendingPayments}
            confirmingId={confirmingId}
            feeClass={feeClass}
            setFeeClass={setFeeClass}
            feeDefaultersOnly={feeDefaultersOnly}
            setFeeDefaultersOnly={setFeeDefaultersOnly}
            feeDraft={feeDraft}
            setFeeDraft={setFeeDraft}
            feeLedger={feeLedger}
            feeSaving={feeSaving}
            audit={audit}
            isSuper={isSuper}
            activeArms={session.school?.activeArms}
            session={session}
            confirmPayment={confirmPayment}
            saveFeeStructure={saveFeeStructure}
            setPayModal={setPayModal}
            setPayForm={setPayForm}
            setReminderModal={setReminderModal}
            setReminderResult={setReminderResult}
            setReconcileModal={setReconcileModal}
            setReconcileResult={setReconcileResult}
            loadReminderTemplates={loadReminderTemplates}
          />
        )}

          {/* Report Cards */}
{activeTab === "reports" && (
          <ReportsTab openReportModal={(data) => setReportPayload(data)} />
        )}

          {/* Students */}
{activeTab === "students" && (
          <StudentsTab
            filteredStudents={filteredStudents}
            isSuper={isSuper}
            toggleFee={toggleFee}
            openReset={openReset}
            openEdit={openEdit}
            setDeleteTarget={setDeleteTarget}
            unlinkParent={unlinkParent}
            setLinkModal={setLinkModal}
            parentNameById={parentNameById}
          />
        )}
        </div>
      </div>

{activeTab === "settings" && (
          <SettingsTab setTab={setTab} />
        )}

        {activeTab === "scheme" && (
          <SchemeOfWorkTab session={session} />
        )}

        {activeTab === "risk" && (
          <RiskAlerts session={session} />
        )}

        {activeTab === "performance" && (
          <TeacherPerformance session={session} />
        )}

        {activeTab === "alumni" && (
          <AlumniTab session={session} />
        )}

        {activeTab === "engagement" && (
          <EngagementTab session={session} />
        )}

        {activeTab === "branches" && (
          <BranchesTab session={session} />
        )}

        {activeTab === "compliance" && (
          <ComplianceTab session={session} />
        )}

      {/* Report card viewer modal */}
      <ReportCardModal
        open={reportPayload !== null}
        onClose={() => setReportPayload(null)}
        school={reportPayload?.school}
        student={reportPayload?.student}
        scores={reportPayload?.scores || []}
        summary={reportPayload?.summary}
        attendance={reportPayload?.attendance}
        fileName={reportPayload?.student?.name?.toLowerCase().replace(/[^a-z]+/g, "-")}
      />

      {/* Link parent modal */}
      <Modal
        open={linkModal !== null}
        onClose={() => {
          setLinkModal(null);
          setLinkResult(null);
        }}
        title="Link parent / guardian"
        wide
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-sm">
            {filteredStudents.find((s) => s.id === linkModal)?.name && (
              <p className="font-bold text-navy-800">
                {filteredStudents.find((s) => s.id === linkModal)?.name}
              </p>
            )}
            <p className="text-xs text-navy-400">
              The parent gets portal access to this student&apos;s report cards, attendance and fee balance.
            </p>
          </div>

          {/* Success panel — the auto-derived password, right where the
              admin can read it to the parent. */}
          {linkResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <p className="mt-3 text-sm font-bold text-navy-800">Parent linked</p>
              <p className="mt-1 text-xs text-navy-500">
                {linkResult.parentName} can now sign into{" "}
                {filteredStudents.find((s) => s.id === linkModal)?.name || "this student"}
                &apos;s portal.
              </p>
              <div className="mt-4 rounded-lg bg-white px-4 py-3 text-left shadow-sm ring-1 ring-navy-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-navy-400">Parent name</p>
                <p className="mt-0.5 text-sm font-bold text-navy-800">{linkResult.parentName}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-navy-400">Password</p>
                <p className="mt-0.5 text-sm font-bold text-emerald-700">{linkResult.password}</p>
                <p className="mt-2 text-xs leading-relaxed text-navy-500">
                  The password is the student&apos;s full name — case and spacing don&apos;t matter.
                  Tell the parent to sign in with their name above and this password.
                </p>
              </div>
              <button
                onClick={() => {
                  setLinkModal(null);
                  setLinkResult(null);
                }}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
              >
                <CheckCircle2 className="h-5 w-5" /> Done
              </button>
            </div>
          ) : (
            <>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-navy-50 p-1">
            <button
              onClick={() => setLinkForm((f) => ({ ...f, mode: "select" }))}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                linkForm.mode === "select" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500"
              }`}
            >
              <HeartHandshake className="mr-1.5 inline h-4 w-4" />
              Existing parent
            </button>
            <button
              onClick={() => setLinkForm((f) => ({ ...f, mode: "create" }))}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                linkForm.mode === "create" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500"
              }`}
            >
              <UserPlus className="mr-1.5 inline h-4 w-4" />
              New parent
            </button>
          </div>

          {linkForm.mode === "select" ? (
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {parents.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setLinkForm((f) => ({ ...f, parentId: p.id }))}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                    linkForm.parentId === p.id
                      ? "border-brand-300 bg-brand-50/60"
                      : "border-navy-100 bg-white hover:border-brand-200"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                    {p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-navy-800">{p.name}</span>
                    <span className="block truncate text-xs text-navy-400">
                      {p.email || "Signs in with name + child's name"}
                    </span>
                  </span>
                  {linkForm.parentId === p.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              ))}
              {parents.length === 0 && (
                <p className="rounded-xl border border-dashed border-navy-200 p-6 text-center text-sm text-navy-400">
                  No parent accounts yet. Switch to “New parent” to create one.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">Parent full name</span>
                <input
                  value={linkForm.name}
                  onChange={(e) => setLinkForm({ ...linkForm, name: e.target.value })}
                  placeholder="e.g. Mrs. Folake Adebayo"
                  className={inputCls}
                />
                {/* Live duplicate hint — warns before the admin even hits
                    the button; clicking through still switches to linking the
                    existing account instead of creating a duplicate. */}
                {findParentByName(linkForm.name) && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    This name already exists — link them instead of creating a duplicate.
                  </p>
                )}
                <p className="mt-1.5 text-xs text-navy-400">
                  No email or password needed — once linked, the parent signs in with this name
                  and the student&apos;s full name as the password.
                </p>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">Phone (optional)</span>
                <input
                  value={linkForm.phone}
                  onChange={(e) => setLinkForm({ ...linkForm, phone: e.target.value })}
                  placeholder="e.g. 0803 123 4567"
                  className={inputCls}
                />
                {/* Live duplicate hint for the phone — the secondary dedupe
                    key, matched digit-only so formatting can't hide a
                    duplicate. Warns as the admin types; clicking through
                    still guides to the existing account. */}
                {findParentByPhone(linkForm.phone) && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    This phone belongs to {findParentByPhone(linkForm.phone).name} — link them
                    instead of creating a duplicate.
                  </p>
                )}
              </label>
            </div>
          )}

          <button
            onClick={() => linkParent(filteredStudents.find((s) => s.id === linkModal)?.id)}
            disabled={
              linkSaving ||
              (linkForm.mode === "select" && !linkForm.parentId) ||
              (linkForm.mode === "create" && !String(linkForm.name || "").trim())
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
          >
            {linkSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <HeartHandshake className="h-5 w-5" />}
            {linkForm.mode === "create" ? "Create parent & link" : "Link parent"}
          </button>
            </>
          )}
        </div>
      </Modal>

      {/* Reconcile & forward modal — confirm the forward, or show its result */}
      <Modal
        open={reconcileModal}
        onClose={() => setReconcileModal(false)}
        title="Reconcile & forward reminders"
      >
        {reconcileSending ? (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            <p className="mt-3 text-sm font-semibold text-navy-600">Forwarding reminders…</p>
          </div>
        ) : reconcileResult ? (
          <div className="space-y-4">
            {reconcileResult.forwarded?.length > 0 ? (
              <>
                <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                  <div>
                    <p className="text-sm font-bold text-sky-900">
                      {reconcileResult.forwarded.reduce((a, f) => a + (f.remindersForwarded || 0), 0)} reminder{reconcileResult.forwarded.reduce((a, f) => a + (f.remindersForwarded || 0), 0) === 1 ? "" : "s"} forwarded to {reconcileResult.forwarded.length} parent{reconcileResult.forwarded.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-sky-700">
                      Each parent now has a copy on their portal, and the forward is logged in the audit trail below.
                    </p>
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-navy-100">
                  {reconcileResult.forwarded.map((f) => (
                    <div
                      key={f.studentId}
                      className="flex items-center justify-between gap-3 border-b border-navy-50 px-4 py-2.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy-800">{f.studentName}</p>
                        <p className="truncate text-xs text-navy-400">to {f.parent.name}</p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-sky-600">
                        {f.remindersForwarded} reminder{f.remindersForwarded === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Nothing to forward — no reminders are waiting on a parent.
              </div>
            )}
            <button
              onClick={() => setReconcileModal(false)}
              className="inline-flex w-full items-center justify-center rounded-xl bg-navy-800 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-navy-600">
              These reminders were sent to the <strong>student</strong> because no parent was linked at the time.
              Forwarding sends the parent a copy on their portal and marks the originals as done — they won&apos;t be
              forwarded again.
            </p>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-navy-100">
              {pendingReconciles.map((p) => (
                <div
                  key={p.studentId}
                  className="flex items-center justify-between gap-3 border-b border-navy-50 px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy-800">{p.studentName}</p>
                    <p className="truncate text-xs text-navy-400">
                      {p.classArm || "Unassigned"} · to {p.parent.name}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700 ring-1 ring-sky-600/20">
                    {p.reminders.length} reminder{p.reminders.length === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => reconcileAndForward()}
              disabled={reconcileSending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/30 transition hover:bg-sky-500 disabled:opacity-60"
            >
              {reconcileSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Forward to {pendingReconciles.length} parent{pendingReconciles.length === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </Modal>

      {/* Send fee reminder modal — confirm or show the send result */}
      <Modal
        open={reminderModal !== null}
        onClose={() => setReminderModal(null)}
        title={reminderModal === "all" ? "Send fee reminders" : "Send fee reminder"}
      >
        {reminderSending ? (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            <p className="mt-3 text-sm font-semibold text-navy-600">Sending reminders…</p>
          </div>
        ) : reminderResult ? (
          <div className="space-y-4">
            {reminderResult.sent?.length > 0 ? (
              <>
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-emerald-800">
                      {reminderResult.sent.length} reminder{reminderResult.sent.length === 1 ? "" : "s"} sent
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Parents have been notified via the notification system — each send is
                      logged in the audit trail below.
                    </p>
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-navy-100">
                  {reminderResult.sent.map((s) => (
                    <div
                      key={s.studentId}
                      className="flex items-center justify-between gap-3 border-b border-navy-50 px-4 py-2.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy-800">{s.studentName}</p>
                        <p className="truncate text-xs text-navy-400">
                          to {s.recipient?.name}
                          {s.recipient?.kind === "student" && (
                            <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                              student · no parent
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-amber-600">{naira(s.balance)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                No reminders were sent.{" "}
                {reminderResult.skipped?.length > 0
                  ? `${reminderResult.skipped.length} student${reminderResult.skipped.length === 1 ? "" : "s"} ${reminderResult.skipped.length === 1 ? "has" : "have"} an outstanding balance but no linked parent account.`
                  : "The selected students have no outstanding balance."}
              </div>
            )}
            {reminderResult.skipped?.length > 0 && (
              <p className="text-xs text-navy-400">
                Skipped {reminderResult.skipped.length} student{reminderResult.skipped.length === 1 ? "" : "s"} without a linked parent.
              </p>
            )}
            <button
              onClick={() => setReminderModal(null)}
              className="inline-flex w-full items-center justify-center rounded-xl bg-navy-800 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-navy-600">
              {reminderModal === "all" ? (
                <>
                  This will notify the parent of{" "}
                  <strong>{feeTotals?.remindable ?? 0} student{(feeTotals?.remindable ?? 0) === 1 ? "" : "s"}</strong>{" "}
                  with an outstanding balance or unpaid fees. Students without a linked parent are reminded directly.
                </>
              ) : (
                <>
                  Send a fee reminder to the parent of{" "}
                  <strong>{feeLedger.find((l) => l.studentId === reminderModal)?.name}</strong>{" "}
                  ({naira(feeLedger.find((l) => l.studentId === reminderModal)?.balance)} outstanding).
                </>
              )}
            </p>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-navy-700">
                  Message to parents
                  <button
                    type="button"
                    onClick={() => setReminderMessage(DEFAULT_REMINDER_MESSAGE)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 transition hover:text-violet-500"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset to default
                  </button>
                </span>
                <textarea
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  rows={6}
                  maxLength={4000}
                  className={`${inputCls} resize-y leading-relaxed`}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-navy-700">
                  Message to students (no linked parent)
                  <button
                    type="button"
                    onClick={() => setReminderStudentMessage(DEFAULT_STUDENT_REMINDER_MESSAGE)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 transition hover:text-violet-500"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset to default
                  </button>
                </span>
                <textarea
                  value={reminderStudentMessage}
                  onChange={(e) => setReminderStudentMessage(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  className={`${inputCls} resize-y leading-relaxed`}
                />
              </label>
              <span className="block text-[11px] leading-relaxed text-navy-400">
                Placeholders (both messages): <code className="rounded bg-navy-100 px-1 py-0.5">{"{name}"}</code> recipient ·{" "}
                <code className="rounded bg-navy-100 px-1 py-0.5">{"{student}"}</code> student ·{" "}
                <code className="rounded bg-navy-100 px-1 py-0.5">{"{class}"}</code> class ·{" "}
                <code className="rounded bg-navy-100 px-1 py-0.5">{"{balance}"}</code> amount ·{" "}
                <code className="rounded bg-navy-100 px-1 py-0.5">{"{school}"}</code> school name
              </span>
            </div>
            <p className="rounded-xl bg-violet-50 px-4 py-3 text-xs text-violet-700 ring-1 ring-violet-600/20">
              <BellRing className="mr-1 inline h-3.5 w-3.5" />
              Parents get the first message on their portal; students without a parent get the second on
              their dashboard.              What you send is saved as this school&apos;s default — term-rollover reminders
              reuse it. Every send is recorded in the audit trail.
            </p>
            <button
              onClick={() => sendReminders(reminderModal)}
              disabled={reminderSending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500 disabled:opacity-60"
            >
              {reminderSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              Send reminder{reminderModal === "all" ? "s" : ""}
            </button>
          </div>
        )}
      </Modal>

      {/* Record fee payment modal */}
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
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Amount (₦)</span>
            <input
              type="number"
              min={0}
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              placeholder="e.g. 185000"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Payment method</span>
            <select
              value={payForm.method}
              onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
              className={inputCls}
            >
              {["CASH", "TRANSFER", "CARD", "POS", "USSD", "OTHER"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Note (optional)</span>
            <input
              value={payForm.note}
              onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
              placeholder="e.g. Part payment — tuition only"
              className={inputCls}
            />
          </label>
          <button
            onClick={recordPayment}
            disabled={feeSaving || !payForm.amount}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
          >
            {feeSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Banknote className="h-5 w-5" />}
            Record payment
          </button>
        </div>
      </Modal>

      {/* Add user modal — teacher | student | staff (bursar/registrar) */}
      <Modal
        open={modal !== null}
        onClose={() => {
          if (createdUserDisplay) closeCreatedUserDisplay();
          else closeAddModal();
        }}
        title={
          createdUserDisplay
            ? "Student login details"
            : editingUser
              ? modal === "teacher"
                ? "Edit teacher"
                : modal === "staff"
                  ? "Edit staff account"
                  : "Edit student"
              : modal === "teacher"
                ? "Add teacher"
                : modal === "staff"
                  ? "Add staff account"
                  : "Add student"
        }
      >
        {createdUserDisplay ? (
          <div className="animate-fade-up space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Student added
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                The auto-generated password is shown below. Hand it to the student
                — they can change it after logging in.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                {createdUserDisplay.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-navy-800">{createdUserDisplay.name}</p>
                <p className="truncate text-xs text-navy-400">{createdUserDisplay.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-navy-900 px-4 py-3">
              <KeyRound className="h-5 w-5 shrink-0 text-brand-300" />
              <code className="min-w-0 flex-1 select-all break-all font-mono text-lg font-bold tracking-wide text-white">
                {createdUserDisplay.password}
              </code>
            </div>

            <button
              onClick={closeCreatedUserDisplay}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 font-semibold text-white transition hover:bg-navy-700"
            >
              Done
            </button>
          </div>
        ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Full name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              className={inputCls}
            />
          </label>
          {editingUser && modal === "teacher" ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">Name-only account</span>
              <p className="text-xs text-navy-500">
                Teachers have no email or password — they sign in with their name and the
                school name as the password.
              </p>
            </div>
          ) : editingUser ? (
            <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">Email</span>
              <p className="text-sm text-navy-500">{form.email || "—"}</p>
              <p className="mt-1.5 text-[11px] text-navy-400">
                Email is the login identity and can&apos;t be changed here. To replace
                this account (new email, new password), remove it and add the
                replacement.
              </p>
            </div>
          ) : modal === "teacher" ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">No email, no password</span>
              <p className="text-xs text-navy-500">
                Teachers sign in with their full name and{" "}
                <strong className="text-navy-700">the school name</strong> as the password —{" "}
                {session.school?.name || "your school's name"} — so the admin only types the
                name here.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@school.edu"
                className={inputCls}
              />
            </label>
          )}
          {editingUser && modal === "teacher" ? (
            <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">Teacher login</span>
              <p className="text-xs text-navy-500">
                The teacher signs in with their name and the school name as the password.
              </p>
            </div>
          ) : editingUser ? (
            <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">Password</span>
              <p className="text-xs text-navy-500">
                Managed via <strong className="text-navy-700">Reset password</strong> on the row — editing
                details never touches the login.
              </p>
            </div>
          ) : modal === "student" ? (
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">
                Auto-generated password
              </span>
              <p className="text-xs text-navy-500">
                The password is <strong className="text-navy-700">name + class arm</strong>, all lowercase and
                unspaced — e.g. <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-navy-700">
                  {form.name || "adamtope"}{form.assignedClass || "jss1"}</code>
              </p>
            </div>
          ) : modal === "teacher" ? (
            <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
              <span className="mb-1 block text-sm font-medium text-navy-700">Teacher login</span>
              <p className="text-xs text-navy-500">
                The teacher signs in with their name and the school name as the password —
                nothing to hand out.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">Temporary password</span>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 6 characters"
                className={inputCls}
              />
            </label>
          )}
          {modal === "staff" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">Role</span>
              <select
                value={form.staffRole}
                onChange={(e) => setForm({ ...form, staffRole: e.target.value })}
                className={inputCls}
              >
                <option value="BURSAR">Bursar — fees, payments & reminders</option>
                <option value="REGISTRAR">Registrar — roster, imports & report cards</option>
              </select>
            </label>
          ) : modal === "teacher" ? (
            <>
              {/* Subject-specialist teaching model: a teacher teaches SUBJECTS
                  across MULTIPLE arms — one Mathematics teacher covers all twelve
                  classes. What's picked here is exactly the scope the API enforces. */}
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
                <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-navy-700">
                  <BookOpen className="h-4 w-4 text-violet-600" /> Subjects they teach
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map((s) => {
                    const on = form.subjects.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            subjects: on ? f.subjects.filter((x) => x !== s) : [...f.subjects, s],
                          }))
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                          on
                            ? "bg-violet-600 text-white shadow-sm"
                            : "bg-white text-navy-600 ring-1 ring-navy-200 hover:ring-violet-300"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5">
                <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-navy-700">
                  <ClipboardList className="h-4 w-4 text-brand-600" /> Class arms they teach
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(session.school?.activeArms || []).map((arm) => {
                    const on = form.assignedClasses.includes(arm);
                    return (
                      <button
                        key={arm}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            assignedClasses: on ? f.assignedClasses.filter((x) => x !== arm) : [...f.assignedClasses, arm],
                            // Keep the legacy default arm in sync with the first pick.
                            assignedClass: on && f.assignedClass === arm ? "" : f.assignedClass || arm,
                          }))
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                          on
                            ? "bg-brand-600 text-white shadow-sm"
                            : "bg-white text-navy-600 ring-1 ring-navy-200 hover:ring-brand-300"
                        }`}
                      >
                        {arm}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-navy-400">
                  A teacher can cover every arm of a subject — e.g. one Mathematics teacher for all twelve classes.
                </p>
              </div>
            </>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">Class arm</span>
              <select
                value={form.assignedClass}
                onChange={(e) => setForm({ ...form, assignedClass: e.target.value })}
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {(session.school?.activeArms || []).map((arm) => (
                  <option key={arm}>{arm}</option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={() => createUser(modal)}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : editingUser ? (
              <Save className="h-5 w-5" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            {editingUser
              ? "Save changes"
              : `Add ${modal === "teacher" ? "teacher" : modal === "staff" ? "staff account" : "student"}`}
          </button>
        </div>
        )}
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title="Reset password"
      >
        {resetTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                {resetTarget.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-navy-800">{resetTarget.name}</p>
                <p className="truncate text-xs text-navy-400">
                  {resetTarget.email} · {resetTarget.assignedClass || "Unassigned"}
                </p>
              </div>
            </div>

            {resetDone ? (
              <div className="animate-fade-up space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Password reset successfully
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    The old password no longer works. Hand this new one to {resetTarget.name.split(" ")[0]} — they can change it after logging in.
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-navy-900 px-4 py-3">
                  <KeyRound className="h-5 w-5 shrink-0 text-brand-300" />
                  <code className="min-w-0 flex-1 select-all break-all font-mono text-lg font-bold tracking-wide text-white">
                    {resetDone.newPassword}
                  </code>
                  <button
                    onClick={copyNewPassword}
                    title="Copy to clipboard"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                  >
                    {resetCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {resetCopied ? "Copied" : "Copy"}
                  </button>
                </div>

                <button
                  onClick={() => setResetTarget(null)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 font-semibold text-white transition hover:bg-navy-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-navy-700">New password</span>
                  <input
                    type="text"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Leave blank to auto-generate a strong one"
                    className={inputCls}
                  />
                  <span className="mt-1.5 block text-xs text-navy-400">
                    Must be at least 6 characters. Auto-generated passwords skip confusing characters (0/O, 1/l/I).
                  </span>
                </label>
                <button
                  onClick={resetPassword}
                  disabled={resetLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
                >
                  {resetLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
                  Reset password
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Remove-user confirmation — student left / teacher departed */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => !deletingUser && setDeleteTarget(null)}
        title="Remove account"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
              <div className="text-sm text-rose-700">
                <p className="font-bold text-rose-800">This can&apos;t be undone.</p>
                <p className="mt-1">
                  {deleteTarget.role === "STUDENT"
                    ? "Removing this student deletes their account, scores, attendance and fee records."
                    : "Removing this teacher deletes their account and frees their timetable slots."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                {deleteTarget.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-navy-800">{deleteTarget.name}</p>
                <p className="truncate text-xs text-navy-400">
                  {deleteTarget.email} · {ROLE_LABELS[deleteTarget.role] || deleteTarget.role}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deletingUser}
                className="flex-1 rounded-xl border border-navy-200 bg-white py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteUser}
                disabled={deletingUser}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {deletingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remove {deleteTarget.role === "STUDENT" ? "student" : "teacher"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Freeze / reactivate / restore confirm. Freezing blocks all logins
          while keeping every byte of data; restoring revives a deleted school
          inside its 30-day recovery window. */}
      {freezeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4 backdrop-blur-sm"
          onClick={() => !schoolBusy && setFreezeModal(null)}
        >
          <div
            className="w-full max-w-md animate-fade-up rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    freezeModal === "freeze" ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
                  }`}
                >
                  {freezeModal === "freeze" ? <Snowflake className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
                </span>
                <h2 className="text-lg font-bold text-navy-800">
                  {freezeModal === "freeze"
                    ? `Freeze ${session.school?.name}?`
                    : freezeModal === "restore"
                      ? `Restore ${session.school?.name}?`
                      : `Reactivate ${session.school?.name}?`}
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-navy-600">
                {freezeModal === "freeze" ? (
                  <>
                    All staff and student logins will be blocked immediately.{" "}
                    <strong>No data is deleted</strong> — students, teachers, scores, fees and
                    timetables are all kept safe, and you can reactivate the account at any time
                    by signing back in.
                  </>
                ) : freezeModal === "restore" ? (
                  <>
                    This school was deleted, but its data is fully intact. Restoring revives the
                    account and everything in it — all logins resume working immediately.
                  </>
                ) : (
                  <>
                    All staff and student logins will resume working immediately. Your data has
                    been kept safe while deactivated — nothing was deleted.
                  </>
                )}
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setFreezeModal(null)}
                  disabled={schoolBusy}
                  className="flex-1 rounded-xl border border-navy-200 bg-white py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    flipSchoolStatus(freezeModal === "freeze" ? "deactivate" : freezeModal === "restore" ? "restore" : "reactivate")
                  }
                  disabled={schoolBusy}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
                    freezeModal === "freeze" ? "bg-amber-500 hover:bg-amber-400" : "bg-emerald-600 hover:bg-emerald-500"
                  }`}
                >
                  {schoolBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : freezeModal === "freeze" ? <Snowflake className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                  {freezeModal === "freeze"
                    ? "Freeze account"
                    : freezeModal === "restore"
                      ? "Restore school"
                      : "Reactivate school"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* School exit flow — SUPER_ADMIN deactivates & permanently deletes the
          tenant. Two protected steps: an un-undoable warning, then an exit
          survey (recorded before the wipe) so we know why the school left. */}
      {exitStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4 backdrop-blur-sm"
          onClick={() => exitStep === "confirm" && setExitStep(null)}
        >
          <div
            className="w-full max-w-md animate-fade-up rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {exitStep === "confirm" && (
              <div className="p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <h2 className="text-lg font-bold text-navy-800">Delete your school permanently?</h2>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-navy-600">
                  This will deactivate <strong>{session.school?.name}</strong> and delete all of its
                  data — students, teachers, scores, attendance, fee records, timetables, report
                  cards and archives.{" "}
                  <strong className="text-rose-700">
                    Your data is kept for a 30-day recovery window — sign back in as the super
                    admin to restore everything before it is permanently removed.
                  </strong>
                </p>
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => setExitStep(null)}
                    className="flex-1 rounded-xl border border-navy-200 bg-white py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setExitStep("survey")}
                    className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
                  >
                    I understand — continue
                  </button>
                </div>
              </div>
            )}

            {exitStep === "survey" && (
              <div className="max-h-[calc(100vh-2rem)] overflow-y-auto p-6">
                <h2 className="text-lg font-bold text-navy-800">We&apos;re sorry to see you go</h2>
                <p className="mt-1 text-sm text-navy-500">
                  Help us improve — why is <strong>{session.school?.name}</strong> leaving Edutrack?
                </p>
                <div className="mt-4 space-y-2">
                  {EXIT_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setExitReason(r)}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition ${
                        exitReason === r
                          ? "border-rose-400 bg-rose-50 text-rose-800"
                          : "border-navy-200 text-navy-700 hover:border-navy-300"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                          exitReason === r ? "border-rose-500" : "border-navy-300"
                        }`}
                      >
                        {exitReason === r && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                      </span>
                      {r}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-sm font-medium text-navy-700">Anything else? (optional)</span>
                  <textarea
                    value={exitFeedback}
                    onChange={(e) => setExitFeedback(e.target.value)}
                    rows={3}
                    placeholder="Tell us what we could have done better…"
                    className={inputCls}
                  />
                </label>
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => setExitStep("confirm")}
                    disabled={exitSaving}
                    className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={submitExitSurvey}
                    disabled={!exitReason || exitSaving}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exitSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Yes, delete my school permanently
                  </button>
                </div>
              </div>
            )}

            {exitStep === "done" && (
              <div className="p-6 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                <h2 className="mt-3 text-lg font-bold text-navy-800">Your school has been deleted</h2>
                <p className="mt-1 text-sm text-navy-500">
                  Nothing is gone yet — your data is kept for a{" "}
                  <strong className="text-navy-700">30-day recovery period</strong>. Sign back in with
                  your super admin account before{" "}
                  <strong className="text-navy-700">
                    {exitRestorableUntil
                      ? new Date(exitRestorableUntil).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "the deadline"}
                  </strong>{" "}
                  to restore the account and keep everything. After that the data is permanently
                  removed. Thank you for the feedback.
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 font-semibold text-white transition hover:bg-navy-700"
                >
                  Return to Edutrack
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Change-role confirmation modal */}
      <Modal
        open={roleConfirm !== null}
        onClose={() => setRoleConfirm(null)}
        title="Change staff role"
      >
        {roleConfirm && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${ROLE_BADGES[roleConfirm.from] || "bg-navy-100 text-navy-600"}`}>
                {ROLE_LABELS[roleConfirm.from] || roleConfirm.from}
              </span>
              <ArrowLeftRight className="h-4 w-4 text-navy-400" />
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${ROLE_BADGES[roleConfirm.to] || "bg-navy-100 text-navy-600"}`}>
                {ROLE_LABELS[roleConfirm.to] || roleConfirm.to}
              </span>
            </div>
            <p className="text-sm text-navy-600">
              Change <strong className="text-navy-800">{roleConfirm.name}</strong>&apos;s role from{" "}
              <strong>{ROLE_LABELS[roleConfirm.from] || roleConfirm.from}</strong> to{" "}
              <strong>{ROLE_LABELS[roleConfirm.to] || roleConfirm.to}</strong>?
            </p>
            {roleConfirm.to === "TEACHER" && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                They will lose access to the admin console. Classroom tools (grading, attendance, report cards) still work.
              </p>
            )}
            <p className="text-xs text-navy-400">
              Takes effect immediately — their current session will be signed out and they must log in again.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setRoleConfirm(null)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-navy-200 px-4 py-2.5 text-sm font-semibold text-navy-600 transition hover:bg-navy-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRoleChange}
                disabled={roleSaving}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
              >
                {roleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                Change role
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Assign subjects & arms — edit a teacher's teaching scope (subjects ×
          class arms). Saves through PATCH; the SUPER_ADMIN gate + field-level
          mayEditUser guard re-validate, and the teacher portal enforces the
          new scope on their next request (bouncing a stale selection). */}
      <Modal
        open={scopeTarget !== null}
        onClose={() => setScopeTarget(null)}
        title="Assign subjects & arms"
      >
        {scopeTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                {scopeTarget.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-navy-800">{scopeTarget.name}</p>
                <p className="truncate text-xs text-navy-400">{scopeTarget.email}</p>
              </div>
            </div>

            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-navy-700">
                <BookOpen className="h-4 w-4 text-violet-600" /> Subjects they teach
              </span>
              <div className="flex flex-wrap gap-1.5">
                {subjects.map((s) => {
                  const on = scopeDraft.subjects.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setScopeDraft((d) => ({
                          ...d,
                          subjects: on ? d.subjects.filter((x) => x !== s) : [...d.subjects, s],
                        }))
                      }
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        on
                          ? "bg-violet-600 text-white shadow-sm"
                          : "bg-white text-navy-600 ring-1 ring-navy-200 hover:ring-violet-300"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-navy-700">
                  <ClipboardList className="h-4 w-4 text-brand-600" /> Class arms they teach
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setScopeDraft((d) => ({
                        ...d,
                        assignedClasses: [...(session.school?.activeArms || [])],
                        assignedClass: (session.school?.activeArms || [])[0] || "",
                      }))
                    }
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-100"
                  >
                    All arms
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setScopeDraft((d) => ({ ...d, assignedClasses: [], assignedClass: "" }))
                    }
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-navy-500 ring-1 ring-navy-200 transition hover:bg-navy-50"
                  >
                    Clear
                  </button>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(session.school?.activeArms || []).map((arm) => {
                  const on = scopeDraft.assignedClasses.includes(arm);
                  return (
                    <button
                      key={arm}
                      type="button"
                      onClick={() =>
                        setScopeDraft((d) => {
                          const onArm = d.assignedClasses.includes(arm);
                          return {
                            ...d,
                            assignedClasses: onArm
                              ? d.assignedClasses.filter((x) => x !== arm)
                              : [...d.assignedClasses, arm],
                            // Keep the legacy display/default arm in sync with the first pick.
                            assignedClass:
                              onArm && d.assignedClass === arm ? "" : d.assignedClass || arm,
                          };
                        })
                      }
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        on
                          ? "bg-brand-600 text-white shadow-sm"
                          : "bg-white text-navy-600 ring-1 ring-navy-200 hover:ring-brand-300"
                      }`}
                    >
                      {arm}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-navy-400">
                {scopeDraft.subjects.length} subject{scopeDraft.subjects.length === 1 ? "" : "s"} ×{" "}
                {scopeDraft.assignedClasses.length} arm{scopeDraft.assignedClasses.length === 1 ? "" : "s"} selected.
              </p>
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Takes effect instantly — if a teacher is currently viewing a class arm you remove, their dashboard
              switches them to a valid arm on the next request.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setScopeTarget(null)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-navy-200 px-4 py-2.5 text-sm font-semibold text-navy-600 transition hover:bg-navy-50"
              >
                Cancel
              </button>
              <button
                onClick={saveScope}
                disabled={scopeSaving}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
              >
                {scopeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save scope
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Term rollover — archive the old term, clone fees + timetable forward */}
      <Modal
        open={rolloverOpen}
        onClose={() => !rolloverSaving && setRolloverOpen(false)}
        title="Start a new term"
      >
        <div className="space-y-4">
          <p className="text-sm text-navy-500">
            Moving from{" "}
            <strong className="text-navy-800">
              {session?.school?.currentSession} · {session?.school?.currentTerm}
            </strong>{" "}
            to the new term:
          </p>
          <div className="rounded-xl bg-navy-50 p-4 text-sm text-navy-600">
            <ul className="list-disc space-y-1 pl-4">
              <li>
                Scores &amp; attendance are <strong>archived</strong> per arm (kept in the term archive,
                then cleared) — the new term starts fresh.
              </li>
              <li>
                Fee structures and the weekly timetable <strong>carry over</strong> to the new term.
              </li>
              <li>
                Every student&apos;s <strong>unpaid balance carries into the new term</strong> and is added
                to the new fee — those students/parents get an <strong>automatic reminder</strong>.
              </li>
              <li>Every student&apos;s fee status resets — nothing is paid for the new term yet.</li>
            </ul>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy-400">
              New term
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TERMS.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={t === session?.school?.currentTerm}
                  onClick={() => {
                    setRolloverTermName(t);
                    setRolloverPreview(null);
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    rolloverTermName === t
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-navy-200 bg-white text-navy-700 hover:border-brand-400"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy-400">
              Session
            </label>
            <input
              value={rolloverSession}
              onChange={(e) => {
                setRolloverSession(e.target.value);
                setRolloverPreview(null);
              }}
              placeholder="e.g. 2026/2027"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-navy-400">
              Leave as-is for a mid-session term change (First → Second → Third).
            </p>
          </div>
          {rolloverPreview && (
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-navy-700">
              <p className="font-semibold text-navy-800">Rollover preview</p>
              <ul className="mt-2 space-y-1">
                <li>📦 {rolloverPreview.scoresArchived || 0} score records archived</li>
                <li>📋 {rolloverPreview.attendanceArchived || 0} attendance registers archived</li>
                <li>💰 {rolloverPreview.feesCloned || 0} fee structures cloned</li>
                <li>🗓 {rolloverPreview.timetableCloned || 0} timetable slots carried over</li>
                <li>👥 {rolloverPreview.studentsReset || 0} students reset to unpaid</li>
                <li>🔁 {rolloverPreview.carryovers || 0} student{(rolloverPreview.carryovers || 0) === 1 ? "" : "s"} carry an unpaid balance into the new term</li>
                <li>🔔 Automatic fee reminders sent to each of those students/parents</li>
              </ul>
            </div>
          )}
          {rolloverPreview === null && (
            <button
              onClick={previewRollover}
              disabled={rolloverPreviewing || !rolloverTermName.trim()}
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rolloverPreviewing ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Preview what will happen"
              )}
            </button>
          )}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              onClick={() => setRolloverOpen(false)}
              disabled={rolloverSaving}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-navy-500 transition hover:bg-navy-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmRollover}
              disabled={rolloverSaving || !rolloverTermName.trim() || !rolloverPreview}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rolloverSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Archive &amp; start {rolloverTermName || "new term"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Timetable cell editor — pick a subject + teacher for one period */}
      <Modal
        open={ttModal !== null}
        onClose={() => setTtModal(null)}
        title={ttModal ? `Period ${ttModal.period} · ${ttModal.day} · ${ttArm}` : ""}
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Subject</span>
            <select
              value={ttDraft.subject}
              onChange={(e) => {
                const subject = e.target.value;
                // Reset the teacher when the subject changes — only teachers
                // who teach the new subject may be picked.
                setTtDraft({
                  subject,
                  teacherId:
                    teachers.find((t) => !t.subjects?.length || t.subjects.includes(subject))?.id || "",
                });
              }}
              className={inputCls}
            >
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">Teacher</span>
            <select
              value={ttDraft.teacherId}
              onChange={(e) => setTtDraft({ ...ttDraft, teacherId: e.target.value })}
              className={inputCls}
            >
              <option value="">Choose a teacher…</option>
              {ttTeachersForSubject.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <p className="flex items-start gap-2 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-xs text-navy-600">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            Only teachers who teach <strong>{ttDraft.subject || "the chosen subject"}</strong> are listed — the API
            also refuses a teacher already booked in another arm at the same day and period.
          </p>
          {ttModal && (() => {
            const slotKey = `${ttArm}|${ttModal.day}|${ttModal.period}`;
            const liveReasons = slotConflictReasons(ttHealth?.conflicts, ttArm, ttModal.day, ttModal.period);
            if (!ttFlaggedSlots.has(slotKey) && liveReasons.length === 0) return null;
            return (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  {liveReasons.length > 0 ? (
                    <>
                      <p>This slot is part of a live conflict flagged by the last scan:</p>
                      <ul className="list-inside list-disc space-y-0.5 text-amber-800">
                        {liveReasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>
                      This slot was flagged by an earlier conflict scan. Reassigning it could
                      silently reintroduce the issue — saving here asks for confirmation.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
          {ttByKey[`${ttModal?.day}|${ttModal?.period}`] && (() => {
            const existing = ttByKey[`${ttModal?.day}|${ttModal?.period}`];
            return (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Saving replaces the current slot: <strong>{existing.subject}</strong> ·{" "}
                {existing.teacherName || "Unassigned"}.
              </p>
            );
          })()}
          <div className="flex gap-2">
            <button
              onClick={saveTtSlot}
              disabled={ttSaving || !ttDraft.subject || !ttDraft.teacherId}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
            >
              {ttSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save slot
            </button>
            {ttByKey[`${ttModal?.day}|${ttModal?.period}`] && (
              <button
                onClick={clearTtSlot}
                disabled={ttSaving}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
              >
                <X className="h-4 w-4" /> Free period
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Printable credentials sheet — preview + print node for paper handout */}
      <PrintableCredentials
        open={!!printSheet}
        onClose={() => setPrintSheet(null)}
        school={session.school?.name || ""}
        title={printSheet?.title || ""}
        rows={printSheet?.rows || []}
      />

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
