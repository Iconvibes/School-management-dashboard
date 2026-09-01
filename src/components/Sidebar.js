"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  BookOpen,
  LogOut,
  X,
  Users,
  FileText,
  Wallet,
  CalendarCheck,
  CalendarDays,
  HeartHandshake,
  Upload,
  UserPlus,
  ShieldCheck,
  Layers,
  History,
  AlertTriangle,
  TrendingUp,
  GraduationCap,
  Building2,
  CreditCard,
} from "lucide-react";
import Logo from "@/components/Logo";
import NotificationsBell from "@/components/NotificationsBell";
import { can } from "@/lib/permissions";

export default function Sidebar({ role, open, onClose, activeTab, activePath }) {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = activePath || pathname || "";

  // The admin-console navigation is permission-driven — ROLE_PERMISSIONS is
  // the single source of truth, so the menu can never drift from what the
  // API enforces. The teacher/parent/student portals are role HOMES, not
  // permission-gated actions, so they keep their own fixed lists.
  const items =
    role === "TEACHER"
      ? [
          { href: "/teacher/dashboard", label: "Grading Matrix", icon: ClipboardList },
          { href: "/teacher/dashboard#attendance", label: "Attendance", icon: CalendarCheck },
          { href: "/teacher/dashboard#timetable", label: "My Timetable", icon: CalendarDays },
          { href: "/teacher/dashboard#reports", label: "Report Cards", icon: FileText },
          { href: "/teacher/dashboard#scheme", label: "Scheme of Work", icon: BookOpen },
          { href: "/teacher/dashboard#resources", label: "Class Resources", icon: FileText },
        ]
      : role === "PARENT"
      ? [
          { href: "/parent/dashboard", label: "My Children", icon: HeartHandshake },
        ]
      : role === "STUDENT"
      ? [
          { href: "/student/dashboard", label: "My Report", icon: BookOpen },
          { href: "/student/dashboard#scheme", label: "Schemes of Work", icon: BookOpen },
          { href: "/student/dashboard#timetable", label: "My Timetable", icon: CalendarDays },
          { href: "/student/dashboard#resources", label: "Class Resources", icon: FileText },
        ]
      : [
          // ---- Daily essentials ----
          ...(can(role, "stats.view")
            ? [{ href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard }]
            : []),
          ...(can(role, "students.manage")
            ? [{ href: "/admin/dashboard#students", label: "Students & Fees", icon: BookOpen }]
            : []),
          ...(can(role, "fees.view")
            ? [{ href: "/admin/dashboard#fees", label: "Fee Management", icon: Wallet }]
            : []),
          ...(can(role, "users.manage")
            ? [{ href: "/admin/dashboard#teachers", label: "Teachers & Payroll", icon: Users }]
            : []),
          ...(can(role, "timetable.manage")
            ? [{ href: "/admin/dashboard#timetable", label: "Timetable", icon: CalendarDays }]
            : []),
          ...(can(role, "reports.view")
            ? [{ href: "/admin/dashboard#reports", label: "Report Cards", icon: ClipboardList }]
            : []),
          // ---- Structure & setup ----
          ...(can(role, "school.edit")
            ? [{ href: "/admin/dashboard#classes", label: "Classes & Arms", icon: Layers }]
            : []),
          ...(can(role, "roles.manage")
            ? [{ href: "/admin/dashboard#roles", label: "Roles & Access", icon: ShieldCheck }]
            : []),
          // ---- Onboarding tools ----
          ...(can(role, "students.manage")
            ? [
                { href: "/admin/import", label: "Bulk Import", icon: Upload },
                { href: "/admin/quick-add", label: "Quick Add", icon: UserPlus },
                { href: "/admin/placeholders", label: "From Class Sizes", icon: ClipboardList },
              ]
            : []),
          // ---- Periodic & analytics ----
          ...(can(role, "reports.view")
            ? [{ href: "/admin/dashboard#archives", label: "Previous Terms", icon: History }]
            : []),
          ...(can(role, "school.edit")
            ? [
                { href: "/admin/dashboard#scheme", label: "Scheme of Work", icon: BookOpen },
                { href: "/admin/dashboard#performance", label: "Teacher Performance", icon: TrendingUp },
                { href: "/admin/dashboard#risk", label: "Risk Alerts", icon: AlertTriangle },
              ]
            : []),
          // ---- Low frequency ----
          ...(can(role, "school.edit")
            ? [
                { href: "/admin/dashboard#engagement", label: "Parent Engagement", icon: HeartHandshake },
                { href: "/admin/dashboard#alumni", label: "Alumni", icon: GraduationCap },
                { href: "/admin/dashboard#branches", label: "Branches", icon: Building2 },
              ]
            : []),
          // ---- Billing ----
          ...(can(role, "school.edit")
            ? [{ href: "/admin/dashboard#billing", label: "Billing", icon: CreditCard }]
            : []),
        ];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-navy-900 text-navy-100 transition-transform duration-300 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <Logo light />
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-navy-300 hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-navy-400">
            Menu
          </p>
          {items.map((item) => {
              const itemHash = item.href.split("#")[1] || "";
              const itemBasePath = item.href.split("#")[0];
              // Hash-based match for dashboard tabs, pathname match for standalone pages
              const isActive = itemHash
                ? activeTab === itemHash
                : itemBasePath === "/admin/dashboard"
                  ? (activeTab === "overview" || !activeTab)
                  : itemBasePath === currentPath;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={(e) => {
                    if (itemHash) {
                      e.preventDefault();
                      window.location.hash = itemHash;
                      window.dispatchEvent(new Event("hashchange"));
                    } else if (itemBasePath === "/admin/dashboard") {
                      // Overview link — clear the hash so applyHash resets to overview tab
                      e.preventDefault();
                      window.location.hash = "";
                      history.replaceState(null, "", "/admin/dashboard");
                      window.dispatchEvent(new Event("hashchange"));
                    }
                    onClose();
                  }}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-600/20 text-white shadow-sm shadow-brand-600/10"
                      : "text-navy-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <item.icon className={`h-4.5 w-4.5 ${isActive ? "text-brand-400" : "text-navy-300 group-hover:text-navy-200"}`} />
                  {item.label}
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400 shadow-sm shadow-brand-400/50" />
                  )}
                </Link>
              );
            })}
        </nav>

        <div className="space-y-1 border-t border-white/10 p-3">
          {role === "SUPER_ADMIN" && <NotificationsBell />}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-navy-200 transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-4.5 w-4.5" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
