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
  HeartHandshake,
  UserPlus,
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
      if (!meData.user || meData.user.role !== "SUPER_ADMIN") {
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
      // The modal value is lowercase ("teacher" | "student") but the API
      // requires the uppercase role enum — normalize before sending.
      const roleEnum = String(role || "").toUpperCase();
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
      setForm({ name: "", email: "", password: "", assignedClass: "" });
      showToast(`${roleEnum === "TEACHER" ? "Teacher" : "Student"} added successfully`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setSaving(false);
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

  const maxArm = Math.max(1, ...Object.values(stats.classDistribution || {}));

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar role="SUPER_ADMIN" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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
              <ShieldCheck className="h-3.5 w-3.5" /> Super Admin
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

          {/* Pending payment notification — a parent paid and is awaiting confirmation */}
          {stats.pendingPayments?.count > 0 && (
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
              {[
                { key: "overview", label: "Overview" },
                { key: "teachers", label: "Teachers & Payroll" },
                { key: "students", label: "Students & Fees" },
                { key: "fees", label: "Fee Management" },
                { key: "reports", label: "Report Cards" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key);
                    history.replaceState(null, "", t.key === "overview" ? "/admin/dashboard" : `/admin/dashboard#${t.key}`);
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    tab === t.key ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
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
              <button
                onClick={() => setModal("teacher")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700"
              >
                <Plus className="h-4 w-4" /> Teacher
              </button>
              <button
                onClick={() => setModal("student")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
              >
                <Plus className="h-4 w-4" /> Student
              </button>
            </div>
          </div>

          {/* Overview */}
          {tab === "overview" && (
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
                    { label: "Manage teachers & payroll", action: () => setTab("teachers") },
                    { label: "Manage students & fees", action: () => setTab("students") },
                    { label: "Add a teacher", action: () => setModal("teacher") },
                    { label: "Add a student", action: () => setModal("student") },
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
          {tab === "teachers" && (
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
          {tab === "fees" && (
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
                              <button
                                onClick={() => confirmPayment(p.id)}
                                disabled={confirmingId === p.id}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:opacity-60"
                              >
                                {confirmingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Confirm
                              </button>
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
                                onChange={(e) => setFeeDraft((d) => ({ ...d, [arm]: e.target.value }))}
                                placeholder="e.g. 185000"
                                className="w-40 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <button
                              onClick={() => saveFeeStructure(arm)}
                              disabled={feeSaving}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
                            >
                              {feeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                              Save
                            </button>
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
                          <td className="px-6 py-3.5 text-right">
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
          {tab === "reports" && (
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
          {tab === "students" && (
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
                          </div>
                        </td>
                        <td className="px-6 py-4 text-navy-500">{s.email}</td>
                        <td className="px-6 py-4">
                          <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-600">
                            {s.assignedClass || "Unassigned"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
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

      {/* Add user modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "teacher" ? "Add teacher" : "Add student"}
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
          <button
            onClick={() => createUser(modal)}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Add {modal === "teacher" ? "teacher" : "student"}
          </button>
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
