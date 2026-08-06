"use client";

import { useCallback, useEffect, useState } from "react";
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
  KeyRound,
  Copy,
  Check,
  BellRing,
  Send,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import MetricCard from "@/components/MetricCard";
import Modal from "@/components/Modal";
import Logo from "@/components/Logo";
import TopStudents from "@/components/TopStudents";
import ReportCardModal from "@/components/ReportCardModal";
import { gradeBadgeClasses } from "@/lib/grading";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

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

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  // Respond to sidebar hash links: /admin/dashboard#teachers etc.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (["teachers", "students", "fees", "reports"].includes(hash)) setTab(hash);
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
      if (!meData.user || !["SUPER_ADMIN", "BURSAR", "REGISTRAR"].includes(meData.user.role)) {
        router.replace("/login");
        return;
      }
      setSession(meData);

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
      setModal(null);
      setForm({ name: "", email: "", password: "", assignedClass: "", staffRole: "BURSAR" });
      showToast(`${roleEnum === "TEACHER" ? "Teacher" : roleEnum === "BURSAR" ? "Bursar" : roleEnum === "REGISTRAR" ? "Registrar" : "Student"} added successfully`);
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

  async function copyNewPassword() {
    if (!resetDone) return;
    try {
      await navigator.clipboard.writeText(resetDone.newPassword);
      setResetCopied(true);
      setTimeout(() => setResetCopied(false), 1500);
    } catch {}
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

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-navy-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </main>
    );
  }

  // Role gates for the shared admin console (mirrors ROLE_PERMISSIONS in
  // src/lib/policy.js — the API enforces these too, the UI just hides what a
  // role can't do).
  const myRole = session.user?.role;
  const isSuper = myRole === "SUPER_ADMIN";
  const canFees = ["SUPER_ADMIN", "BURSAR"].includes(myRole);
  const canRoster = ["SUPER_ADMIN", "REGISTRAR"].includes(myRole);
  const canReports = ["SUPER_ADMIN", "REGISTRAR"].includes(myRole);
  const ROLE_LABEL = {
    SUPER_ADMIN: "Super Admin",
    BURSAR: "Bursar",
    REGISTRAR: "Registrar",
  };

  // Tabs each staff role may open (fees stay with admin+bursar; roster and
  // report cards with admin+registrar; payroll is admin-only).
  const visibleTabs = [
    { key: "overview", label: "Overview" },
    ...(isSuper ? [{ key: "teachers", label: "Teachers & Payroll" }] : []),
    ...(canRoster ? [{ key: "students", label: "Students & Fees" }] : []),
    ...(canFees ? [{ key: "fees", label: "Fee Management" }] : []),
    ...(canReports ? [{ key: "reports", label: "Report Cards" }] : []),
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                      <th className="px-6 py-3">Class Arm</th>
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
                          </div>
                        </td>
                        <td className="px-6 py-4 text-navy-500">{t.email}</td>
                        <td className="px-6 py-4">
                          <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-600">
                            {t.assignedClass || "Unassigned"}
                          </span>
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
        onClose={() => setModal(null)}
        title={
          modal === "teacher"
            ? "Add teacher"
            : modal === "staff"
              ? "Add staff account"
              : "Add student"
        }
      >
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}
