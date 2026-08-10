"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  LayoutDashboard,
  BarChart3,
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
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import MetricCard from "@/components/MetricCard";
import Modal from "@/components/Modal";
import Logo from "@/components/Logo";
import TopStudents from "@/components/TopStudents";
import ReportCardModal from "@/components/ReportCardModal";
import ArmStreamSplitter from "@/components/ArmStreamSplitter";
import { armAlreadyExists } from "@/lib/arms";
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
import { MANAGED_ROLES, ROLE_LABELS } from "@/lib/roles";
import { sparklinePoints } from "@/lib/conflict-scan";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

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
    email: "",
    password: "",
    phone: "",
  });
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
  // Teaching-scope editor state — SUPER_ADMIN assigns a teacher's SUBJECTS ×
  // ARMS here (the same scope the API enforces on every classroom route).
  const [scopeTarget, setScopeTarget] = useState(null); // teacher being edited
  const [scopeDraft, setScopeDraft] = useState({ subjects: [], assignedClasses: [], assignedClass: "" });
  const [scopeSaving, setScopeSaving] = useState(false);
  // Roles & Access tab state
  const [staffList, setStaffList] = useState([]);
  const [roleAudit, setRoleAudit] = useState([]);
  const [roleDraft, setRoleDraft] = useState({}); // userId -> selected role
  const [roleConfirm, setRoleConfirm] = useState(null); // { id, name, from, to }
  const [roleSaving, setRoleSaving] = useState(false);
  // Login Details tab state — every non-student account (staff + parents) so
  // the SUPER_ADMIN can hand out / reset logins. Students are excluded (too
  // many — their passwords are auto-derived as name+classarm).
  const [loginUsers, setLoginUsers] = useState([]);
  // Timetable tab state — SUPER_ADMIN builds the weekly schedule here; the
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
  // Classes & Arms — the SUPER_ADMIN arm manager. armsDraft is null until the
  // tab opens, so a tab switch always re-syncs the draft from the session.
  const [armsDraft, setArmsDraft] = useState(null);
  const [armsSlotCounts, setArmsSlotCounts] = useState({});
  const [armsFeeAmounts, setArmsFeeAmounts] = useState({});
  const [armsSaving, setArmsSaving] = useState(false);
  const [newArm, setNewArm] = useState("");
  // Rename arm modal — renameTarget is the arm being renamed (null = closed).
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  // Term rollover modal — moving the school to a new term archives the old
  // term's scores/attendance and clones fees + timetable forward.
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [rolloverTermName, setRolloverTermName] = useState("");
  const [rolloverSession, setRolloverSession] = useState("");
  const [rolloverPreview, setRolloverPreview] = useState(null); // dry-run counts
  const [rolloverPreviewing, setRolloverPreviewing] = useState(false);
  const [rolloverSaving, setRolloverSaving] = useState(false);
  // Previous Terms — read-only viewer over the term archive (rollover
  // snapshots of each old term's scores + attendance).
  const [archTerms, setArchTerms] = useState([]);
  const [archTerm, setArchTerm] = useState(null); // { session, term }
  const [archArm, setArchArm] = useState(null); // classArm string
  const [archDetail, setArchDetail] = useState(null); // per-student payload
  const [archLoading, setArchLoading] = useState(false);
  // Alumni — archived-roster students no longer on the live roster.
  const [archMode, setArchMode] = useState("terms"); // "terms" | "alumni"
  const [archAlumni, setArchAlumni] = useState([]);
  const [archAlumniLoading, setArchAlumniLoading] = useState(false);
  const [archAlumniLoaded, setArchAlumniLoaded] = useState(false);

  const subjects = getSubjects();

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  // Respond to sidebar hash links: /admin/dashboard#teachers etc.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (["classes", "teachers", "roles", "logins", "students", "fees", "reports", "timetable", "archives"].includes(hash)) setTab(hash);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  // Load ranked students for the Report Cards tab (scoped by class filter)
  useEffect(() => {
    if (tab !== "reports") return;
    const params = new URLSearchParams({ limit: "200" });
    if (reportClass) params.set("classArm", reportClass);
    fetch(`/api/reports?${params}`)
      .then((r) => r.json())
      .then((data) => setReportStudents(data.students || []))
      .catch(() => {});
  }, [tab, reportClass]);

  // Load fee structures once (for the structures editor)
  useEffect(() => {
    if (tab !== "fees") return;
    fetch("/api/fees/structures")
      .then((r) => r.json())
      .then((data) => {
        setFeeStructures(data.structures || []);
        setFeeDraft(
          Object.fromEntries(
            (data.structures || []).map((s) => [s.classArm, s.amount])
          )
        );
      })
      .catch(() => {});
  }, [tab]);

  // Previous Terms: load the archive summary when the tab opens.
  useEffect(() => {
    if (tab !== "archives") return;
    let cancelled = false;
    fetch("/api/school/archives")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setArchTerms(data.terms || []);
        if (!data.terms?.length) {
          setArchTerm(null);
          setArchArm(null);
          setArchDetail(null);
        }
        // Fresh visit — start on the term list and let the alumni list reload.
        setArchMode("terms");
        setArchAlumniLoaded(false);
        setArchAlumni([]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab]);

  // Classes & Arms: when the tab opens, re-read the school's arms from the
  // server (authoritative — a save elsewhere already mirrored into the
  // session) and load per-arm stats (timetable slots across ALL arms + fee
  // structure amounts). All setState calls happen after awaits, never
  // synchronously inside the effect.
  useEffect(() => {
    if (tab !== "classes") return;
    let cancelled = false;
    const load = async () => {
      const [schoolRes, tt, fees] = await Promise.all([
        fetch("/api/school").then((r) => r.json()).catch(() => null),
        fetch("/api/timetable").then((r) => r.json()).catch(() => null),
        fetch("/api/fees/structures").then((r) => r.json()).catch(() => null),
      ]);
      if (cancelled) return;
      setArmsDraft(schoolRes?.school?.activeArms || []);
      const counts = {};
      (tt?.entries || []).forEach((e) => {
        counts[e.classArm] = (counts[e.classArm] || 0) + 1;
      });
      setArmsSlotCounts(counts);
      const amounts = {};
      (fees?.structures || []).forEach((s) => {
        amounts[s.classArm] = s.amount;
      });
      setArmsFeeAmounts(amounts);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  // Load fee ledger when filters change
  useEffect(() => {
    if (tab !== "fees") return;
    const params = new URLSearchParams();
    if (feeClass) params.set("classArm", feeClass);
    if (feeDefaultersOnly) params.set("defaulters", "1");
    fetch(`/api/fees?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setFeeLedger(data.ledger || []);
        setFeeTotals(data.totals || null);
        setPendingPayments(data.pendingPayments || []);
      })
      .catch(() => {});
  }, [tab, feeClass, feeDefaultersOnly]);

  // Timetable: load the selected arm's schedule when the tab opens, plus the
  // school's bell schedule for the period-times editor.
  useEffect(() => {
    if (tab !== "timetable" || !ttArm) return;
    fetch(`/api/timetable?classArm=${encodeURIComponent(ttArm)}`)
      .then((r) => r.json())
      .then((data) => setTtEntries(data.entries || []))
      .catch(() => {});
    fetch("/api/school")
      .then((r) => r.json())
      .then((data) => {
        setPeriodTimesDraft(getPeriodTimes(data.school).map((p) => ({ ...p })));
        setBreakDraft(getBreakTime(data.school));
        // Any per-day overrides the school already saved load into their own
        // drafts, resolved to FULL schedules so the editor shows real values.
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
      })
      .catch(() => {});
  }, [tab, ttArm]);

  // Load the fee audit trail once per visit to the tab (the trail is global,
  // not filtered by class arm or defaulter state).
  useEffect(() => {
    if (tab !== "fees") return;
    fetch("/api/fees/audit")
      .then((r) => r.json())
      .then((data) => setAudit(data.entries || []))
      .catch(() => {});
  }, [tab]);

  // Students whose reminders went to THEM (no parent at send time) and who
  // have a parent now — the school can forward those reminders to the parent.
  useEffect(() => {
    if (tab !== "fees") return;
    fetch("/api/fees/reconcile")
      .then((r) => r.json())
      .then((data) => setPendingReconciles(data.pending || []))
      .catch(() => {});
  }, [tab]);

  // Roles & Access: staff directory + role-change audit trail (super admin tab)
  useEffect(() => {
    if (tab !== "roles") return;
    // One query per staff role instead of shipping the whole roster (which can
    // be hundreds of students) just to filter it client-side.
    Promise.all(
      MANAGED_ROLES.map((r) =>
        fetch(`/api/users?role=${encodeURIComponent(r)}`)
          .then((res) => res.json())
          .then((d) => d.users || [])
      )
    )
      .then((groups) => setStaffList(groups.flat()))
      .catch(() => {});
    fetch("/api/users/roles/audit")
      .then((r) => r.json())
      .then((d) => setRoleAudit(d.entries || []))
      .catch(() => {});
  }, [tab]);

  // Login Details: every non-student account (staff + parents) — one query
  // per role to avoid shipping the whole student roster.
  useEffect(() => {
    if (tab !== "logins") return;
    Promise.all(
      ["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER", "PARENT"].map((r) =>
        fetch(`/api/users?role=${encodeURIComponent(r)}`)
          .then((res) => res.json())
          .then((d) => d.users || [])
      )
    )
      .then((groups) => setLoginUsers(groups.flat()))
      .catch(() => {});
  }, [tab]);

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
        router.replace("/login");
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
          .catch(() => {});
      }
      setLoading(false);
    })();
  }, [router]);

  async function togglePayroll(id, current) {
    const next = current === "PAID" ? "PENDING" : "PAID";
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payrollStatus: next }),
    });
    if (res.ok) {
      setTeachers((ts) =>
        ts.map((t) => (t.id === id ? { ...t, payrollStatus: next } : t))
      );
      setStats((s) => ({
        ...s,
        payrollPaid: s.payrollPaid + (next === "PAID" ? 1 : -1),
        payrollPending: s.payrollPending + (next === "PENDING" ? 1 : -1),
      }));
      showToast(`Payroll marked ${next === "PAID" ? "Paid" : "Pending"}`);
    }
  }

  async function toggleFee(id, current) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feePaid: !current }),
    });
    if (res.ok) {
      setStudents((ss) =>
        ss.map((s) => (s.id === id ? { ...s, feePaid: !current } : s))
      );
      showToast(!current ? "Fee marked as collected" : "Fee marked as unpaid");
    }
  }

  async function createUser(role) {
    setSaving(true);
    try {
      // The modal value is lowercase ("teacher" | "student" | "staff") but
      // the API requires the uppercase role enum — normalize before sending.
      // For "staff", form.staffRole holds the chosen BURSAR/REGISTRAR.
      const roleEnum = String(role === "staff" ? form.staffRole || "BURSAR" : role || "").toUpperCase();
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

      // When a student is created with an auto-generated password (name+class),
      // show the login details in the modal before closing — the admin needs
      // to hand the password to the student right away.
      if (data.generatedPassword) {
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

  function requestRoleChange(user, to) {
    setRoleConfirm({ id: user.id, name: user.name, from: user.role, to });
  }

  async function confirmRoleChange() {
    if (!roleConfirm) return;
    setRoleSaving(true);
    try {
      const res = await fetch(`/api/users/${roleConfirm.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleConfirm.to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change role");
      setStaffList((list) =>
        list.map((u) => (u.id === roleConfirm.id ? { ...u, role: roleConfirm.to } : u))
      );
      showToast(`${roleConfirm.name} is now ${ROLE_LABELS[roleConfirm.to] || roleConfirm.to}`);
      setRoleConfirm(null);
      // Refresh the trail — the change was logged server-side.
      const ar = await fetch("/api/users/roles/audit");
      setRoleAudit((await ar.json()).entries || []);
    } catch (err) {
      // Put the select back — the badge still shows the real (unchanged) role.
      setRoleDraft((d) => ({ ...d, [roleConfirm.id]: roleConfirm.from }));
      showToast(err.message);
    } finally {
      setRoleSaving(false);
    }
  }

  const filteredTeachers = teachers.filter((t) =>
    (t.name + t.email + (t.assignedClass || "")).toLowerCase().includes(search.toLowerCase())
  );
  const filteredStudents = students.filter((s) =>
    (s.name + s.email + (s.assignedClass || "")).toLowerCase().includes(search.toLowerCase())
  );
  const filteredReports = reportStudents.filter((s) =>
    (s.name + s.email + (s.assignedClass || "")).toLowerCase().includes(reportSearch.toLowerCase())
  );

  const parentNameById = Object.fromEntries(parents.map((p) => [p.id, p.name]));

  async function linkParent(studentId) {
    setLinkSaving(true);
    try {
      let parentId = linkForm.parentId;
      if (linkForm.mode === "create") {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: linkForm.name,
            email: linkForm.email,
            password: linkForm.password,
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
      setLinkModal(null);
      setLinkForm({ mode: "select", parentId: "", name: "", email: "", password: "", phone: "" });
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
      showToast(`Fee for ${classArm} updated`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setFeeSaving(false);
    }
  }

  async function sendReminders(scope) {
    // scope: "all" (every defaulter) or a single studentId (one student's row)
    setReminderSending(true);
    setReminderResult(null);
    try {
      const res = await fetch("/api/fees/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope === "all" ? {} : { studentIds: [scope] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reminders");
      setReminderResult(data);
      if (data.sent?.length > 0) {
        showToast(
          `Reminder${data.sent.length === 1 ? "" : "s"} sent to ${data.sent.length} parent${data.sent.length === 1 ? "" : "s"}`
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
        .catch(() => {});
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

  // ---- Classes & Arms helpers ---------------------------------------------
  function addArm() {
    const arm = newArm.trim();
    if (!arm) return;
    if (!armAlreadyExists(armsDraft || [], arm)) {
      setArmsDraft((d) => [...(d || []), arm]);
    }
    setNewArm("");
  }

  // Merge streamed variants (from ArmStreamSplitter) into the draft, skipping
  // any that already exist (case-insensitively).
  function addStreamedArms(names) {
    setArmsDraft((d) => [
      ...(d || []),
      ...names.filter((n) => !armAlreadyExists(d || [], n)),
    ]);
  }

  function removeArm(arm) {
    const studentCount = stats?.classDistribution?.[arm] || 0;
    const slotCount = armsSlotCounts[arm] || 0;
    const msg =
      studentCount > 0 || slotCount > 0
        ? `${arm} still has ${studentCount} student${studentCount === 1 ? "" : "s"} and ${slotCount} timetable slot${slotCount === 1 ? "" : "s"}. Removing it leaves that data orphaned (the timetable scan flags it). Remove ${arm}?`
        : `Remove ${arm}?`;
    if (!window.confirm(msg)) return;
    setArmsDraft((d) => (d || []).filter((a) => a !== arm));
  }

  async function saveArms() {
    setArmsSaving(true);
    try {
      const res = await fetch("/api/school", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeArms: armsDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save classes");
      // Mirror into the session so every arm selector (timetable, teachers,
      // students…) reflects the change without a page reload.
      setSession((s) =>
        s
          ? {
              ...s,
              school: {
                ...s.school,
                activeArms: data.school?.activeArms ?? s.school?.activeArms,
              },
            }
          : s
      );
      showToast("Classes & arms saved");
    } catch (err) {
      showToast(err.message);
    } finally {
      setArmsSaving(false);
    }
  }

  // Rename an arm: POST the migration, then re-key every local mirror
  // (armsDraft, session school.activeArms, stats.classDistribution, slot
  // counts and fee amounts) so the tab reflects the new name without a reload.
  function openRename(arm) {
    setRenameTarget(arm);
    setRenameValue(arm);
  }

  async function saveRename() {
    if (!renameTarget) return;
    const to = renameValue.trim();
    if (!to || to === renameTarget) return;
    setRenameSaving(true);
    try {
      const res = await fetch("/api/school/rename-arm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: renameTarget, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rename class");
      const { counts } = data;
      const from = renameTarget;
      // Re-key the draft, the session's activeArms and all per-arm stat maps.
      setArmsDraft((d) => (d || []).map((a) => (a === from ? to : a)));
      setSession((s) =>
        s
          ? {
              ...s,
              school: {
                ...s.school,
                activeArms: (s.school?.activeArms || []).map((a) => (a === from ? to : a)),
              },
            }
          : s
      );
      setStats((st) => ({
        ...st,
        classDistribution: Object.fromEntries(
          Object.entries(st.classDistribution || {}).map(([arm, n]) => [arm === from ? to : arm, n])
        ),
      }));
      setArmsSlotCounts((c) =>
        Object.fromEntries(Object.entries(c).map(([arm, n]) => [arm === from ? to : arm, n]))
      );
      setArmsFeeAmounts((c) =>
        Object.fromEntries(Object.entries(c).map(([arm, n]) => [arm === from ? to : arm, n]))
      );
      const moved = Object.entries(counts || {})
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`)
        .join(", ");
      showToast(moved ? `Renamed ${from} → ${to} · ${moved}` : `Renamed ${from} → ${to}`);
      setRenameTarget(null);
    } catch (err) {
      showToast(err.message);
    } finally {
      setRenameSaving(false);
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
        .catch(() => {});
      fetch("/api/fees/structures")
        .then((r) => r.json())
        .then((d) => {
          if (d.structures) {
            setFeeStructures(d.structures);
            setFeeDraft(Object.fromEntries(d.structures.map((s) => [s.classArm, s.amount])));
          }
        })
        .catch(() => {});
      showToast(
        `Started ${data.school?.currentSession} · ${data.school?.currentTerm} — archived ${c.scoresArchived || 0} scores and ${c.attendanceArchived || 0} attendance registers; cloned ${c.feesCloned || 0} fee structures and ${c.timetableCloned || 0} timetable slots`
      );
      setRolloverOpen(false);
      setRolloverPreview(null);
    } catch (err) {
      showToast(err.message);
    } finally {
      setRolloverSaving(false);
    }
  }

  // ---- Previous Terms (term archive viewer) --------------------------------
  function selectArchTerm(t) {
    setArchTerm((prev) =>
      prev && prev.session === t.session && prev.term === t.term
        ? null
        : { session: t.session, term: t.term }
    );
    setArchArm(null);
    setArchDetail(null);
  }

  async function selectArchArm(t, arm) {
    if (archArm === arm && archDetail) return;
    setArchArm(arm);
    setArchDetail(null);
    setArchLoading(true);
    try {
      const params = new URLSearchParams({ session: t.session, term: t.term, classArm: arm });
      const res = await fetch(`/api/school/archives?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the archived term");
      setArchDetail(data);
    } catch (err) {
      showToast(err.message);
      setArchDetail(null);
    } finally {
      setArchLoading(false);
    }
  }

  // Open the existing report-card modal with the ARCHIVED payload — the
  // school object is synthesized with the archived session/term, so the
  // printed card reads the term it belongs to.
  function openArchReport(st) {
    setReportPayload({
      school: archDetail.school,
      student: { name: st.studentName, assignedClass: st.classArm },
      scores: st.scores,
      summary: st.summary,
      attendance: st.attendance,
    });
  }

  // Alumni view — students in an archived roster who are no longer on the
  // live roster (graduated / deleted), with the term they last appeared in.
  async function loadAlumni() {
    setArchMode("alumni");
    if (archAlumniLoaded) return; // already fetched this visit
    setArchAlumniLoading(true);
    try {
      const res = await fetch("/api/school/archives?alumni=1");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load alumni");
      setArchAlumni(data.alumni || []);
      setArchAlumniLoaded(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setArchAlumniLoading(false);
    }
  }

  // Download the alumni list as a CSV from the SERVER-side export
  // (GET /api/school/archives?alumni=1&format=csv) — the same tested
  // buildAlumniCsv helper runs there, so the file is byte-identical to the
  // old client-side export but doesn't depend on the browser (works for
  // large lists and can be reused by scheduled reports).
  //
  // The click is intercepted and the CSV is fetched first: an expired
  // session (the server answers 401 with a JSON body) shows a friendly
  // toast instead of the browser downloading the error payload as a file.
  // On success the blob is saved with the server's Content-Disposition
  // filename (school slug + date), exactly what the anchor navigation
  // would have produced.
  async function exportAlumniCsv(e) {
    if (!archAlumni.length) return;
    e.preventDefault();
    try {
      const res = await fetch("/api/school/archives?alumni=1&format=csv");
      if (res.status === 401) {
        showToast("Your session has expired — sign in again to export.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Could not export the CSV");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : "alumni.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Exported ${archAlumni.length} alumni to CSV`);
    } catch (err) {
      showToast(err.message || "Could not export the CSV");
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
        .catch(() => {});
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
    return (
      <main className="flex flex-1 items-center justify-center bg-navy-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </main>
    );
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
  ];
  // A role-specific hash (e.g. /admin/dashboard#fees as a BURSAR) must not
  // land on a tab they can't see — fall back to the first visible tab.
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0].key;

  const maxArm = Math.max(1, ...Object.values(stats.classDistribution || {}));

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar role={myRole} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-navy-200/70 bg-white/80 px-5 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-navy-600 hover:bg-navy-50 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-sm font-bold text-navy-800">{session.school?.name}</p>
              <p className="text-xs text-navy-400">
                {session.school?.currentSession} · {session.school?.currentTerm}
              </p>
            </div>
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
              sub={`${stats.feeCollected} of ${stats.totalStudents} students paid`}
              accent="emerald"
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

          {/* Tabs */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-xl bg-navy-100 p-1">
              {visibleTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key);
                    history.replaceState(null, "", t.key === "overview" ? "/admin/dashboard" : `/admin/dashboard#${t.key}`);
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    activeTab === t.key ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
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
            <>
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm lg:col-span-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-brand-600" />
                  <h2 className="text-lg font-bold text-navy-800">Class distribution</h2>
                </div>
                <div className="mt-5 space-y-4">
                  {Object.entries(stats.classDistribution || {}).map(([arm, count]) => (
                    <div key={arm}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-navy-700">{arm}</span>
                        <span className="text-navy-400">{count} students</span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-navy-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
                          style={{ width: `${(count / maxArm) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {Object.keys(stats.classDistribution || {}).length === 0 && (
                    <p className="text-sm text-navy-400">No students yet. Add students to see distribution.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-navy-200/70 bg-gradient-to-br from-navy-900 to-navy-800 p-6 text-white shadow-sm">
                <LayoutDashboard className="h-6 w-6 text-brand-300" />
                <h2 className="mt-3 text-lg font-bold">Quick actions</h2>
                <p className="mt-1 text-sm text-navy-300">
                  Manage your school from one place.
                </p>
                <div className="mt-5 space-y-2.5">
                  {[
                    ...(canRoster
                      ? [
                          { label: "Import students & teachers (CSV)", action: () => router.push("/admin/import") },
                          { label: "Quick-add students (paste names)", action: () => router.push("/admin/quick-add") },
                          { label: "Start from class sizes (paper register)", action: () => router.push("/admin/placeholders") },
                        ]
                      : []),
                    ...(canRoster
                      ? [{ label: "Manage students & fees", action: () => setTab("students") }]
                      : []),
                    ...(canFees
                      ? [{ label: "Manage fees & ledger", action: () => setTab("fees") }]
                      : []),
                    ...(canReports
                      ? [{ label: "View report cards", action: () => setTab("reports") }]
                      : []),
                    ...(isSuper
                      ? [
                          { label: "Manage teachers & payroll", action: () => setTab("teachers") },
                          { label: "Add a teacher", action: () => setModal("teacher") },
                        ]
                      : []),
                    ...(canRoster
                      ? [{ label: "Add a student", action: () => setModal("student") }]
                      : []),
                  ].map((a) => (
                    <button
                      key={a.label}
                      onClick={a.action}
                      className="flex w-full items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-navy-100 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
                    >
                      {a.label}
                      <ChevronRight className="h-4 w-4 text-navy-300" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Term rollover — SUPER_ADMIN moves the school to a new term */}
            {isSuper && (
              <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-navy-800">Term rollover</h3>
                      <p className="mt-0.5 text-sm text-navy-400">
                        Currently on{" "}
                        <strong className="text-navy-600">
                          {session?.school?.currentSession} · {session?.school?.currentTerm}
                        </strong>
                        . Starting a new term archives this term&apos;s scores &amp; attendance and carries
                        your fee structures and timetable forward.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={openRollover}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Start a new term
                  </button>
                </div>
              </div>
            )}
            </>
          )}

          {/* Previous Terms */}
          {activeTab === "archives" && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="text-lg font-bold text-navy-800">Previous terms</h2>
                  <p className="text-sm text-navy-400">
                    Archived when you started a new term: each old term&apos;s scores &amp; attendance are
                    kept here per class arm. Open an arm to view its students and print report cards.
                  </p>
                  <div className="mt-3 flex w-fit gap-1 rounded-xl bg-navy-100 p-1">
                    <button
                      onClick={() => setArchMode("terms")}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        archMode === "terms" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                      }`}
                    >
                      Archived terms
                    </button>
                    <button
                      onClick={loadAlumni}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        archMode === "alumni" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                      }`}
                    >
                      Alumni
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  {archMode === "alumni" ? (
                    archAlumniLoading ? (
                      <div className="flex items-center justify-center gap-2 py-10 text-sm text-navy-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading alumni…
                      </div>
                    ) : archAlumni.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
                        <GraduationCap className="mx-auto h-8 w-8 text-navy-300" />
                        <p className="mt-3 text-sm font-medium text-navy-600">No alumni yet</p>
                        <p className="mt-1 text-xs text-navy-400">
                          Students who appear in an archived term but are no longer on the live roster
                          show up here — including the term they last attended.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-navy-400">
                            {archAlumni.length} student{archAlumni.length === 1 ? "" : "s"} no longer on
                            the live roster
                          </p>
                          <a
                            href="/api/school/archives?alumni=1&format=csv"
                            download
                            onClick={exportAlumniCsv}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600"
                          >
                            <Download className="h-3.5 w-3.5" /> Export CSV
                          </a>
                        </div>
                        <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
                              <th className="px-6 py-3">Student</th>
                              <th className="px-6 py-3">Last class arm</th>
                              <th className="px-6 py-3">Last term</th>
                            </tr>
                          </thead>
                          <tbody>
                            {archAlumni.map((a) => (
                              <tr key={a.studentId} className="border-t border-navy-100 hover:bg-navy-50/40">
                                <td className="px-6 py-3 font-semibold text-navy-800">{a.studentName}</td>
                                <td className="px-6 py-3 text-navy-500">{a.classArm || "—"}</td>
                                <td className="px-6 py-3 text-navy-500">
                                  {a.lastSession} · {a.lastTerm}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-3 text-xs text-navy-400">
                          The term shown is the last one each student appears in across the archives.
                        </p>
                        </div>
                      </div>
                    )
                  ) : archTerms.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
                      <History className="mx-auto h-8 w-8 text-navy-300" />
                      <p className="mt-3 text-sm font-medium text-navy-600">No archived terms yet</p>
                      <p className="mt-1 text-xs text-navy-400">
                        The term rollover on the Overview archives each old term here automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {archTerms.map((t) => {
                        const selected = archTerm && archTerm.session === t.session && archTerm.term === t.term;
                        return (
                          <div
                            key={`${t.session}|${t.term}`}
                            className={`rounded-xl border p-4 transition ${
                              selected
                                ? "border-brand-400 bg-brand-50/40"
                                : "border-navy-200/70 bg-white hover:border-brand-300"
                            }`}
                          >
                            <button
                              onClick={() => selectArchTerm(t)}
                              className="flex w-full items-center justify-between gap-3 text-left"
                            >
                              <div>
                                <p className="text-sm font-bold text-navy-800">
                                  {t.session} · {t.term}
                                </p>
                                <p className="mt-0.5 text-xs text-navy-400">
                                  {t.scoreCount} score records · {t.attendanceCount} attendance registers
                                </p>
                              </div>
                              <ChevronRight
                                className={`h-4 w-4 text-navy-300 transition ${selected ? "rotate-90" : ""}`}
                              />
                            </button>

                            {selected && (
                              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {t.arms.map((arm) => (
                                  <button
                                    key={arm.classArm}
                                    onClick={() => selectArchArm(t, arm.classArm)}
                                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                                      archArm === arm.classArm
                                        ? "border-brand-600 bg-brand-600 text-white"
                                        : "border-navy-200 bg-navy-50/40 hover:border-brand-400"
                                    }`}
                                  >
                                    <p className="font-bold">{arm.classArm}</p>
                                    <p
                                      className={`mt-1 text-xs ${
                                        archArm === arm.classArm ? "text-white/80" : "text-navy-400"
                                      }`}
                                    >
                                      {arm.scoreCount} scores · {arm.attendanceCount} registers
                                    </p>
                                  </button>
                                ))}
                                {t.arms.length === 0 && (
                                  <p className="col-span-full text-xs text-navy-400">
                                    No class arms in this archived term.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Per-arm detail */}
              {archMode === "terms" && archDetail && (
                <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-6 py-4">
                    <div>
                      <h3 className="text-lg font-bold text-navy-800">
                        {archDetail.classArm} · {archDetail.term}
                      </h3>
                      <p className="text-sm text-navy-400">
                        {archDetail.students.length} students in the archived {archDetail.session} cohort
                      </p>
                    </div>
                    <button
                      onClick={() => setArchDetail(null)}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-navy-500 transition hover:bg-navy-50"
                    >
                      Close arm
                    </button>
                  </div>
                  {archLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-navy-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading archived scores…
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
                            <th className="px-6 py-3">Student</th>
                            <th className="px-6 py-3">Subjects</th>
                            <th className="px-6 py-3">Average</th>
                            <th className="px-6 py-3">Position</th>
                            <th className="px-6 py-3">Attendance</th>
                            <th className="px-6 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {archDetail.students.map((st) => (
                            <tr key={st.studentId} className="border-t border-navy-100 hover:bg-navy-50/40">
                              <td className="px-6 py-3 font-semibold text-navy-800">{st.studentName}</td>
                              <td className="px-6 py-3 text-navy-500">{st.summary.subjects}</td>
                              <td className="px-6 py-3 font-bold text-navy-800">{st.summary.average}%</td>
                              <td className="px-6 py-3 text-navy-500">
                                {st.summary.position ? `${ordinal(st.summary.position)} of ${st.summary.outOf}` : "—"}
                              </td>
                              <td className="px-6 py-3 text-navy-500">
                                {st.attendance.present} of {st.attendance.total} days
                              </td>
                              <td className="px-6 py-3 text-right">
                                <button
                                  onClick={() => openArchReport(st)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy-700"
                                >
                                  <FileText className="h-3.5 w-3.5" /> Report card
                                </button>
                              </td>
                            </tr>
                          ))}
                          {archDetail.students.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-6 py-10 text-center text-navy-400">
                                No scores or attendance were archived for this arm.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Classes & Arms */}
          {activeTab === "classes" && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="text-lg font-bold text-navy-800">Classes & arms</h2>
                  <p className="text-sm text-navy-400">
                    Class arms are free-form — name them however your school does
                    (&quot;JSS1 A&quot;, &quot;JSS1 Blue&quot;, &quot;SS1 Science&quot;…). Every feature keys off
                    these names: timetables, teacher scopes, fees, attendance and report cards.
                  </p>
                </div>

                <div className="p-6">
                  {armsDraft === null ? (
                    <div className="flex items-center gap-2 py-10 text-sm text-navy-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading classes…
                    </div>
                  ) : armsDraft.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
                      <Layers className="mx-auto h-8 w-8 text-navy-300" />
                      <p className="mt-3 text-sm font-medium text-navy-600">No classes yet</p>
                      <p className="mt-1 text-xs text-navy-400">
                        Add your first arm below, or split a class into streams.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {armsDraft.map((arm) => {
                        const students = stats?.classDistribution?.[arm] || 0;
                        const slots = armsSlotCounts[arm] || 0;
                        const fee = armsFeeAmounts[arm];
                        return (
                          <div
                            key={arm}
                            className="rounded-xl border border-navy-200/70 bg-white p-4 transition hover:border-brand-300"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-bold text-navy-800">{arm}</p>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openRename(arm)}
                                  className="rounded-lg p-1 text-navy-300 transition hover:bg-brand-50 hover:text-brand-600"
                                  title={`Rename ${arm}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => removeArm(arm)}
                                  className="rounded-lg p-1 text-navy-300 transition hover:bg-rose-50 hover:text-rose-600"
                                  title={`Remove ${arm}`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-lg bg-navy-50 py-2">
                                <p className="text-sm font-bold text-navy-800">{students}</p>
                                <p className="text-[10px] uppercase tracking-wide text-navy-400">Students</p>
                              </div>
                              <div className="rounded-lg bg-navy-50 py-2">
                                <p className="text-sm font-bold text-navy-800">{slots}</p>
                                <p className="text-[10px] uppercase tracking-wide text-navy-400">Timetable</p>
                              </div>
                              <div className="rounded-lg bg-navy-50 py-2">
                                <p className="text-sm font-bold text-navy-800">{fee ? naira(fee) : "—"}</p>
                                <p className="text-[10px] uppercase tracking-wide text-navy-400">Term fee</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add a custom arm */}
                  <div className="mt-5 flex gap-2">
                    <input
                      value={newArm}
                      onChange={(e) => setNewArm(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addArm()}
                      placeholder="Custom arm, e.g. JSS1 Blue"
                      className="flex-1 rounded-xl border border-navy-200 px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                    <button
                      onClick={addArm}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
                    >
                      <Plus className="h-4 w-4" /> Add arm
                    </button>
                  </div>

                  <div className="mt-4">
                    <ArmStreamSplitter onAdd={addStreamedArms} />
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-3">
                    <span className="text-xs text-navy-400">
                      {armsDraft !== null &&
                      JSON.stringify(armsDraft) !== JSON.stringify(session?.school?.activeArms || [])
                        ? "Unsaved changes"
                        : "Saved"}
                    </span>
                    <button
                      onClick={saveArms}
                      disabled={armsSaving || armsDraft === null}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {armsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Teachers */}
          {activeTab === "teachers" && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
              <div className="border-b border-navy-100 px-6 py-4">
                <h2 className="text-lg font-bold text-navy-800">Teacher directory & payroll</h2>
                <p className="text-sm text-navy-400">
                  Click the status badge to toggle a teacher&apos;s compensation between Paid and Pending.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                      <th className="px-6 py-3">Teacher</th>
                      <th className="px-6 py-3">Email</th>
                      <th className="px-6 py-3">Teaches</th>
                      <th className="px-6 py-3">Payroll</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeachers.map((t) => (
                      <tr key={t.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                              {t.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-semibold text-navy-800">{t.name}</span>
                            <button
                              onClick={() => openReset(t)}
                              title={`Reset ${t.name}'s password`}
                              className="ml-1 rounded-lg p-1.5 text-navy-300 transition hover:bg-brand-50 hover:text-brand-600"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                            {isSuper && (
                              <button
                                onClick={() => openScope(t)}
                                title={`Assign ${t.name}'s subjects & arms`}
                                className="rounded-lg p-1.5 text-navy-300 transition hover:bg-violet-50 hover:text-violet-600"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-navy-500">{t.email}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-1">
                              {(t.subjects?.length ? t.subjects : [t.assignedClass || "Unassigned"]).map((s) => (
                                <span
                                  key={s}
                                  className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-600/20"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                            <span className="text-[11px] font-medium text-navy-400">
                              {t.assignedClasses?.length
                                ? `${t.assignedClasses.length} arm${t.assignedClasses.length === 1 ? "" : "s"}: ${t.assignedClasses.join(", ")}`
                                : t.assignedClass || "No arms assigned"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => togglePayroll(t.id, t.payrollStatus)}
                            title="Click to toggle payroll status"
                          >
                            <PayrollBadge status={t.payrollStatus} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredTeachers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-navy-400">
                          No teachers found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Roles & Access */}
          {activeTab === "roles" && (
            <div className="mt-5 space-y-5 animate-fade-up">
              {/* What each role can do — rendered straight from ROLE_PERMISSIONS
                  (the single source of truth), so what the admin sees here is
                  exactly what the API enforces on every request. */}
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                    <ShieldCheck className="h-5 w-5 text-brand-600" />
                    What each role can do
                  </h2>
                  <p className="mt-0.5 text-sm text-navy-400">
                    The exact action list from <code className="rounded bg-navy-100 px-1 py-0.5 font-mono text-xs text-navy-600">ROLE_PERMISSIONS</code> —
                    a promotion grants exactly this, nothing more.
                  </p>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
                  {MANAGED_ROLES.map((role) => {
                    const summary = summarizeRolePermissions(role);
                    return (
                      <div
                        key={role}
                        className="rounded-xl border border-navy-100 bg-navy-50/40 p-4 transition hover:border-brand-200 hover:bg-brand-50/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${ROLE_BADGES[role] || "bg-navy-100 text-navy-600"}`}
                          >
                            {ROLE_LABELS[role] || role}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-navy-500 ring-1 ring-navy-200/70">
                            {summary.count} action{summary.count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="mt-3 space-y-3">
                          {summary.domains.map((d) => (
                            <div key={d.key}>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                                {d.label}
                              </p>
                              <ul className="mt-1 space-y-1">
                                {d.actions.map((a) => (
                                  <li
                                    key={a.action}
                                    className="flex items-start gap-1.5 text-xs text-navy-700"
                                    title={a.action}
                                  >
                                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                    {a.label}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-navy-100 bg-navy-50/40 px-6 py-3 text-xs text-navy-500">
                  Row-level scoping applies on top of this list — a teacher&apos;s actions cover
                  only their assigned class arm, a parent only their own children.
                </div>
              </div>

              {/* Staff directory */}
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                    <UserCog className="h-5 w-5 text-brand-600" />
                    Staff roles &amp; access
                  </h2>
                  <p className="mt-0.5 text-sm text-navy-400">
                    Promote or demote staff between Super Admin, Bursar, Registrar and Teacher.
                    Changes apply immediately — the staff member will need to sign in again.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-6 py-3">Staff</th>
                        <th className="px-6 py-3">Current role</th>
                        <th className="px-6 py-3">New role</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.map((u) => {
                        const isYou = u.id === session.user.id;
                        const draft = roleDraft[u.id] ?? u.role;
                        const dirty = draft !== u.role;
                        return (
                          <tr key={u.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-sm font-bold text-white">
                                  {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="flex items-center gap-2 font-semibold text-navy-800">
                                    {u.name}
                                    {isYou && (
                                      <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy-500">
                                        You
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-navy-400">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${ROLE_BADGES[u.role] || "bg-navy-100 text-navy-600"}`}>
                                {ROLE_LABELS[u.role] || u.role}
                              </span>
                            </td>
                            <td className="px-6 py-3.5">
                              {isYou ? (
                                <span className="text-xs text-navy-300">—</span>
                              ) : (
                                <select
                                  value={draft}
                                  onChange={(e) => setRoleDraft((d) => ({ ...d, [u.id]: e.target.value }))}
                                  className="rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-sm font-medium text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                >
                                  {Object.keys(ROLE_LABELS).map((r) => (
                                    <option key={r} value={r}>
                                      {ROLE_LABELS[r]}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openReset(u)}
                                  title={`Reset ${u.name}'s password`}
                                  className="rounded-lg p-1.5 text-navy-300 transition hover:bg-brand-50 hover:text-brand-600"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </button>
                                {!isYou && (
                                  <button
                                    onClick={() => requestRoleChange(u, draft)}
                                    disabled={!dirty || roleSaving}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                    Change role
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {staffList.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-navy-400">
                            No staff accounts yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Audit trail */}
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                    <History className="h-5 w-5 text-brand-600" />
                    Role change audit trail
                  </h2>
                  <p className="text-sm text-navy-400">
                    Every promotion or demotion — who did it, and when.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-6 py-3">When</th>
                        <th className="px-6 py-3">Change</th>
                        <th className="px-6 py-3">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roleAudit.map((e) => (
                        <tr key={e.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                          <td className="whitespace-nowrap px-6 py-3.5 text-xs text-navy-500">
                            {new Date(e.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-navy-800">{e.targetName}</span>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${ROLE_BADGES[e.fromRole] || "bg-navy-100 text-navy-600"}`}>
                                {ROLE_LABELS[e.fromRole] || e.fromRole}
                              </span>
                              <ArrowLeftRight className="h-3.5 w-3.5 text-navy-300" />
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${ROLE_BADGES[e.toRole] || "bg-navy-100 text-navy-600"}`}>
                                {ROLE_LABELS[e.toRole] || e.toRole}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <p className="font-semibold text-navy-800">{e.actorName}</p>
                            <p className="text-xs text-navy-400">{ROLE_LABELS[e.actorRole] || e.actorRole}</p>
                          </td>
                        </tr>
                      ))}
                      {roleAudit.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-10 text-center text-navy-400">
                            No role changes yet — the first promotion or demotion will appear here.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Login Details */}
          {activeTab === "logins" && (
            <div className="mt-5 space-y-5 animate-fade-up">
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                    <KeyRound className="h-5 w-5 text-brand-600" />
                    Login Details
                  </h2>
                  <p className="text-sm text-navy-400">
                    Every staff account and parent — with email and password reset.
                    Students are excluded (their password is auto-derived as their
                    name + class arm and the list would be long).
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-left text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-6 py-3">User</th>
                        <th className="px-6 py-3">Role</th>
                        <th className="px-6 py-3">Class</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loginUsers.map((u) => (
                        <tr key={u.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-sm font-bold text-white">
                                {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-navy-800">{u.name}</p>
                                <p className="text-xs text-navy-400">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${ROLE_BADGES[u.role] || "bg-navy-100 text-navy-600"}`}>
                              {ROLE_LABELS[u.role] || u.role}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-navy-500">
                            {u.assignedClass || (u.assignedClasses?.length ? u.assignedClasses.join(", ") : "—")}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <button
                              onClick={() => openReset(u)}
                              title={`Reset ${u.name}'s password`}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-700"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Reset password
                            </button>
                          </td>
                        </tr>
                      ))}
                      {loginUsers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-navy-400">
                            No accounts yet beyond the super admin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Timetable */}
          {activeTab === "timetable" && (
            <div className="mt-5 space-y-5 animate-fade-up">
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-6 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                      <CalendarDays className="h-5 w-5 text-brand-600" />
                      Weekly timetable
                    </h2>
                    <p className="mt-0.5 text-sm text-navy-400">
                      Set the schedule for each class arm — click any cell to assign a subject and teacher.
                      Teachers see their own slots the moment you save.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => checkTtConflicts()}
                      disabled={ttConflictsLoading}
                      title="Scan every arm for teachers double-booked at the same day + period (including pre-existing data)"
                      className="inline-flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
                    >
                      {ttConflictsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      Check conflicts
                      {ttConflicts &&
                        (ttConflicts.teacher?.length || 0) +
                          (ttConflicts.arm?.length || 0) +
                          (ttConflicts.scope?.length || 0) >
                          0 && (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">
                            {(ttConflicts.teacher?.length || 0) +
                              (ttConflicts.arm?.length || 0) +
                              (ttConflicts.scope?.length || 0)}
                          </span>
                        )}
                    </button>
                    <div className="relative w-64">
                      <select
                        value={ttArm}
                        onChange={(e) => setTtArm(e.target.value)}
                        className={`${inputCls} appearance-none pr-9`}
                      >
                        {(session.school?.activeArms || []).map((arm) => (
                          <option key={arm}>{arm}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-4 py-3">Period</th>
                        {DAYS.map((d) => {
                          const count = (dayTimelines[d] || []).filter((b) => b.type === "teaching").length;
                          return (
                            <th key={d} className="px-4 py-3 text-center">
                              {d}
                              {count < MAX_PERIOD && (
                                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                  {count} periods
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {dayTimeline.map((block) =>
                        block.type === "break" ? (
                          <tr key="break" className="border-b border-navy-50">
                            <td className="bg-violet-50/60 px-4 py-3">
                              <p className="text-xs font-bold text-violet-700">Break</p>
                              <p className="text-[10px] font-medium text-violet-500">
                                {block.start}–{block.end}
                              </p>
                            </td>
                            {DAYS.map((d) => {
                              const br = (dayTimelines[d] || []).find((b) => b.type === "break");
                              return (
                                <td key={d} className="bg-violet-50/40 px-2 py-2 text-center">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-500">
                                    {br ? `${br.start}–${br.end}` : "No break"}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ) : (
                          <tr key={block.period} className="border-b border-navy-50">
                            <td className="px-4 py-3">
                              <p className="text-xs font-bold text-navy-500">Period {block.period}</p>
                              <p className="text-[10px] font-medium text-navy-400">
                                {block.start}–{block.end}
                              </p>
                            </td>
                            {DAYS.map((d) => {
                              // A period that isn't on this day's bell (e.g.
                              // Friday ends at period 6) is not schedulable.
                              if (!(dayPeriodSets[d] || new Set()).has(Number(block.period))) {
                                return (
                                  <td key={d} className="px-2 py-2 text-center">
                                    <span className="text-[10px] font-medium text-navy-300">
                                      not scheduled
                                    </span>
                                  </td>
                                );
                              }
                              const entry = ttByKey[`${d}|${block.period}`];
                              return (
                                <td key={d} className="px-2 py-2 text-center">
                                  <button
                                    onClick={() => openTtCell(d, block.period)}
                                    className={`w-full min-w-[7.5rem] rounded-xl border px-2 py-2 text-left transition ${
                                      entry
                                        ? "border-brand-200 bg-brand-50/70 hover:border-brand-400 hover:bg-brand-50"
                                        : "border-dashed border-navy-200 bg-navy-50/40 text-navy-400 hover:border-brand-300 hover:bg-brand-50/40"
                                    }`}
                                  >
                                    {entry ? (
                                      <span className="flex flex-col items-center gap-0.5">
                                        <span className="text-xs font-bold text-brand-800">{entry.subject}</span>
                                        <span className="text-[10px] font-medium text-navy-500">
                                          {entry.teacherName || "—"}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="flex items-center justify-center gap-1 text-[11px] font-semibold">
                                        <Plus className="h-3 w-3" /> Assign
                                      </span>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-navy-100 bg-navy-50/40 px-6 py-3 text-xs text-navy-500">
                  {ttFilled} of {DAYS.length * PERIODS.length} slots assigned for {ttArm}. Assigning a period
                  replaces what was there; the API refuses a teacher who is already booked in another arm at the
                  same day and period.
                </div>
              </div>

              {/* Conflicts checker — scans EVERY arm, including pre-existing data */}
              {ttConflictsOpen && (
                <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-6 py-4">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                        <AlertTriangle className="h-5 w-5 text-rose-600" /> Timetable scan
                      </h2>
                      <p className="mt-0.5 text-sm text-navy-400">
                        Every class arm, including pre-existing data — double-bookings, scope violations, and the
                        other integrity checks (unassigned days, unscheduled teachers, orphaned entries).
                      </p>
                    </div>
                    <button
                      onClick={() => checkTtConflicts()}
                      disabled={ttConflictsLoading}
                      className="inline-flex items-center gap-2 rounded-xl border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-600 transition hover:bg-navy-50 disabled:opacity-60"
                    >
                      {ttConflictsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Re-scan
                    </button>
                  </div>
                  <div className="p-5">
                    {ttConflictsLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-sm text-navy-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Scanning all {(session.school?.activeArms || []).length} arms…
                      </div>
                    ) : (ttConflicts?.teacher?.length || 0) +
                      (ttConflicts?.arm?.length || 0) +
                      (ttConflicts?.scope?.length || 0) +
                      (ttConflicts?.unassignedPeriods?.length || 0) +
                      (ttConflicts?.unstaffedTeachers?.length || 0) +
                      (ttConflicts?.orphanedEntries?.length || 0) ===
                      0 ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        No issues — no double-bookings, every teacher has slots, and every arm is scheduled.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(ttConflicts?.teacher || []).map((c) => (
                          <div
                            key={`t|${c.teacherId}|${c.day}|${c.period}`}
                            className="rounded-xl border border-rose-200 bg-rose-50/50 p-4"
                          >
                            <p className="text-sm font-bold text-navy-800">
                              <span className="text-rose-700">{c.teacherName || "Unknown teacher"}</span> is booked
                              in {c.slots.length} classes on <strong>{c.day}</strong>, period{" "}
                              <strong>{c.period}</strong>
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {c.slots.map((s) => (
                                <div
                                  key={s.id}
                                  className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs"
                                >
                                  <span className="font-bold text-navy-700">{s.classArm}</span>
                                  <span className="text-navy-400">·</span>
                                  <span className="text-navy-500">{s.subject}</span>
                                  <button
                                    onClick={() => fixTtConflict(s)}
                                    disabled={
                                      ttConflictFixing === `${s.classArm}|${s.day}|${s.period}`
                                    }
                                    className="ml-1 inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
                                  >
                                    {ttConflictFixing === `${s.classArm}|${s.day}|${s.period}` ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                    Clear slot
                                  </button>
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-[11px] text-navy-400">
                              Clearing a slot frees the teacher for that period — reassign it from the grid if
                              the arm should keep the subject.
                            </p>
                          </div>
                        ))}
                        {(ttConflicts?.arm || []).map((c) => (
                          <div
                            key={`a|${c.classArm}|${c.day}|${c.period}`}
                            className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"
                          >
                            <p className="text-sm font-bold text-navy-800">
                              <span className="text-amber-700">{c.classArm}</span> has {c.slots.length} entries
                              on <strong>{c.day}</strong>, period <strong>{c.period}</strong> — keep one, clear
                              the rest.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {c.slots.map((s) => (
                                <div
                                  key={s.id}
                                  className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs"
                                >
                                  <span className="font-bold text-navy-700">{s.subject}</span>
                                  <span className="text-navy-400">·</span>
                                  <span className="text-navy-500">{s.teacherName || "—"}</span>
                                  <button
                                    onClick={() => fixTtConflict(s)}
                                    disabled={
                                      ttConflictFixing === `${s.classArm}|${s.day}|${s.period}`
                                    }
                                    className="ml-1 inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-amber-500 disabled:opacity-60"
                                  >
                                    {ttConflictFixing === `${s.classArm}|${s.day}|${s.period}` ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                    Clear slot
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {/* Scope violations — a teacher scheduled for a subject/arm
                            they don't teach (or no longer in the roster). Offer a
                            one-click swap to a valid, free teacher. */}
                        {(ttConflicts?.scope || []).map((v) => {
                          const chosen =
                            ttSwapDraft[v.entryId] || v.candidates?.[0]?.id || "";
                          const problemText = v.problems.includes("teacher")
                            ? "but is no longer in the roster"
                            : v.problems.includes("subject") && v.problems.includes("arm")
                              ? `but does not teach ${v.subject} nor is assigned to ${v.classArm}`
                              : v.problems.includes("subject")
                                ? `but does not teach ${v.subject}`
                                : `but is not assigned to ${v.classArm}`;
                          return (
                            <div
                              key={`s|${v.entryId}`}
                              className="rounded-xl border border-sky-200 bg-sky-50/50 p-4"
                            >
                              <p className="text-sm font-bold text-navy-800">
                                <span className="text-sky-700">{v.teacherName || "Unknown teacher"}</span> is
                                scheduled for <strong>{v.subject}</strong> in <strong>{v.classArm}</strong> on{" "}
                                <strong>{v.day}</strong>, period <strong>{v.period}</strong> — {problemText}.
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {v.candidates?.length > 0 ? (
                                  <>
                                    <select
                                      value={chosen}
                                      onChange={(e) =>
                                        setTtSwapDraft((d) => ({ ...d, [v.entryId]: e.target.value }))
                                      }
                                      className="rounded-lg border border-navy-200 bg-white px-2 py-1.5 text-xs font-semibold text-navy-700 outline-none transition focus:border-brand-500"
                                      title="Pick a teacher who teaches this subject in this arm and is free that period"
                                    >
                                      {v.candidates.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => swapTtTeacher(v, chosen)}
                                      disabled={!chosen || ttConflictFixing === `swap|${v.entryId}`}
                                      className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
                                    >
                                      {ttConflictFixing === `swap|${v.entryId}` ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <ArrowLeftRight className="h-3 w-3" />
                                      )}
                                      Swap in valid teacher
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-xs font-medium text-sky-600">
                                    No valid substitute is free that period — clear the slot instead.
                                  </span>
                                )}
                                <button
                                  onClick={() => fixTtConflict(v)}
                                  disabled={ttConflictFixing === `${v.classArm}|${v.day}|${v.period}`}
                                  className="inline-flex items-center gap-1 rounded-md border border-navy-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-navy-600 transition hover:bg-navy-50 disabled:opacity-60"
                                >
                                  {ttConflictFixing === `${v.classArm}|${v.day}|${v.period}` ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                  Clear slot
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {/* Integrity checks — beyond collisions: an arm with an
                            entirely unassigned day, roster teachers with no
                            slots at all, entries left in deactivated arms. */}
                        {(ttConflicts?.unassignedPeriods?.length ||
                          ttConflicts?.unstaffedTeachers?.length ||
                          ttConflicts?.orphanedEntries?.length) > 0 && (
                          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                            <p className="text-sm font-bold text-navy-800">
                              <ShieldCheck className="mr-1.5 inline h-4 w-4 text-violet-600" />
                              Integrity checks
                            </p>
                            <div className="mt-3 space-y-2 text-xs text-navy-600">
                              {(ttConflicts?.unassignedPeriods || []).map((u) => (
                                <p key={`u|${u.classArm}|${u.day}`} className="flex items-start gap-2">
                                  <CalendarX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                                  <span>
                                    <strong>{u.classArm}</strong> has no classes on <strong>{u.day}</strong> —
                                    assign at least one period from the grid.
                                  </span>
                                </p>
                              ))}
                              {(ttConflicts?.unstaffedTeachers || []).map((t) => (
                                <p key={`ut|${t.teacherId}`} className="flex items-start gap-2">
                                  <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                                  <span>
                                    <strong>{t.teacherName || "Unknown teacher"}</strong> has no timetable
                                    slots — schedule them or remove them from the roster.
                                  </span>
                                </p>
                              ))}
                              {(ttConflicts?.orphanedEntries || []).map((o) => (
                                <p key={`or|${o.entryId}`} className="flex items-start gap-2">
                                  <Link2Off className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                                  <span>
                                    <strong>{o.subject}</strong> in <strong>{o.classArm}</strong> ({o.day},
                                    period {o.period})
                                    {o.teacherName ? ` — ${o.teacherName}` : ""} — the arm is no longer
                                    active. Delete or reassign the slot.
                                  </span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Period times — the bell schedule behind the class-alert alarms */}
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-6 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                      <Clock className="h-5 w-5 text-brand-600" /> Period times
                    </h2>
                    <p className="mt-0.5 text-sm text-navy-400">
                      The bell schedule drives the class-alert alarms teachers receive — edit when each period
                      starts and ends, then save.
                    </p>
                  </div>
                  <button
                    onClick={savePeriodTimes}
                    disabled={periodTimesSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
                  >
                    {periodTimesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save times
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 px-6 py-3">
                  {["ALL", ...DAYS].map((d) => {
                    const active = bellDay === d;
                    const custom = d !== "ALL" && Boolean(dailyDrafts[d]);
                    return (
                      <button
                        key={d}
                        onClick={() => selectBellDay(d)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-brand-600 text-white shadow"
                            : "bg-navy-50 text-navy-600 hover:bg-navy-100"
                        }`}
                      >
                        {d === "ALL" ? "All days" : d}
                        {custom && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            custom
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                  {bellDay !== "ALL" && (
                    <div className="col-span-full flex flex-wrap items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/40 p-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-navy-600">
                        Periods on this day
                        <select
                          value={bellDraft.periodTimes.length}
                          onChange={(e) => setBellDayPeriodCount(bellDay, Number(e.target.value))}
                          className={`${inputCls} !px-2 !py-1 text-xs`}
                        >
                          {PERIODS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="text-[11px] text-navy-400">
                        A shorter day (e.g. Friday ends at period 6) simply drops the later periods.
                      </span>
                      <button
                        onClick={() => resetBellDay(bellDay)}
                        disabled={!bellDraft.overridden}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-600 transition hover:bg-navy-50 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Use school default
                      </button>
                    </div>
                  )}
                  {bellDraft.periodTimes.map((pt) => (
                    <div key={pt.period} className="rounded-xl border border-navy-100 bg-navy-50/40 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                        Period {pt.period}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] font-medium text-navy-400">Start</span>
                          <input
                            type="time"
                            value={pt.start}
                            onChange={(e) => setPeriodTime(pt.period, "start", e.target.value)}
                            className={`${inputCls} !px-2 !py-1.5 text-xs`}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] font-medium text-navy-400">End</span>
                          <input
                            type="time"
                            value={pt.end}
                            onChange={(e) => setPeriodTime(pt.period, "end", e.target.value)}
                            className={`${inputCls} !px-2 !py-1.5 text-xs`}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  {/* The school-wide mid-day break — a display/alert concept,
                      never a timetable entry, so no teacher is ever assigned. */}
                  <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                      Break · between periods 4 &amp; 5
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-medium text-navy-400">Start</span>
                        <input
                          type="time"
                          value={bellDraft.breakTimes.start}
                          onChange={(e) => setBreakTime("start", e.target.value)}
                          className={`${inputCls} !px-2 !py-1.5 text-xs`}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-medium text-navy-400">End</span>
                        <input
                          type="time"
                          value={bellDraft.breakTimes.end}
                          onChange={(e) => setBreakTime("end", e.target.value)}
                          className={`${inputCls} !px-2 !py-1.5 text-xs`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>Teachers see this instantly.</strong> Every assignment flows straight into the teacher
                  portal&apos;s weekly timetable — a Mathematics teacher covering all twelve classes gets twelve
                  separate schedules, one per class, with today&apos;s column highlighted — and, when alerts are
                  enabled, an alarm rings as each period approaches.
                </p>
              </div>
            </div>
          )}

          {/* Fee Management */}
          {activeTab === "fees" && (
            <div className="mt-5 animate-fade-up">
              {/* Summary cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  icon={Receipt}
                  label="Total Billed"
                  value={naira(feeTotals?.billed)}
                  sub="Termly fee structures × enrolment"
                  accent="brand"
                />
                <MetricCard
                  icon={Banknote}
                  label="Collected"
                  value={naira(feeTotals?.collected)}
                  sub={`${naira(feeTotals?.outstanding)} outstanding`}
                  accent="emerald"
                />
                <MetricCard
                  icon={AlertTriangle}
                  label="Defaulters"
                  value={feeTotals?.defaulters ?? 0}
                  sub={`${feeTotals?.paid ?? 0} students fully paid`}
                  accent="amber"
                />
                <MetricCard
                  icon={Wallet}
                  label="Collection Rate"
                  value={
                    feeTotals?.billed
                      ? `${Math.round((feeTotals.collected / feeTotals.billed) * 100)}%`
                      : "—"
                  }
                  sub="Amount collected ÷ billed"
                  accent="navy"
                />
              </div>

              {/* Reconcile & forward — reminders that went to the STUDENT (no
                  parent at send time) and can now be pushed to a linked parent. */}
              {pendingReconciles.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/30">
                      <Send className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-sky-900">
                        {pendingReconciles.reduce((a, p) => a + p.reminders.length, 0)} reminder{pendingReconciles.reduce((a, p) => a + p.reminders.length, 0) === 1 ? "" : "s"} can be forwarded to parents
                      </p>
                      <p className="truncate text-xs text-sky-700">
                        These went to the student when no parent was linked — now that a parent exists, send them a copy too.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setReconcileModal(true);
                      setReconcileResult(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-600/30 transition hover:bg-sky-500"
                  >
                    <Send className="h-4 w-4" /> Reconcile &amp; forward
                    <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                      {pendingReconciles.length}
                    </span>
                  </button>
                </div>
              )}

              {/* Payments awaiting confirmation (from the parent portal) */}
              {pendingPayments.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50/60 px-6 py-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      <h2 className="text-lg font-bold text-navy-800">Awaiting your confirmation</h2>
                    </div>
                    <span className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white">
                      {pendingPayments.length} pending
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                          <th className="px-6 py-3">Student</th>
                          <th className="px-6 py-3">Receipt</th>
                          <th className="px-6 py-3">Method</th>
                          <th className="px-6 py-3 text-right">Amount</th>
                          <th className="px-6 py-3">Paid on</th>
                          <th className="px-6 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingPayments.map((p) => (
                          <tr key={p.id} className="border-b border-amber-50 transition hover:bg-amber-50/40">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-sm font-bold text-amber-600">
                                  {p.studentName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-navy-800">{p.studentName}</p>
                                  <p className="text-xs text-navy-400">{p.assignedClass || "Unassigned"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-bold text-navy-600">
                                {p.receiptNo}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-navy-500">{p.method}</td>
                            <td className="px-6 py-3.5 text-right font-bold text-amber-700">{naira(p.amount)}</td>
                            <td className="px-6 py-3.5 text-navy-500">
                              {new Date(p.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              {isSuper ? (
                                <button
                                  onClick={() => confirmPayment(p.id)}
                                  disabled={confirmingId === p.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:opacity-60"
                                >
                                  {confirmingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  Confirm
                                </button>
                              ) : (
                                <span
                                  title="Only the Super Admin can confirm parent-portal payments"
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-navy-100 px-3.5 py-2 text-xs font-semibold text-navy-500"
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Super Admin only
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-amber-100 bg-amber-50/40 px-6 py-3 text-xs text-amber-700">
                    These payments were initiated from the parent portal and only count toward balances
                    once you confirm the money was received.
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 py-2">
                  <Receipt className="h-4 w-4 text-brand-600" />
                  <select
                    value={feeClass}
                    onChange={(e) => setFeeClass(e.target.value)}
                    className="bg-transparent text-sm font-medium text-navy-700 outline-none"
                  >
                    <option value="">All class arms</option>
                    {(session.school?.activeArms || []).map((arm) => (
                      <option key={arm}>{arm}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setFeeDefaultersOnly((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                    feeDefaultersOnly
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-navy-200 bg-white text-navy-600 hover:border-amber-300"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  {feeDefaultersOnly ? "Showing defaulters" : "Defaulters only"}
                </button>
                <button
                  onClick={() => {
                    setReminderModal("all");
                    setReminderResult(null);
                  }}
                  disabled={(feeTotals?.defaulters ?? 0) === 0}
                  title="Send a fee reminder to every parent with an outstanding balance"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BellRing className="h-4 w-4" />
                  Send reminders
                  {(feeTotals?.defaulters ?? 0) > 0 && (
                    <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {feeTotals.defaulters}
                    </span>
                  )}
                </button>
              </div>

              {/* Fee structures editor */}
              <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="text-lg font-bold text-navy-800">Termly fee structures</h2>
                  <p className="text-sm text-navy-400">
                    Set the termly fee per class arm. Students in each arm are billed this amount automatically.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-6 py-3">Class Arm</th>
                        <th className="px-6 py-3">Termly Fee</th>
                        <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(session.school?.activeArms || []).map((arm) => (
                        <tr key={arm} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                          <td className="px-6 py-3.5">
                            <span className="font-semibold text-navy-800">{arm}</span>
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-semibold text-navy-400">₦</span>
                              <input
                                type="number"
                                min={0}
                                value={feeDraft[arm] ?? ""}
                                disabled={!isSuper}
                                onChange={(e) => setFeeDraft((d) => ({ ...d, [arm]: e.target.value }))}
                                placeholder="e.g. 185000"
                                className="w-40 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-navy-50 disabled:text-navy-400"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            {isSuper ? (
                              <button
                                onClick={() => saveFeeStructure(arm)}
                                disabled={feeSaving}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
                              >
                                {feeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Save
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-navy-100 px-3.5 py-2 text-xs font-semibold text-navy-500">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Super Admin only
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(session.school?.activeArms || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-10 text-center text-navy-400">
                            Configure class arms in the school onboarding first.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ledger */}
              <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="text-lg font-bold text-navy-800">
                    Fee ledger{feeDefaultersOnly ? " — defaulters" : ""}
                  </h2>
                  <p className="text-sm text-navy-400">
                    Record partial or full payments. Balances update automatically.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-6 py-3">Student</th>
                        <th className="px-6 py-3">Class</th>
                        <th className="px-6 py-3 text-right">Billed</th>
                        <th className="px-6 py-3 text-right">Paid</th>
                        <th className="px-6 py-3 text-right">Pending</th>
                        <th className="px-6 py-3 text-right">Balance</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feeLedger.map((l) => (
                        <tr key={l.studentId} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-600">
                                {l.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-navy-800">{l.name}</p>
                                <p className="text-xs text-navy-400">{l.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-600">
                              {l.assignedClass || "Unassigned"}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-right font-medium text-navy-700">{naira(l.amount)}</td>
                          <td className="px-6 py-3.5 text-right font-semibold text-emerald-600">{naira(l.paid)}</td>
                          <td className="px-6 py-3.5 text-right">
                            {l.pending > 0 ? (
                              <span className="font-semibold text-amber-600">{naira(l.pending)}</span>
                            ) : (
                              <span className="text-navy-200">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <span className={`font-bold ${l.balance > 0 ? "text-amber-600" : "text-navy-300"}`}>
                              {naira(l.balance)}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                                l.feePaid
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                  : "bg-rose-50 text-rose-700 ring-rose-600/20"
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${l.feePaid ? "bg-emerald-500" : "bg-rose-500"}`} />
                              {l.feePaid ? "Paid" : l.balance > 0 ? "Outstanding" : "Unbilled"}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center justify-end gap-2">
                              {l.balance > 0 && (
                                <button
                                  onClick={() => {
                                    setReminderModal(l.studentId);
                                    setReminderResult(null);
                                  }}
                                  title={`Send a fee reminder to ${l.name}'s parent`}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3.5 py-2 text-xs font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-100"
                                >
                                  <BellRing className="h-3.5 w-3.5" />
                                  Remind
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setPayModal(l.studentId);
                                  setPayForm((f) => ({ ...f, amount: l.balance > 0 ? String(l.balance) : "" }));
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-brand-600/30 transition hover:bg-brand-500"
                              >
                                <Banknote className="h-3.5 w-3.5" />
                                Record payment
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {feeLedger.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-12 text-center text-navy-400">
                            No students found{feeDefaultersOnly ? " with outstanding balances" : ""}. Adjust your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Audit trail — who did what, and when (reconciliation) */}
              <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                    <History className="h-5 w-5 text-brand-600" />
                    Audit trail
                  </h2>
                  <p className="text-sm text-navy-400">
                    Every fee action — who did it, and when. Use this to reconcile payments, confirmations and receipts.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-6 py-3">When</th>
                        <th className="px-6 py-3">Action</th>
                        <th className="px-6 py-3">Who</th>
                        <th className="px-6 py-3">Student</th>
                        <th className="px-6 py-3">Receipt</th>
                        <th className="px-6 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((e) => (
                        <tr key={e.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                          <td className="whitespace-nowrap px-6 py-3.5 text-xs text-navy-500">
                            {new Date(e.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5">
                            <AuditBadge action={e.action} />
                          </td>
                          <td className="px-6 py-3.5">
                            <p className="font-semibold text-navy-800">{e.actorName}</p>
                            <p className="text-xs text-navy-400">
                              {e.actorRole === "PARENT"
                                ? "Parent portal"
                                : e.actorRole === "SUPER_ADMIN"
                                  ? "School admin"
                                  : e.actorRole === "BURSAR"
                                    ? "Bursar"
                                    : e.actorRole === "REGISTRAR"
                                      ? "Registrar"
                                      : e.actorRole || "System"}
                            </p>
                          </td>
                          <td className="px-6 py-3.5">
                            {e.studentName ? (
                              <>
                                <p className="font-medium text-navy-700">{e.studentName}</p>
                                {e.classArm && <p className="text-xs text-navy-400">{e.classArm}</p>}
                              </>
                            ) : (
                              <span className="text-navy-300">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            {e.receiptNo ? (
                              <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-bold text-navy-600">
                                {e.receiptNo}
                              </span>
                            ) : (
                              <span className="text-navy-300">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right font-bold text-navy-800">
                            {e.amount > 0 ? naira(e.amount) : "—"}
                          </td>
                        </tr>
                      ))}
                      {audit.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-navy-400">
                            No fee actions logged yet. Every payment you record or confirm — and every parent
                            payment or receipt download — will appear here.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>Automatic receipts.</strong> Every recorded payment gets a unique receipt number
                  (e.g. RCT-1001). Partial payments are supported — a student is marked <strong>Paid</strong> only
                  once their balance reaches zero.
                </p>
              </div>
            </div>
          )}

          {/* Report Cards */}
          {activeTab === "reports" && (
            <div className="mt-5 animate-fade-up">
              {/* Class filter + search row */}
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 py-2">
                  <FileText className="h-4 w-4 text-brand-600" />
                  <select
                    value={reportClass}
                    onChange={(e) => setReportClass(e.target.value)}
                    className="bg-transparent text-sm font-medium text-navy-700 outline-none"
                  >
                    <option value="">All class arms</option>
                    {(session.school?.activeArms || []).map((arm) => (
                      <option key={arm}>{arm}</option>
                    ))}
                  </select>
                </div>
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                  <input
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Search any student by name, email or class…"
                    className="w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                <TopStudents
                  students={reportStudents}
                  onView={(id) => openReport(id)}
                  title={"Best students" + (reportClass ? ` · ${reportClass}` : " · whole school")}
                />

                <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm lg:col-span-2">
                  <div className="border-b border-navy-100 px-6 py-4">
                    <h2 className="text-lg font-bold text-navy-800">All student report cards</h2>
                    <p className="text-sm text-navy-400">
                      Read any student&apos;s report card and export it as a branded A4 PDF.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                          <th className="px-6 py-3">Student</th>
                          <th className="px-6 py-3">Class</th>
                          <th className="px-6 py-3">Subjects</th>
                          <th className="px-6 py-3">Average</th>
                          <th className="px-6 py-3">Grade</th>
                          <th className="px-6 py-3">Standing</th>
                          <th className="px-6 py-3 text-right">Report</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReports.map((s) => (
                          <tr key={s.id} className="border-b border-navy-50 transition hover:bg-brand-50/30">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                                  {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-navy-800">{s.name}</p>
                                  <p className="text-xs text-navy-400">{s.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-600">
                                {s.assignedClass || "Unassigned"}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-navy-500">{s.subjects}</td>
                            <td className="px-6 py-3.5">
                              <span className="font-extrabold text-navy-800">{s.average}%</span>
                            </td>
                            <td className="px-6 py-3.5">
                              {s.grade ? (
                                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold ring-1 ${gradeBadgeClasses(s.grade)}`}>
                                  {s.grade}
                                </span>
                              ) : (
                                <span className="text-navy-300">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-xs font-semibold text-navy-500">{s.standing}</td>
                            <td className="px-6 py-3.5 text-right">
                              <button
                                onClick={() => openReport(s.id)}
                                disabled={reportLoading}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
                              >
                                {reportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                        {filteredReports.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-6 py-12 text-center text-navy-400">
                              No students found. Adjust your search or add students first.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <Trophy className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>Best students are auto-ranked</strong> by overall average every time this page loads.
                  Use the search box to look up a student by name, email or class arm, then open or print their report card.
                </p>
              </div>
            </div>
          )}

          {/* Students */}
          {activeTab === "students" && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
              <div className="border-b border-navy-100 px-6 py-4">
                <h2 className="text-lg font-bold text-navy-800">Students, fees & parents</h2>
                <p className="text-sm text-navy-400">
                  Toggle fee status, or link a parent/guardian so they can view report cards, attendance and pay fees online.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                      <th className="px-6 py-3">Student</th>
                      <th className="px-6 py-3">Email</th>
                      <th className="px-6 py-3">Class Arm</th>
                      <th className="px-6 py-3">Fee Status</th>
                      <th className="px-6 py-3">Parent / Guardian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s) => (
                      <tr key={s.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-600">
                              {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-semibold text-navy-800">{s.name}</span>
                            <button
                              onClick={() => openReset(s)}
                              title={`Reset ${s.name}'s password`}
                              className="ml-1 rounded-lg p-1.5 text-navy-300 transition hover:bg-emerald-50 hover:text-emerald-600"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-navy-500">{s.email}</td>
                        <td className="px-6 py-4">
                          <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-600">
                            {s.assignedClass || "Unassigned"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {isSuper ? (
                            <button onClick={() => toggleFee(s.id, s.feePaid)} title="Click to toggle fee status">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                                  s.feePaid
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                    : "bg-rose-50 text-rose-700 ring-rose-600/20"
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${s.feePaid ? "bg-emerald-500" : "bg-rose-500"}`} />
                                {s.feePaid ? "Paid" : "Unpaid"}
                              </span>
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                                s.feePaid
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                  : "bg-rose-50 text-rose-700 ring-rose-600/20"
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${s.feePaid ? "bg-emerald-500" : "bg-rose-500"}`} />
                              {s.feePaid ? "Paid" : "Unpaid"}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {s.parentId ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-brand-600/20">
                                <HeartHandshake className="h-3 w-3" />
                                {parentNameById[s.parentId] || "Linked"}
                              </span>
                              <button
                                onClick={() => unlinkParent(s.id)}
                                className="text-xs font-semibold text-navy-400 transition hover:text-rose-600"
                                title="Unlink parent"
                              >
                                Unlink
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setLinkModal(s.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-600 transition hover:border-brand-300 hover:text-brand-600"
                            >
                              <HeartHandshake className="h-3 w-3" />
                              Link parent
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-navy-400">
                          No students found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

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
        onClose={() => setLinkModal(null)}
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
                    <span className="block truncate text-xs text-navy-400">{p.email}</span>
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
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">Email</span>
                <input
                  type="email"
                  value={linkForm.email}
                  onChange={(e) => setLinkForm({ ...linkForm, email: e.target.value })}
                  placeholder="parent@example.com"
                  className={inputCls}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-navy-700">Temporary password</span>
                  <input
                    type="text"
                    value={linkForm.password}
                    onChange={(e) => setLinkForm({ ...linkForm, password: e.target.value })}
                    placeholder="At least 6 characters"
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-navy-700">Phone (optional)</span>
                  <input
                    value={linkForm.phone}
                    onChange={(e) => setLinkForm({ ...linkForm, phone: e.target.value })}
                    placeholder="e.g. 0803 123 4567"
                    className={inputCls}
                  />
                </label>
              </div>
            </div>
          )}

          <button
            onClick={() => linkParent(filteredStudents.find((s) => s.id === linkModal)?.id)}
            disabled={linkSaving || (linkForm.mode === "select" && !linkForm.parentId)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
          >
            {linkSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <HeartHandshake className="h-5 w-5" />}
            {linkForm.mode === "create" ? "Create parent & link" : "Link parent"}
          </button>
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
                  <strong>{feeTotals?.defaulters ?? 0} student{(feeTotals?.defaulters ?? 0) === 1 ? "" : "s"}</strong>{" "}
                  with an outstanding balance. Students without a linked parent are reminded directly.
                </>
              ) : (
                <>
                  Send a fee reminder to the parent of{" "}
                  <strong>{feeLedger.find((l) => l.studentId === reminderModal)?.name}</strong>{" "}
                  ({naira(feeLedger.find((l) => l.studentId === reminderModal)?.balance)} outstanding).
                </>
              )}
            </p>
            <p className="rounded-xl bg-violet-50 px-4 py-3 text-xs text-violet-700 ring-1 ring-violet-600/20">
              <BellRing className="mr-1 inline h-3.5 w-3.5" />
              The parent sees the reminder on their portal — students without a parent get it
              directly on their dashboard. Every send is recorded in the audit trail.
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
          else setModal(null);
        }}
        title={
          createdUserDisplay
            ? "Student login details"
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
          {modal === "student" ? (
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
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Add {modal === "teacher" ? "teacher" : modal === "staff" ? "staff account" : "student"}
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

      {/* Rename arm — a migration, so every reference moves with it */}
      <Modal
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title={renameTarget ? `Rename ${renameTarget}` : ""}
      >
        {renameTarget !== null && (
          <div className="space-y-4">
            <p className="text-sm text-navy-500">
              Renaming re-points <span className="font-semibold text-navy-800">{renameTarget}</span> everywhere:
              students, teacher scopes, fees, scores, attendance and timetable entries all move to the new
              name in one go. A collision with an existing arm is rejected.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">New name</span>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
                placeholder="e.g. JSS1 Blue"
                autoFocus
                className="w-full rounded-xl border border-navy-200 px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setRenameTarget(null)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-navy-200 px-4 py-2.5 text-sm font-semibold text-navy-600 transition hover:bg-navy-50"
              >
                Cancel
              </button>
              <button
                onClick={saveRename}
                disabled={renameSaving || !renameValue.trim() || renameValue.trim() === renameTarget}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
              >
                {renameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Rename
              </button>
            </div>
          </div>
        )}
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}
