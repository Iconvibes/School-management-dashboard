"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Users, X, ArrowRight } from "lucide-react";

/**
 * StudentLimitBanner — Shows at the top of the admin dashboard when the school
 * is at or over their plan's student limit. Includes usage bar and upgrade CTA.
 *
 * Hidden when: plan is enterprise, or no students enrolled, or dismissed.
 */
export default function StudentLimitBanner() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [subRes, statsRes] = await Promise.all([
          fetch("/api/billing/subscription"),
          fetch("/api/stats"),
        ]);
        if (!cancelled && subRes.ok && statsRes.ok) {
          const sub = await subRes.json();
          const stats = await statsRes.json();
          const plan = sub.billingPlan || "trial";
          const studentCount = stats.totalStudents || 0;

          // Enterprise has unlimited — no banner needed
          if (plan === "enterprise") {
            setLoading(false);
            return;
          }

          // Map plan to max students (must match SAAS_PLANS in paystack.js)
          const limits = { trial: 200, starter: 200, standard: 500 };
          const max = limits[plan] || 200;
          const pct = Math.round((studentCount / max) * 100);
          const overLimit = studentCount > max;
          const nearLimit = pct >= 80 && !overLimit;

          if (overLimit || nearLimit) {
            if (!cancelled) setData({ plan, studentCount, max, pct, overLimit });
          }
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading || !data || dismissed) return null;

  const { plan, studentCount, max, pct, overLimit } = data;

  return (
    <div
      className={`rounded-xl border p-4 ${
        overLimit
          ? "border-red-500/30 bg-red-500/10"
          : "border-amber-500/30 bg-amber-500/10"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              overLimit ? "bg-red-500/20" : "bg-amber-500/20"
            }`}
          >
            <Users
              className={`h-4.5 w-4.5 ${
                overLimit ? "text-red-400" : "text-amber-400"
              }`}
            />
          </div>
          <div>
            <p
              className={`text-sm font-semibold ${
                overLimit ? "text-red-200" : "text-amber-200"
              }`}
            >
              {overLimit
                ? `Student limit exceeded (${studentCount}/${max})`
                : `Approaching student limit (${studentCount}/${max})`}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {overLimit
                ? `Your ${plan === "trial" ? "Trial" : plan.charAt(0).toUpperCase() + plan.slice(1)} plan allows up to ${max} students. Upgrade to Standard for 500 students.`
                : `${max - studentCount} student slot${max - studentCount !== 1 ? "s" : ""} remaining. Upgrade to get more capacity.`}
            </p>

            {/* Usage bar */}
            <div className="mt-2.5 flex items-center gap-3">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all ${
                    overLimit ? "bg-red-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span
                className={`text-[10px] font-bold ${
                  overLimit ? "text-red-400" : "text-amber-400"
                }`}
              >
                {pct}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/admin/dashboard#billing")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              overLimit
                ? "bg-red-500 text-white hover:bg-red-400"
                : "bg-amber-500 text-black hover:bg-amber-400"
            }`}
          >
            Upgrade Plan
            <ArrowRight className="h-3 w-3" />
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg p-1.5 text-gray-500 hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
