"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import { can, STAFF_ROLES } from "@/lib/permissions";
import { bounceToLogin } from "@/lib/auth-client";
import { warn } from "@/lib/log";

/**
 * Shared admin layout shell — sidebar + topbar + session auth.
 * Each page just renders its content inside <AdminShell>.
 *
 * Usage:
 *   <AdminShell activeTab={tab} onTabChange={setTab}>
 *     {/* page content *\/}
 *   </AdminShell>
 */
export default function AdminShell({ children, activeTab: controlledTab, onTabChange }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Internal tab state for pages that don't control it (import, quick-add, etc.)
  const [internalTab, setInternalTab] = useState("overview");
  const activeTab = controlledTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meData.user || !STAFF_ROLES.includes(meData.user.role)) {
        bounceToLogin(router);
        return;
      }
      setSession(meData);
      setLoading(false);
    })();
  }, [router]);

  // Respond to sidebar hash links
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      const HASH_TABS = [
        "classes", "teachers", "roles", "logins", "students", "fees",
        "reports", "timetable", "archives", "settings", "scheme", "risk",
        "performance", "alumni", "engagement", "branches", "compliance",
      ];
      if (HASH_TABS.includes(hash)) setTab(hash);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [setTab]);

  if (loading) return <DashboardSkeleton />;

  const myRole = session.user?.role;
  const isSuper = can(myRole, "users.manage");
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

        {/* School status banners */}
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
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500"
              >
                <RefreshCw className="h-3.5 w-3.5" />{" "}
                {session.school?.status === "frozen" ? "Reactivate school" : "Restore school"}
              </button>
            </div>
          </div>
        )}

        {/* Page content */}
        <div className="mx-auto max-w-7xl px-5 py-8">
          {typeof children === "function"
            ? children({ session, setSession, myRole, isSuper, setTab })
            : children}
        </div>
      </div>
    </main>
  );
}
