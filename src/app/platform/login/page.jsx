"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, Shield, ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";

/**
 * Platform Admin login — completely separate from the school login flow.
 * Schools never see this; it's only for the SaaS owner/operator.
 */
export default function PlatformLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/platform/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.push("/platform/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 bg-navy-950">
      {/* Left panel — branding */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-navy-900 p-12 lg:flex">
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-brand-600/20 blur-[120px]" />
        <Logo light />
        <div className="relative">
          <h2 className="text-3xl font-extrabold leading-tight text-white">
            Platform Control
            <br />
            Center
          </h2>
          <p className="mt-4 max-w-md text-navy-300">
            Monitor all schools, manage tenants, and oversee the entire EduTrack
            platform from one place.
          </p>
          <div className="mt-8 space-y-3">
            {[
              "View all registered schools",
              "Monitor revenue across tenants",
              "Impersonate school admins for support",
              "Track platform health and growth",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-navy-200">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600/20">
                  <Shield className="h-3 w-3 text-brand-400" />
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Right panel — login form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-600/10 px-4 py-2 text-sm font-semibold text-brand-400 ring-1 ring-brand-600/20">
              <Shield className="h-4 w-4" />
              Platform Admin Access
            </span>
          </div>

          <div className="rounded-2xl border border-navy-800 bg-navy-900 p-8 shadow-2xl">
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Sign in to Platform
            </h1>
            <p className="mt-1.5 text-sm text-navy-400">
              Enter your platform admin credentials
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-300">Email</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-500" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="platform@edutrack.app"
                    className="w-full rounded-xl border border-navy-700 bg-navy-800 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-navy-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-300">Password</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-500" />
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Your password"
                    className="w-full rounded-xl border border-navy-700 bg-navy-800 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-navy-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </label>

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Signing in...
                  </>
                ) : (
                  <>
                    Sign in to Platform
                    <Shield className="h-5 w-5" />
                  </>
                )}
              </button>
            </form>

            {/* Demo credentials */}
            <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-400">
                Demo Credentials
              </p>
              <div className="mt-2 space-y-2">
                <button
                  onClick={() => setForm({ email: "platform@edutrack.app", password: "platform123" })}
                  className="flex w-full items-center justify-between rounded-lg bg-navy-800 px-3 py-2 text-left text-xs ring-1 ring-navy-700 transition hover:ring-brand-500"
                >
                  <span className="font-semibold text-white">Platform Admin</span>
                  <span className="text-navy-400">platform@edutrack.app</span>
                </button>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-navy-500">
            This is the platform admin portal — separate from school logins.
          </p>
        </div>
      </div>
    </main>
  );
}
