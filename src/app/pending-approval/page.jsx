"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Mail,
  ShieldCheck,
  LogOut,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import Logo from "@/components/Logo";

/**
 * Pending Approval page — shown to school admins after registration
 * while waiting for platform admin verification.
 */
export default function PendingApprovalPage() {
  const router = useRouter();
  const [school, setSchool] = useState(null);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  useEffect(() => {
    // Check if user is logged in and get school info
    async function checkSession() {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (!data.user) {
          router.push("/login");
          return;
        }
        setSchool(data.school);
      } catch {
        router.push("/login");
      }
    }
    checkSession();
  }, [router]);

  // Periodically check if school has been approved (every 30 seconds)
  useEffect(() => {
    if (!school) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.school?.status === "active") {
          // Approved! Redirect to dashboard
          window.location.href = "/admin/dashboard";
        }
      } catch {
        // Ignore errors during polling
      }
      setLastChecked(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, [school]);

  async function handleRefresh() {
    setChecking(true);
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.school?.status === "active") {
        window.location.href = "/admin/dashboard";
      }
    } catch {
      // ignore
    }
    setLastChecked(new Date());
    setChecking(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-navy-50 via-white to-brand-50/30 px-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-navy-100 bg-white p-8 shadow-xl shadow-navy-100/20 sm:p-10">
          {/* Animated clock icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-50">
            <div className="relative">
              <Clock className="h-10 w-10 text-amber-500" />
              <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
            </div>
          </div>

          <h1 className="text-center text-2xl font-extrabold text-navy-800">
            Registration Under Review
          </h1>

          <p className="mt-3 text-center text-sm text-navy-500 leading-relaxed">
            Thank you for registering
            {school?.name ? (
              <>
                {" "}
                <strong className="text-navy-700">{school.name}</strong>
              </>
            ) : (
              " your school"
            )}
            . Your account is being reviewed by our platform team before you
            can start using EduTrack.
          </p>

          {/* Status steps */}
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">
                  Account created
                </p>
                <p className="text-xs text-emerald-600">
                  Your school registration has been submitted
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4">
              <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Verification in progress
                </p>
                <p className="text-xs text-amber-600">
                  Our team is reviewing your school details
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-navy-50 p-4 opacity-50">
              <ShieldCheck className="h-5 w-5 shrink-0 text-navy-400" />
              <div>
                <p className="text-sm font-semibold text-navy-600">
                  Dashboard access
                </p>
                <p className="text-xs text-navy-400">
                  You&apos;ll receive access once approved
                </p>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <div>
                <p className="text-xs font-medium text-blue-800">
                  What happens next?
                </p>
                <p className="mt-1 text-xs text-blue-600 leading-relaxed">
                  Our platform team will verify your school details. This
                  typically takes less than 24 hours. You&apos;ll receive an
                  email notification once your account is approved.
                </p>
              </div>
            </div>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={checking}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${checking ? "animate-spin" : ""}`}
            />
            {checking ? "Checking…" : "Check for approval"}
          </button>

          {lastChecked && (
            <p className="mt-2 text-center text-[11px] text-navy-400">
              Last checked: {lastChecked.toLocaleTimeString()} · Auto-checks
              every 30s
            </p>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-navy-200 py-2.5 text-sm font-medium text-navy-500 transition hover:bg-navy-50 hover:text-navy-700"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-navy-400">
          Questions? Contact{" "}
          <a
            href="mailto:support@edutrack.app"
            className="font-medium text-brand-600 hover:underline"
          >
            support@edutrack.app
          </a>
        </p>
      </div>
    </div>
  );
}
