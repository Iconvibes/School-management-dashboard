"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Check,
  CheckCircle2,
  GraduationCap,
  ImagePlus,
  Layers,
  CalendarDays,
  Loader2,
  Palette,
  Plus,
  School,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import ArmStreamSplitter from "@/components/ArmStreamSplitter";
import { armAlreadyExists } from "@/lib/arms";
import { TERMS, getSubjects } from "@/lib/grading";
import { ROLE_HOME } from "@/lib/portal-guard";
import { bounceToLogin } from "@/lib/auth-client";
import { compressImageFile } from "@/lib/image-upload";

const SESSIONS = ["2024/2025", "2025/2026", "2026/2027", "2027/2028"];
const BRAND_COLORS = ["#2563EB", "#0EA5E9", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#1E293B"];
const SUGGESTED_ARMS = [
  "SS1 Science", "SS1 Arts", "SS2 Science", "SS2 Arts",
  "SS3 Science", "SS3 Arts", "JSS1", "JSS2", "JSS3",
];

const STEPS = [
  { n: 1, label: "Welcome", icon: School },
  { n: 2, label: "Classes", icon: Layers },
  { n: 3, label: "Session & term", icon: CalendarDays },
  { n: 4, label: "Teachers", icon: Users },
  { n: 5, label: "Fees", icon: Banknote },
  { n: 6, label: "Branding", icon: Palette },
];

const SUBJECTS = getSubjects();

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
    sealUrl: "",
  });
  const [newArm, setNewArm] = useState("");
  const [logoError, setLogoError] = useState("");
  const [sealError, setSealError] = useState("");
  const logoInputRef = useRef(null);
  const sealInputRef = useRef(null);

  // Teacher onboarding state
  const [teachers, setTeachers] = useState([]);
  const [teacherDraft, setTeacherDraft] = useState({ name: "", subjects: [], assignedClass: "" });

  // Fee onboarding state
  const [feeDraft, setFeeDraft] = useState({});
  const [feeSaving, setFeeSaving] = useState(false);

  async function handleImageFile(file, field, setErrorFn) {
    setErrorFn("");
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      setSchool((prev) => ({ ...prev, [field]: dataUrl }));
    } catch (err) {
      setErrorFn(err.message);
    }
  }

  const colorWellValue = /^#[0-9a-fA-F]{6}$/.test(school.brandColor) ? school.brandColor : "#2563EB";

  // Auth gate
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) { bounceToLogin(router); return; }
        if (data.user.role !== "SUPER_ADMIN") {
          router.replace(ROLE_HOME[data.user.role] || "/admin/dashboard");
          return;
        }
        if (data.school?.onboardingComplete) {
          router.replace("/admin/dashboard");
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
          sealUrl: data.school?.sealUrl || "",
        }));
        setLoading(false);
      })
      .catch(() => bounceToLogin(router));
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
    if (!armAlreadyExists(school.activeArms, arm)) {
      setSchool((s) => ({ ...s, activeArms: [...s.activeArms, arm] }));
    }
    setNewArm("");
  }

  function addStreamedArms(names) {
    setSchool((s) => ({
      ...s,
      activeArms: [...s.activeArms, ...names.filter((n) => !armAlreadyExists(s.activeArms, n))],
    }));
  }

  // Save school settings (called at each step boundary)
  async function saveSchool(partial = {}) {
    const res = await fetch("/api/school", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save");
    return data;
  }

  // Step 4: Add a teacher
  async function addTeacher() {
    if (!teacherDraft.name.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: teacherDraft.name.trim(),
          role: "TEACHER",
          subjects: teacherDraft.subjects,
          assignedClass: teacherDraft.assignedClass || school.activeArms[0] || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add teacher");
      setTeachers((prev) => [...prev, data.user]);
      setTeacherDraft({ name: "", subjects: [], assignedClass: "" });
    } catch (err) {
      setError(err.message);
    }
  }

  function removeTeacher(idx) {
    const t = teachers[idx];
    if (!window.confirm(`Remove ${t.name}?`)) return;
    fetch(`/api/users/${t.id}`, { method: "DELETE" })
      .then(() => setTeachers((prev) => prev.filter((_, i) => i !== idx)))
      .catch((err) => setError(err.message));
  }

  // Step 5: Save fee structures
  async function saveFees() {
    setFeeSaving(true);
    setError("");
    try {
      for (const arm of school.activeArms) {
        const amount = Number(feeDraft[arm]) || 0;
        if (amount > 0) {
          await fetch("/api/fees/structures", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ classArm: arm, amount }),
          });
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setFeeSaving(false);
    }
  }

  // Final save
  async function saveAll() {
    setSaving(true);
    setError("");
    try {
      await saveSchool({
        activeArms: school.activeArms,
        currentSession: school.currentSession,
        currentTerm: school.currentTerm,
        brandColor: school.brandColor,
        logoUrl: school.logoUrl,
        sealUrl: school.sealUrl,
        onboardingComplete: true,
      });
      setSaved(true);
      setTimeout(() => router.push("/admin/dashboard"), 800);
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
            <a href="/admin/dashboard" className="text-sm font-medium text-navy-500 transition hover:text-brand-600">
              Skip →
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        {/* Stepper */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {STEPS.map((s) => (
            <div key={s.n} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
                  step === s.n
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                    : step > s.n
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-white text-navy-400 ring-1 ring-navy-200"
                }`}
              >
                {step > s.n ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {s.n < 6 && <div className="h-px w-6 bg-navy-200 sm:w-10" />}
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-navy-200/70 bg-white p-8 shadow-xl shadow-navy-900/5">

          {/* ─── Step 1: Welcome ─── */}
          {step === 1 && (
            <div className="animate-fade-up text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50">
                <School className="h-10 w-10 text-brand-600" />
              </div>
              <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-navy-800">
                Welcome to EduTrack!
              </h1>
              <p className="mt-3 text-lg text-navy-500">
                Let&apos;s get <strong className="text-navy-800">{school.name}</strong> set up in just a few minutes.
              </p>
              <div className="mx-auto mt-8 max-w-md space-y-4 text-left">
                {[
                  { icon: Layers, text: "Set up your class arms and streams" },
                  { icon: CalendarDays, text: "Pick the current academic session & term" },
                  { icon: Users, text: "Add your first teachers" },
                  { icon: Banknote, text: "Set termly fees per class" },
                  { icon: Palette, text: "Upload your logo and pick a brand color" },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-navy-50 px-4 py-3">
                    <Icon className="h-5 w-5 shrink-0 text-brand-600" />
                    <span className="text-sm text-navy-700">{text}</span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm text-navy-400">
                You can always skip steps and come back to them later from the dashboard settings.
              </p>
            </div>
          )}

          {/* ─── Step 2: Classes ─── */}
          {step === 2 && (
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
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md transition ${active ? "bg-brand-600 text-white" : "bg-navy-100 text-transparent"}`}>
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
                <button onClick={addCustomArm} className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              <div className="mt-4">
                <ArmStreamSplitter onAdd={addStreamedArms} compact />
              </div>
              {school.activeArms.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {school.activeArms.map((arm) => (
                    <span key={arm} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
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

          {/* ─── Step 3: Session & Term ─── */}
          {step === 3 && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
                Session &amp; term
              </h1>
              <p className="mt-1.5 text-sm text-navy-500">
                Set the academic calendar your report cards will reference.
              </p>
              <label className="mt-6 block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">Current session</span>
                <select
                  value={school.currentSession}
                  onChange={(e) => setSchool({ ...school, currentSession: e.target.value })}
                  className="w-full rounded-xl border border-navy-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  {SESSIONS.map((s) => (<option key={s}>{s}</option>))}
                </select>
              </label>
              <label className="mt-5 block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">Current term</span>
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

          {/* ─── Step 4: Teachers ─── */}
          {step === 4 && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
                Add your first teachers
              </h1>
              <p className="mt-1.5 text-sm text-navy-500">
                Teachers can be added later from the dashboard. Add a few now to get started, or skip this step.
              </p>

              {/* Add teacher form */}
              <div className="mt-6 rounded-xl border border-navy-200 bg-navy-50/50 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={teacherDraft.name}
                    onChange={(e) => setTeacherDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Teacher name (e.g. Mrs. Okafor)"
                    className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                  <select
                    value={teacherDraft.assignedClass}
                    onChange={(e) => setTeacherDraft((d) => ({ ...d, assignedClass: e.target.value }))}
                    className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-700 outline-none transition focus:border-brand-500"
                  >
                    <option value="">Default class arm</option>
                    {school.activeArms.map((arm) => (<option key={arm}>{arm}</option>))}
                  </select>
                </div>
                <div className="mt-3">
                  <span className="mb-1.5 block text-xs font-medium text-navy-500">Subjects (select all that apply)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {SUBJECTS.map((subj) => {
                      const selected = teacherDraft.subjects.includes(subj);
                      return (
                        <button
                          key={subj}
                          type="button"
                          onClick={() => {
                            setTeacherDraft((d) => ({
                              ...d,
                              subjects: selected ? d.subjects.filter((s) => s !== subj) : [...d.subjects, subj],
                            }));
                          }}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                            selected
                              ? "bg-brand-600 text-white"
                              : "bg-white text-navy-600 ring-1 ring-navy-200 hover:ring-brand-300"
                          }`}
                        >
                          {subj}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={addTeacher}
                  disabled={!teacherDraft.name.trim()}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Add teacher
                </button>
              </div>

              {/* Teacher list */}
              {teachers.length > 0 && (
                <div className="mt-5 space-y-2">
                  {teachers.map((t, i) => (
                    <div key={t.id} className="flex items-center justify-between rounded-xl border border-navy-200 bg-white px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-navy-800">{t.name}</p>
                        <p className="text-xs text-navy-400">
                          {t.subjects?.length ? t.subjects.join(", ") : "No subjects"} · {t.assignedClass || "Unassigned"}
                        </p>
                      </div>
                      <button onClick={() => removeTeacher(i)} className="rounded-lg p-1.5 text-navy-300 transition hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-4 text-xs text-navy-400">
                Teachers get a login with the school name as their initial password. They can change it from their dashboard.
              </p>
            </div>
          )}

          {/* ─── Step 5: Fees ─── */}
          {step === 5 && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
                Set termly fees
              </h1>
              <p className="mt-1.5 text-sm text-navy-500">
                Set the termly fee for each class arm. You can skip this and set fees later from the Fee Management tab.
              </p>
              {school.activeArms.length === 0 ? (
                <div className="mt-8 rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
                  <Banknote className="mx-auto h-8 w-8 text-navy-300" />
                  <p className="mt-3 text-sm text-navy-500">
                    No class arms configured yet. Go back to set them up first.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {school.activeArms.map((arm) => (
                    <div key={arm} className="flex items-center gap-3 rounded-xl border border-navy-200 bg-white px-4 py-3">
                      <span className="min-w-[120px] text-sm font-semibold text-navy-800">{arm}</span>
                      <div className="flex flex-1 items-center gap-1">
                        <span className="text-sm font-semibold text-navy-400">₦</span>
                        <input
                          type="number"
                          min={0}
                          value={feeDraft[arm] ?? ""}
                          onChange={(e) => setFeeDraft((d) => ({ ...d, [arm]: e.target.value }))}
                          placeholder="e.g. 85000"
                          className="w-40 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-navy-400">
                Leave an arm blank to skip it — you can set fees for it later.
              </p>
            </div>
          )}

          {/* ─── Step 6: Branding ─── */}
          {step === 6 && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
                Make it yours
              </h1>
              <p className="mt-1.5 text-sm text-navy-500">
                Pick a brand color and upload your school logo — both appear on report cards and across every portal.
              </p>

              <label className="mt-6 block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">Brand color</span>
                <div className="flex flex-wrap items-center gap-3">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSchool({ ...school, brandColor: c })}
                      className={`h-10 w-10 rounded-xl ring-2 transition ${school.brandColor === c ? "ring-navy-800 ring-offset-2" : "ring-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Brand color ${c}`}
                    />
                  ))}
                  <input type="color" value={colorWellValue} onChange={(e) => setSchool({ ...school, brandColor: e.target.value })} className="h-10 w-14 cursor-pointer rounded-xl border border-navy-200 bg-white" aria-label="Custom brand color" />
                  <div className="flex items-center gap-1 rounded-lg border border-navy-200 px-2.5 py-1.5">
                    <span className="text-xs font-bold text-navy-400">#</span>
                    <input
                      value={school.brandColor.startsWith("#") ? school.brandColor.slice(1) : school.brandColor}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6); setSchool({ ...school, brandColor: v ? `#${v}` : "" }); }}
                      onBlur={() => { if (!/^#[0-9a-fA-F]{6}$/.test(school.brandColor)) setSchool({ ...school, brandColor: "#2563EB" }); }}
                      placeholder="2563EB"
                      aria-label="Custom brand color (hex)"
                      className="w-20 bg-transparent font-mono text-sm font-semibold text-navy-800 outline-none placeholder:font-sans placeholder:text-xs placeholder:font-medium placeholder:text-navy-300"
                    />
                  </div>
                </div>
              </label>

              <div className="mt-5">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">School logo</span>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => { handleImageFile(e.target.files?.[0], "logoUrl", setLogoError); e.target.value = ""; }} className="hidden" />
                {school.logoUrl ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 p-3">
                    <img src={school.logoUrl} alt="School logo preview" className="h-14 w-14 rounded-lg border border-navy-100 bg-white object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy-800">Logo uploaded</p>
                      <p className="text-xs text-navy-400">Shown on report cards and in your portal.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => logoInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600">
                        <Upload className="h-3.5 w-3.5" /> Replace
                      </button>
                      <button type="button" onClick={() => setSchool({ ...school, logoUrl: "" })} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                        <X className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => logoInputRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/50 px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
                    <ImagePlus className="h-6 w-6 text-navy-300" />
                    <span className="text-sm font-semibold text-navy-700">Upload your school&apos;s logo</span>
                    <span className="text-xs text-navy-400">PNG, JPG, SVG or WebP · under 1 MB</span>
                  </button>
                )}
                {logoError && <p className="mt-2 text-xs font-medium text-rose-600">{logoError}</p>}
              </div>

              <div className="mt-5">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">School seal / signature</span>
                <input ref={sealInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => { handleImageFile(e.target.files?.[0], "sealUrl", setSealError); e.target.value = ""; }} className="hidden" />
                {school.sealUrl ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 p-3">
                    <img src={school.sealUrl} alt="School seal preview" className="h-14 w-14 rounded-full border border-navy-100 bg-white object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy-800">Seal uploaded</p>
                      <p className="text-xs text-navy-400">Printed on report cards next to the logo.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => sealInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600">
                        <Upload className="h-3.5 w-3.5" /> Replace
                      </button>
                      <button type="button" onClick={() => setSchool({ ...school, sealUrl: "" })} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                        <X className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => sealInputRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/50 px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
                    <BadgeCheck className="h-6 w-6 text-navy-300" />
                    <span className="text-sm font-semibold text-navy-700">Upload your school seal or signature</span>
                    <span className="text-xs text-navy-400">PNG, JPG, SVG or WebP · under 1 MB</span>
                  </button>
                )}
                {sealError && <p className="mt-2 text-xs font-medium text-rose-600">{sealError}</p>}
              </div>

              {/* Live preview */}
              <div className="mt-6 overflow-hidden rounded-xl border border-navy-200">
                <div className="bg-navy-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-navy-400">Live preview</div>
                <div className="p-5" style={{ backgroundColor: school.brandColor }}>
                  <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg text-white" style={{ backgroundColor: school.brandColor }}>
                        {school.logoUrl ? (<img src={school.logoUrl} alt="" className="h-full w-full bg-white object-contain" />) : (<School className="h-5 w-5" />)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-navy-800">{school.name}</p>
                        <p className="text-xs text-navy-400">{school.currentSession} · {school.currentTerm}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {school.sealUrl ? (<img src={school.sealUrl} alt="" className="h-10 w-10 rounded-full border-2 border-white bg-white object-contain shadow-sm" />) : null}
                      <span className="rounded-md px-2 py-1 text-xs font-bold text-white" style={{ backgroundColor: school.brandColor }}>REPORT CARD</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Completion summary */}
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-emerald-800">You&apos;re all set!</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      {school.activeArms.length} class arms · {teachers.length} teacher{teachers.length !== 1 ? "s" : ""} · {school.currentSession} · {school.currentTerm}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
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

            {step < 6 ? (
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
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : saved ? (
                  <><Check className="h-4 w-4" /> Done! Taking you in…</>
                ) : (
                  <><GraduationCap className="h-4 w-4" /> Launch your dashboard</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
