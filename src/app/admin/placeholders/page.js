"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Download,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Loader2,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Users,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import Logo from "@/components/Logo";
import { COUNT_TEMPLATE } from "@/lib/placeholders";
import { toCSV, withBOM } from "@/lib/csv";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const STEPS = [
  { n: 1, label: "Counts" },
  { n: 2, label: "Review" },
  { n: 3, label: "Done" },
];

function sanitizeCell(value) {
  const s = String(value ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function downloadFile(filename, text) {
  const blob = new Blob([withBOM(text)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function PlaceholdersPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [step, setStep] = useState(1);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [defaultPassword, setDefaultPassword] = useState("edutrack123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user || !["SUPER_ADMIN", "REGISTRAR"].includes(d.user.role)) {
          router.replace("/login");
          return;
        }
        setSession(d);
      })
      .catch(() => {});
  }, [router]);

  async function handleFile(file) {
    if (!file) return;
    setError("");
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    setPasteMode(false);
  }

  function downloadTemplate() {
    const arms = session?.school?.activeArms || [];
    // Example rows only for arms NOT already in the school — parseCountCsv
    // sums duplicate arm rows, so an example overlapping a real arm would
    // over-count it when the school uploads its filled template.
    const exampleArms = new Set(arms.map((a) => a.toLowerCase()));
    const examples = COUNT_TEMPLATE.example.filter(
      ([arm]) => !exampleArms.has(String(arm).toLowerCase())
    );
    const rows = [
      COUNT_TEMPLATE.headers,
      ...examples,
      ...arms.map((arm) => [arm, ""]), // pre-filled with the school's own arms
    ];
    downloadFile("edutrack-class-counts-template.csv", toCSV(rows));
  }

  async function runPreview() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users/placeholders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, dryRun: true, defaultPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the file");
      setPreview(data);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runGenerate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users/placeholders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, defaultPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate students");
      setResult(data);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadCredentials() {
    if (!result?.credentials?.length) return;
    const rows = [
      ["Name", "Email", "Password", "Class"],
      ...result.credentials.map((c) => [
        sanitizeCell(c.name),
        sanitizeCell(c.email),
        sanitizeCell(c.password),
        sanitizeCell(c.assignedClass),
      ]),
    ];
    downloadFile(`edutrack-placeholder-logins-${Date.now()}.csv`, toCSV(rows));
  }

  const arms = session?.school?.activeArms || [];
  const canContinue = csvText.trim().length > 0 && defaultPassword.length >= 6;
  const totalToCreate = preview?.arms?.reduce((s, a) => s + a.toCreate, 0) || 0;

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-navy-50">
      <header className="sticky top-0 z-30 border-b border-navy-200/70 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Super Admin
            </span>
            <Link
              href="/admin/dashboard"
              className="text-sm font-medium text-navy-500 transition hover:text-brand-600"
            >
              Back to dashboard →
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
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
                <span>{s.n}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {s.n < 3 && <div className="h-px w-8 bg-navy-200 sm:w-12" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ============ STEP 1 — COUNTS ============ */}
        {step === 1 && (
          <div className="mt-8 animate-fade-up rounded-2xl border border-navy-200/70 bg-white p-8 shadow-xl shadow-navy-900/5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-100 text-navy-700">
              <ClipboardList className="h-6 w-6" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-navy-800">
              Starting from a paper register?
            </h1>
            <p className="mt-1.5 text-sm text-navy-500">
              No names typed yet — just tell us how many students are in each class. We&apos;ll
              create placeholder accounts (<strong>Student 1</strong>, <strong>Student 2</strong>, …)
              with logins you can hand out today, then replace the names later.
            </p>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-navy-700">Class counts file</span>
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-500"
                >
                  <Download className="h-4 w-4" />
                  Download class-counts template
                </button>
              </div>

              {!pasteMode ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload your class counts CSV"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                    dragOver
                      ? "border-brand-500 bg-brand-50/70"
                      : "border-navy-200 bg-navy-50/40 hover:border-brand-400 hover:bg-brand-50/40"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,text/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                  {csvText ? (
                    <>
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 transition group-hover:scale-105">
                        <FileSpreadsheet className="h-6 w-6" />
                      </span>
                      <p className="mt-3 text-sm font-bold text-navy-800">
                        {fileName || "class-counts.csv"}
                      </p>
                      <p className="mt-1 text-xs text-navy-400">Loaded · click to replace</p>
                    </>
                  ) : (
                    <>
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-100 text-navy-600 transition group-hover:scale-105">
                        <Upload className="h-6 w-6" />
                      </span>
                      <p className="mt-3 text-sm font-semibold text-navy-700">
                        Drag & drop your counts file here, or <span className="text-brand-600">browse</span>
                      </p>
                      <p className="mt-1 text-xs text-navy-400">
                        .csv only · one row per class arm · header: Class Arm, Number of Students
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={"Class Arm,Number of Students\nSS1 Science,45\nSS1 Arts,38\nSS2 Science,40"}
                  rows={7}
                  className={`${inputCls} font-mono text-xs leading-relaxed`}
                />
              )}

              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => {
                    setPasteMode((v) => !v);
                    setCsvText("");
                    setFileName("");
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-400 transition hover:text-brand-600"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  {pasteMode ? "Upload a file instead" : "Paste CSV text instead"}
                </button>
              </div>
            </div>

            {/* Default password */}
            <div className="mt-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">
                  Default password for generated logins
                </span>
                <input
                  value={defaultPassword}
                  onChange={(e) => setDefaultPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={`${inputCls} max-w-xs`}
                />
              </label>
              <p className="mt-1.5 text-xs text-navy-400">
                Every placeholder gets this password plus an auto-generated
                email like <span className="font-mono">student.1@…</span>. You&apos;ll be able to
                download a credentials sheet after generating.
              </p>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Link
                href="/admin/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-600 transition hover:border-navy-300 hover:bg-navy-50"
              >
                <ArrowLeft className="h-4 w-4" /> Cancel
              </Link>
              <button
                onClick={runPreview}
                disabled={!canContinue || loading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                Review my counts <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============ STEP 2 — REVIEW ============ */}
        {step === 2 && preview && (
          <div className="mt-8 animate-fade-up">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Students to create", value: totalToCreate, cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", icon: Users },
                { label: "Already in school", value: preview.summary.duplicates, cls: "bg-amber-50 text-amber-700 ring-amber-600/20", icon: AlertTriangle },
                { label: "New class arms", value: preview.newArms.length, cls: "bg-brand-50 text-brand-700 ring-brand-600/20", icon: Sparkles },
                { label: "Class arms", value: preview.arms.length, cls: "bg-navy-50 text-navy-700 ring-navy-600/20", icon: ClipboardList },
              ].map((c) => (
                <div
                  key={c.label}
                  className={`flex items-center gap-3 rounded-2xl border border-navy-200/70 bg-white px-4 py-3.5 shadow-sm ring-1 ${c.cls}`}
                >
                  <c.icon className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xl font-extrabold leading-tight">{c.value}</p>
                    <p className="truncate text-xs font-semibold text-navy-500">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Per-arm breakdown */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
              <div className="border-b border-navy-100 px-6 py-4">
                <h2 className="text-lg font-bold text-navy-800">Review before generating</h2>
                <p className="text-sm text-navy-400">
                  {totalToCreate} placeholder students will be created.{" "}
                  {preview.summary.duplicates > 0
                    ? `${preview.summary.duplicates} already exist and will be skipped — re-running is safe.`
                    : ""}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                      <th className="px-6 py-3">Class Arm</th>
                      <th className="px-6 py-3 text-right">In your file</th>
                      <th className="px-6 py-3 text-right">Already there</th>
                      <th className="px-6 py-3 text-right">Will create</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.arms.map((a) => (
                      <tr key={a.classArm} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                        <td className="px-6 py-3.5 font-semibold text-navy-800">{a.classArm}</td>
                        <td className="px-6 py-3.5 text-right text-navy-500">{a.count}</td>
                        <td className="px-6 py-3.5 text-right">
                          {a.existing > 0 ? (
                            <span className="font-semibold text-amber-600">{a.existing}</span>
                          ) : (
                            <span className="text-navy-200">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span className={`font-extrabold ${a.toCreate > 0 ? "text-emerald-600" : "text-navy-300"}`}>
                            {a.toCreate}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-600 transition hover:border-navy-300 hover:bg-navy-50"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button
                onClick={runGenerate}
                disabled={loading || totalToCreate === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Generate {totalToCreate} student{totalToCreate === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}

        {/* ============ STEP 3 — DONE ============ */}
        {step === 3 && result && (
          <div className="mt-8 animate-fade-up rounded-2xl border border-navy-200/70 bg-white p-8 shadow-xl shadow-navy-900/5">
            <div className="flex flex-col items-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-navy-800">
                {result.created.students > 0
                  ? `${result.created.students} placeholder student${result.created.students === 1 ? "" : "s"} created 🎉`
                  : "Nothing new to create"}
              </h1>
              <p className="mt-1.5 max-w-md text-sm text-navy-500">
                {result.created.students > 0
                  ? "Every account has an auto-generated login. Download the sheet, print it, and hand out logins today."
                  : "Every class count in your file is already covered — nothing was re-created."}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Created", value: result.created.students },
                { label: "Duplicates skipped", value: result.summary.duplicates },
                { label: "New arms added", value: result.newArms.length },
                { label: "Logins ready", value: result.credentials.length },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-navy-100 bg-navy-50/50 px-4 py-3 text-center">
                  <p className="text-2xl font-extrabold text-navy-800">{c.value}</p>
                  <p className="text-xs font-semibold text-navy-400">{c.label}</p>
                </div>
              ))}
            </div>

            {result.failed?.length > 0 && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-800">
                    {result.failed.length} account{result.failed.length > 1 ? "s" : ""} could not be created
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-700">
                    {result.failed.slice(0, 5).map((f, i) => (
                      <li key={i}>
                        <strong>{f.name}:</strong> {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {result.credentials?.length > 0 && (
              <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/30">
                      <ClipboardList className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-navy-800">Login credentials sheet</p>
                      <p className="mt-0.5 text-xs text-navy-500">
                        {result.credentials.length} logins generated. Download the CSV, print it, and
                        write each real student&apos;s name next to their login.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={downloadCredentials}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
                  >
                    <Download className="h-4 w-4" /> Download credentials (.csv)
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/admin/quick-add"
                className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-600 transition hover:border-navy-300 hover:bg-navy-50"
              >
                <Users className="h-4 w-4" /> Replace names later with quick-add
              </Link>
              <Link
                href="/admin/dashboard#students"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
              >
                View in dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
