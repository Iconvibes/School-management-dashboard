"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle } from "lucide-react";
import { ROLE_HOME } from "@/lib/portal-guard";

/**
 * One-click "Explore the live demo" button.
 * Signs into the seeded demo school (demo mode only) and drops the user
 * straight into the Super Admin dashboard — no form, no password typing.
 * Hidden gracefully when the demo school isn't seeded or on error.
 */
export default function DemoLoginButton({ className = "" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [available, setAvailable] = useState(false);

  // The demo school is an explicit opt-in (SEED_DEMO_SCHOOL=1 in demo mode).
  // Ask the server rather than guessing from NODE_ENV, and default to hidden
  // so a clean-slate deployment never flashes the button.
  useEffect(() => {
    fetch("/api/auth/demo-status")
      .then((r) => r.json())
      .then((d) => setAvailable(!!d.enabled))
      .catch(() => {});
  }, []);

  if (!available || failed) return null;

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Demo unavailable");
      router.push(data.redirect || ROLE_HOME.SUPER_ADMIN);
    } catch {
      setFailed(true);
      setLoading(false);
    }
  }

  if (failed) return null;

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-300 backdrop-blur transition hover:bg-emerald-500/20 ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
      {loading ? "Opening demo…" : "Explore the live demo"}
    </button>
  );
}
