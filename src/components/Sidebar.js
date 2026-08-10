"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import Logo from "@/components/Logo";
import NotificationsBell from "@/components/NotificationsBell";
import { can } from "@/lib/permissions";

export default function Sidebar({ role, open, onClose }) {
  const router = useRouter();

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
        ]
      : role === "PARENT"
      ? [{ href: "/parent/dashboard", label: "My Children", icon: HeartHandshake }]
      : role === "STUDENT"
      ? [
          { href: "/student/dashboard", label: "My Report", icon: BookOpen },
          { href: "/student/dashboard#timetable", label: "My Timetable", icon: CalendarDays },
        ]
      : [
          ...(can(role, "stats.view")
            ? [{ href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard }]
            : []),
          ...(can(role, "students.manage")
            ? [
                { href: "/admin/import", label: "Bulk Import", icon: Upload },
                { href: "/admin/quick-add", label: "Quick Add", icon: UserPlus },
                { href: "/admin/placeholders", label: "From Class Sizes", icon: ClipboardList },
              ]
            : []),
          ...(can(role, "school.edit")
            ? [{ href: "/admin/dashboard#classes", label: "Classes & Arms", icon: Layers }]
            : []),
          ...(can(role, "users.manage")
            ? [{ href: "/admin/dashboard#teachers", label: "Teachers & Payroll", icon: Users }]
            : []),
          ...(can(role, "roles.manage")
            ? [{ href: "/admin/dashboard#roles", label: "Roles & Access", icon: ShieldCheck }]
            : []),
          ...(can(role, "timetable.manage")
            ? [{ href: "/admin/dashboard#timetable", label: "Timetable", icon: CalendarDays }]
            : []),
          ...(can(role, "students.manage")
            ? [{ href: "/admin/dashboard#students", label: "Students & Fees", icon: BookOpen }]
            : []),
          ...(can(role, "fees.view")
            ? [{ href: "/admin/dashboard#fees", label: "Fee Management", icon: Wallet }]
            : []),
          ...(can(role, "reports.view")
            ? [{ href: "/admin/dashboard#reports", label: "Report Cards", icon: ClipboardList }]
            : []),
          ...(can(role, "reports.view")
            ? [{ href: "/admin/dashboard#archives", label: "Previous Terms", icon: History }]
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
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-navy-200 transition hover:bg-white/10 hover:text-white"
            >
              <item.icon className="h-4.5 w-4.5 text-navy-300" />
              {item.label}
            </Link>
          ))}
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
