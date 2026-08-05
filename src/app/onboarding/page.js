"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Palette,
  Plus,
  CalendarDays,
  Layers,
  X,
  School,
} from "lucide-react";
import Logo from "@/components/Logo";
import { TERMS } from "@/lib/grading";

const SESSIONS = ["2024/2025", "2025/2026", "2026/2027", "2027/2028"];
const BRAND_COLORS = ["#2563EB", "#0EA5E9", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#1E293B"];
const SUGGESTED_ARMS = [
  "SS1 Science", "SS1 Arts", "SS2 Science", "SS2 Arts",
  "SS3 Science", "SS3 Arts", "JSS1", "JSS2", "JSS3",
];

const STEPS = [
  { n: 1, label: "Classes", icon: Layers },
  { n: 2, label: "Session & term", icon: CalendarDays },
  { n: 3, label: "Branding", icon: Palette },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [school, setSchool] = useState({
    name: "",
    activeArms: [],
    currentSession: "2025/2026",
    currentTerm: "First Term",
    brandColor: "#2563EB",
    logoUrl: "",
  });
  const [newArm, setNewArm] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) {
          router.replace("/login");
          return;
        }
        setSchool((s) => ({
          ...s,
          name: data.school?.name || s.name,
          activeArms: data.school?.activeArms || [],
          currentSession: data.school?.currentSession || s.currentSession,
          currentTerm: data.school?.currentTerm || s.currentTerm,
          brandColor: data.school?.brandColor || s.brandColor,
          logoUrl: data.school?.logoUrl || "",
        }));
        setLoading(false);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  function toggleArm(arm) {
    setSchool((s) => ({
      ...s,
      activeArms: s.activeArms.includes(arm)
        ? s.activeArms.filter((a) => a !== arm)
        : [...s.activeArms, arm],
    }));
  }

  function addCustomArm() {
    const arm = newArm.trim();
    if (!arm) return;
    if (!school.activeArms.includes(arm)) {
      setSchool((s) => ({ ...s, activeArms: [...s.activeArms, arm] }));
    }
    setNewArm("");
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/school", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeArms: school.activeArms,
          currentSession: school.currentSession,
          currentTerm: school.currentTerm,
          brandColor: school.brandColor,
          logoUrl: school.logoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      setTimeout(() => router.push("/admin/dashboard"), 600);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-navy-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-navy-50">
      {/* Header */}
      <header className="border-b border-navy-200/70 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {school.name}
            </span>
            <a
              href="/admin/dashboard"
              className="text-sm font-medium text-navy-500 transition hover:text-brand-600"
            >
              Skip →
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        {/* Stepper */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s) => (
            <div key={s.n} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  step === s.n
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                    : step > s.n
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-white text-navy-400 ring-1 ring-navy-200"
                }`}
              >
                <s.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {s.n < 3 && <div className="h-px w-8 bg-navy-200 sm:w-12" />}
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-navy-200/70 bg-white p-8 shadow-xl shadow-navy-900/5">
          {/* Step 1 — Classes */}
          {step === 1 && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
                Configure your class arms
              </h1>
              <p className="mt-1.5 text-sm text-navy-500">
                Select the streams available in your school. You can add custom arms too.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {SUGGESTED_ARMS.map((arm) => {
                  const active = school.activeArms.includes(arm);
                  return (
                    <button
                      key={arm}
                      onClick={() => toggleArm(arm)}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition ${
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500"
                          : "border-navy-200 bg-white text-navy-600 hover:border-brand-300"
                      }`}
                    >
                      {arm}
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md transition ${
                          active ? "bg-brand-600 text-white" : "bg-navy-100 text-transparent"
                        }`}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex gap-2">
                <input
                  value={newArm}
                  onChange={(e) => setNewArm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomArm()}
                  placeholder="Custom arm, e.g. Pre-Nursery"
                  className="flex-1 rounded-xl border border-navy-200 px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <button
                  onClick={addCustomArm}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>

              {school.activeArms.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {school.activeArms.map((arm) => (
                    <span
                      key={arm}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200"
                    >
                      {arm}
                      <button onClick={() => toggleArm(arm)} className="text-brand-400 hover:text-brand-600">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Session & term */}
          {step === 2 && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
                Session & term
              </h1>
              <p className="mt-1.5 text-sm text-navy-500">
                Set the academic calendar your report cards will reference.
              </p>

              <label className="mt-6 block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">
                  Current session
                </span>
                <select
                  value={school.currentSession}
                  onChange={(e) => setSchool({ ...school, currentSession: e.target.value })}
                  className="w-full rounded-xl border border-navy-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  {SESSIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">
                  Current term
                </span>
                <div className="grid grid-cols-3 gap-3">
                  {TERMS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSchool({ ...school, currentTerm: t })}
                      className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                        school.currentTerm === t
                          ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500"
                          : "border-navy-200 text-navy-600 hover:border-brand-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </label>

              <div className="mt-6 rounded-xl bg-navy-50 p-4 text-sm text-navy-600">
                Report cards and the teacher grading matrix will be stamped with{" "}
                <strong className="text-navy-800">{school.currentSession}</strong> ·{" "}
                <strong className="text-navy-800">{school.currentTerm}</strong>.
              </div>
            </div>
          )}

          {/* Step 3 — Branding */}
          {step === 3 && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
                Make it yours
              </h1>
              <p className="mt-1.5 text-sm text-navy-500">
                Choose a brand color and (optionally) a logo URL for report cards.
              </p>

              <label className="mt-6 block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">Brand color</span>
                <div className="flex flex-wrap items-center gap-3">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSchool({ ...school, brandColor: c })}
                      className={`h-10 w-10 rounded-xl ring-2 transition ${
                        school.brandColor === c
                          ? "ring-navy-800 ring-offset-2"
                          : "ring-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Brand color ${c}`}
                    />
                  ))}
                  <input
                    type="color"
                    value={school.brandColor}
                    onChange={(e) => setSchool({ ...school, brandColor: e.target.value })}
                    className="h-10 w-14 cursor-pointer rounded-xl border border-navy-200 bg-white"
                    aria-label="Custom brand color"
                  />
                </div>
              </label>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">Logo URL (optional)</span>
                <input
                  value={school.logoUrl}
                  onChange={(e) => setSchool({ ...school, logoUrl: e.target.value })}
                  placeholder="https://your-school.com/logo.png"
                  className="w-full rounded-xl border border-navy-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>

              {/* Live preview */}
              <div className="mt-6 overflow-hidden rounded-xl border border-navy-200">
                <div className="bg-navy-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-navy-400">
                  Live preview
                </div>
                <div className="p-5" style={{ backgroundColor: school.brandColor }}>
                  <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: school.brandColor }}
                      >
                        <School className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-navy-800">{school.name}</p>
                        <p className="text-xs text-navy-400">
                          {school.currentSession} · {school.currentTerm}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-md px-2 py-1 text-xs font-bold text-white" style={{ backgroundColor: school.brandColor }}>
                      REPORT CARD
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-600 transition hover:border-navy-300 hover:bg-navy-50 disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={saveAll}
                disabled={saving || saved}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : saved ? (
                  <>
                    <Check className="h-4 w-4" /> Saved! Taking you in…
                  </>
                ) : (
                  <>
                    Save & enter dashboard <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
