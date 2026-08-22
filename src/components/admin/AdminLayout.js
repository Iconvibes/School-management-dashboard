"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, ShieldCheck, ArrowLeft } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import { can, STAFF_ROLES } from "@/lib/permissions";
import { bounceToLogin } from "@/lib/auth-client";
import { warn } from "@/lib/log";

/**
 * Wraps standalone admin pages (import, quick-add, placeholders) with the same
 * sidebar + topbar the dashboard uses, so the nav never disappears.
 *
 *   <AdminLayout activeTab="bulk-import">
 *     {/* page content *\/}
 *   </AdminLayout>
 */
export default function AdminLayout({ children, activeTab }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user || !STAFF_ROLES.includes(d.user.role)) {
          bounceToLogin(router);
          return;
        }
        setSession(d);
        setLoading(false);
      })
      .catch((e) => {
        warn("session", "load failed:", e?.message);
        window.location.href = "/login";
      });
  }, [router]);

  if (loading) return <DashboardSkeleton />;

  const myRole = session.user?.role;
  const ROLE_LABEL = { SUPER_ADMIN: "Super Admin", BURSAR: "Bursar", REGISTRAR: "Registrar" };

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      <Sidebar
        role={myRole}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={activeTab}
      />

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
            <Link
              href="/admin/dashboard"
              className="group flex min-w-0 items-center gap-3 text-left"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 truncate text-sm font-bold text-navy-800 transition group-hover:text-brand-600">
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                  {session.school?.name}
                </span>
                <span className="truncate text-xs text-navy-400">
                  {session.school?.currentSession} · {session.school?.currentTerm}
                </span>
              </span>
            </Link>
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

        <div className="mx-auto max-w-5xl px-5 py-8">
          {children}
        </div>
      </div>
    </main>
  );
}
