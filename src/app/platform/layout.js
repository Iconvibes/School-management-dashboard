"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/hooks/useSession";
import "./platform.css";
import {
  LayoutDashboard,
  Building2,
  DollarSign,
  LogOut,
  Activity,
  Shield,
  ChevronLeft,
  Zap,
  Users,
  CreditCard,
  Bell,
  ScrollText,
  Settings,
  GitCompareArrows,
} from "lucide-react";

/**
 * Platform Admin layout — completely unique dark control-center design.
 * Solid sidebar with gradient accents, nothing like the school dashboards.
 */
export default function PlatformLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { meData: session, loading } = useSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [quickStats, setQuickStats] = useState({ tenants: 0, users: 0 });

  useEffect(() => {
    if (loading) return;
    if (!session?.user || session.user.role !== "PLATFORM_ADMIN") {
      router.push("/platform/login");
      return;
    }
  }, [session, loading, router]);

  // Fetch unread alert count
  useEffect(() => {
    if (!session?.user) return;
    async function fetchCount() {
      try {
        const res = await fetch("/api/platform/alerts?unread=true&limit=1");
        if (res.ok) {
          const data = await res.json();
          setUnreadAlerts(data.unreadCount || 0);
        }
      } catch {}
    }
    fetchCount();
    // Poll every 60s
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [session]);

  // Fetch quick stats for sidebar
  useEffect(() => {
    if (!session?.user) return;
    async function fetchStats() {
      try {
        const res = await fetch("/api/platform/overview");
        if (res.ok) {
          const data = await res.json();
          setQuickStats({
            tenants: data.totalSchools || 0,
            users: (data.totalStudents || 0) + (data.totalTeachers || 0) + (data.totalParents || 0),
          });
        }
      } catch {}
    }
    fetchStats();
  }, [session]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  const navItems = [
    { href: "/platform/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/platform/schools", label: "Tenants", icon: Building2 },
    { href: "/platform/billing", label: "Billing", icon: CreditCard },
    { href: "/platform/revenue", label: "Revenue", icon: DollarSign },
    { href: "/platform/alerts", label: "Alerts", icon: Bell, badge: unreadAlerts },
    { href: "/platform/audit", label: "Audit Log", icon: ScrollText },
    { href: "/platform/compare", label: "Compare", icon: GitCompareArrows },
    { href: "/platform/health", label: "Health Monitor", icon: Activity },
    { href: "/platform/settings", label: "Settings", icon: Settings },
  ];

  const isActive = (href) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-gray-100">
      {/* Sidebar — solid dark panel with gradient accents */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? "w-[72px]" : "w-[260px]"
        }`}
        style={{
          background: "linear-gradient(180deg, #111827 0%, #0c1222 50%, #080d19 100%)",
          borderRight: "1px solid rgba(34, 211, 238, 0.08)",
          boxShadow: "4px 0 24px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Logo Section */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/20">
            <Shield className="h-5 w-5 text-white" />
            <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#111827] bg-emerald-400" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-sm font-extrabold tracking-wide text-white">
                Edu<span className="text-cyan-400">Track</span>
              </p>
              <p className="text-[10px] font-semibold tracking-widest text-cyan-500/70 uppercase">
                Platform Control
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 pt-6 pb-4">
          {!sidebarCollapsed && (
            <p className="mb-3 px-3 text-[10px] font-bold tracking-widest text-gray-600 uppercase">
              Navigation
            </p>
          )}
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-all duration-200 ${
                  active
                    ? "bg-cyan-500/15 text-cyan-300 shadow-inner"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-400 shadow-lg shadow-cyan-500/30" />
                )}
                <item.icon
                  className={`h-[18px] w-[18px] ${
                    active ? "text-cyan-400" : "text-gray-500 group-hover:text-gray-300"
                  }`}
                />
                {!sidebarCollapsed && <span>{item.label}</span>}
                {!sidebarCollapsed && item.badge > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Quick Stats */}
        {!sidebarCollapsed && (
          <div className="mx-3 mb-4 rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                Quick Stats
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3 w-3 text-cyan-500" />
                  <span className="text-xs text-gray-400">Tenants</span>
                </div>
                <span className="text-xs font-bold text-white">{quickStats.tenants}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-3 w-3 text-blue-500" />
                  <span className="text-xs text-gray-400">Users</span>
                </div>
                <span className="text-xs font-bold text-white">{quickStats.users}</span>
              </div>
            </div>
          </div>
        )}

        {/* System Status + Logout */}
        <div
          className="px-3 pb-4 pt-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {!sidebarCollapsed && (
            <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-3.5 py-2.5">
              <div className="relative">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                <div className="absolute -left-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-emerald-400">System Online</p>
                <p className="text-[9px] text-emerald-500/50">All services operational</p>
              </div>
            </div>
          )}
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/platform/login");
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-gray-500 transition-all hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            {!sidebarCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`platform-main${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        {/* Top Bar */}
        <header
          className="sticky top-0 z-40 flex h-16 items-center justify-between px-6"
          style={{
            background: "linear-gradient(90deg, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.9) 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-white"
            >
              <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="h-6 w-px bg-white/10" />
            <span className="text-xs font-medium text-gray-500">
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Alert Bell */}
            <Link href="/platform/alerts" className="relative rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-white">
              <Bell className="h-5 w-5" />
              {unreadAlerts > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unreadAlerts > 99 ? "99+" : unreadAlerts}
                </span>
              )}
            </Link>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3.5 py-1.5 ring-1 ring-emerald-500/20">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-400">LIVE</span>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-[10px] font-extrabold text-white shadow-lg shadow-cyan-500/20">
                PA
              </div>
              <div>
                <p className="text-xs font-bold text-gray-200">Platform Admin</p>
                <p className="text-[10px] text-gray-600">Full access</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
