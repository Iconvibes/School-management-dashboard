"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Users,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ClipboardPaste,
  ShieldCheck,
  FileUp,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import Logo from "@/components/Logo";
import { TEMPLATES } from "@/lib/importer";
import { toCSV, withBOM } from "@/lib/csv";
import { generateRosterCsv, DEFAULT_SAMPLE_ARMS } from "@/lib/sample-roster";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const STEPS = [
  { n: 1, label: "Upload" },
  { n: 2, label: "Review" },
  { n: 3, label: "Done" },
];

const ROLE_META = {
  STUDENT: { label: "Students", icon: GraduationCap, accent: "brand" },
  TEACHER: { label: "Teachers", icon: Users, accent: "navy" },
};

function StatusBadge({ status }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
      </span>
    );
  }
  if (status === "duplicate") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
        <AlertTriangle className="h-3.5 w-3.5" /> Duplicate
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-600/20">
      <XCircle className="h-3.5 w-3.5" /> Error
    </span>
  );
}

function downloadFile(filename, text, mime = "text/csv") {
  const blob = new Blob([withBOM(text)], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// CSV injection guard: cells starting with = + - @ (or tabs) are interpreted
// as formulas by Excel. Names come from arbitrary uploaded files, so neutralize
// the leading character with a single quote before building the sheet.
function sanitizeCell(value) {
  const s = String(value ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("STUDENT");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [defaultPassword, setDefaultPassword] = useState("edutrack123");
  const [createArms, setCreateArms] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [schoolArms, setSchoolArms] = useState([]);
  const fileInputRef = useRef(null);

  // Safety net: leave if not a super admin (the API enforces this too).
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user || !["SUPER_ADMIN", "REGISTRAR"].includes(d.user.role)) {
          router.replace("/login");
          return;
        }
        setIsDemo(d.isDemo === true);
        setSchoolArms(d.school?.activeArms || []);
      })
      .catch(() => {});
  }, [router]);

  const summary = preview?.summary || result?.summary;
  const visibleRows = useMemo(
    () => (preview?.rows || []).slice(0, 200),
    [preview]
  );
  const truncated = (preview?.rows || []).length > 200;

  async function handleFile(file) {
    if (!file) return;
    const isCsv = /\.(csv|txt)$/i.test(file.name);
    if (!isCsv && file.type && !file.type.startsWith("text/")) {
      setError(
        "That file type isn't supported yet. In Excel, use File → Save As → CSV, then upload the .csv file."
      );
      return;
    }
    setError("");
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    setPasteMode(false);
  }

  function downloadTemplate() {
    const t = TEMPLATES[role];
    const rows = [t.headers, ...t.example];
    downloadFile(`edutrack-${role.toLowerCase()}-template.csv`, toCSV(rows));
  }

  // Demo mode only: pre-fill the wizard with a realistic roster at real-school
  // scale (e.g. 900 students across the school's arms) and jump to Review.
  function loadSample(sampleRole) {
    const csv = generateRosterCsv({
      role: sampleRole,
      arms: schoolArms.length > 0 ? schoolArms : DEFAULT_SAMPLE_ARMS,
    });
    setRole(sampleRole);
    setCsvText(csv);
    setFileName(sampleRole === "TEACHER" ? "sample-teachers.csv" : "sample-students.csv");
    setPasteMode(true);
    runPreview({ role: sampleRole, csv });
  }

  async function runPreview(overrides = {}) {
    setLoading(true);
    setError("");
    try {
      // State updates are async — callers like loadSample() pass role/csv
      // explicitly so a fresh roster is previewed even before re-render.
      const previewRole = overrides.role ?? role;
      const previewCsv = overrides.csv ?? csvText;
      const res = await fetch("/api/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: previewRole,
          csv: previewCsv,
          dryRun: true,
          options: {
            defaultPassword,
            createArms: overrides.createArms ?? createArms,
          },
        }),
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

  async function runImport() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          csv: csvText,
          dryRun: false,
          options: { defaultPassword, createArms },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
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
      ["Name", "Email", "Password", "Role", "Class"],
      ...result.credentials.map((c) => [
        sanitizeCell(c.name),
        sanitizeCell(c.email),
        sanitizeCell(c.password),
        c.role === "PARENT" ? "Parent" : result.role === "TEACHER" ? "Teacher" : "Student",
        sanitizeCell(c.assignedClass),
      ]),
    ];
    downloadFile(`edutrack-logins-${Date.now()}.csv`, toCSV(rows));
  }

  const canContinue = csvText.trim().length > 0 && defaultPassword.length >= 6;
  const meta = ROLE_META[role];
  const canImport = preview && summary?.ok > 0;

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-navy-50">
      {/* Header */}
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

        {/* Error banner */}
        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ============ STEP 1 — UPLOAD ============ */}
        {step === 1 && (
          <div className="mt-8 animate-fade-up rounded-2xl border border-navy-200/70 bg-white p-8 shadow-xl shadow-navy-900/5">
            <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
              Import your roster in one go
            </h1>
            <p className="mt-1.5 text-sm text-navy-500">
              Skip the one-by-one forms. Upload the list you already have in Excel —
              we&apos;ll validate it, generate logins, and create accounts in minutes.
            </p>

            {/* Role toggle */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              {Object.entries(ROLE_META).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => {
                    setRole(key);
                    setPreview(null);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-5 py-4 text-sm font-bold transition ${
                    role === key
                      ? key === "STUDENT"
                        ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500"
                        : "border-navy-800 bg-navy-50 text-navy-800 ring-1 ring-navy-800"
                      : "border-navy-200 bg-white text-navy-500 hover:border-brand-300 hover:text-navy-700"
                  }`}
                >
                  <m.icon className="h-5 w-5" />
                  Import {m.label}
                </button>
              ))}
            </div>

            {/* Upload zone */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-navy-700">
                  Your CSV file
                </span>
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-500"
                >
                  <Download className="h-4 w-4" />
                  Download {meta.label.toLowerCase()} template
                </button>
              </div>

              {!pasteMode ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload your CSV file"
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
                        {fileName || "roster.csv"}
                      </p>
                      <p className="mt-1 text-xs text-navy-400">
                        Loaded · click to replace
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 transition group-hover:scale-105">
                        <Upload className="h-6 w-6" />
                      </span>
                      <p className="mt-3 text-sm font-semibold text-navy-700">
                        Drag & drop your CSV here, or <span className="text-brand-600">browse</span>
                      </p>
                      <p className="mt-1 text-xs text-navy-400">
                        .csv only · {meta.label.toLowerCase()} list with a header row ·
                        up to 5,000 rows
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={
                    role === "STUDENT"
                      ? "name,email,class,phone,password,parent name,parent phone\nKunle Adebayo,kunle@gmail.com,SS1 Science,08031234567,,Mrs. Folake Adebayo,08031234567\nChidinma Obi,,SS1 Science,08079876543,,,"
                      : "name,email,assigned class,phone,password\nMrs. Adaeze Okafor,a.okafor@school.edu.ng,SS1 Science,08051112222,"
                  }
                  rows={8}
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
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  {pasteMode ? "Upload a file instead" : "Paste CSV text instead"}
                </button>
              </div>
            </div>

            {/* Demo-mode shortcut: realistic roster at real-school scale */}
            {isDemo && (
              <div className="mt-6 rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/30">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy-800">Demo mode — load a sample roster</p>
                    <p className="mt-0.5 text-xs text-navy-500">
                      One click fills the wizard with a realistic roster at real-school scale
                      (generated names, logins, parents and classes). Review it, then import.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => loadSample("STUDENT")}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
                  >
                    <GraduationCap className="h-4 w-4" />
                    Load {(schoolArms.length > 0 ? schoolArms : DEFAULT_SAMPLE_ARMS).length * 150}{" "}
                    sample students
                  </button>
                  <button
                    onClick={() => loadSample("TEACHER")}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                  >
                    <Users className="h-4 w-4" />
                    Load 50 sample teachers
                  </button>
                </div>
              </div>
            )}

            {/* Paper-register shortcut: no names yet, just class sizes */}
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-dashed border-navy-200 bg-navy-50/40 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white shadow-md shadow-navy-800/30">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-navy-800">Still on a paper register?</p>
                  <p className="mt-0.5 text-xs text-navy-500">
                    Enter just your class sizes and we&apos;ll create placeholder students with logins
                    you can hand out today — swap in real names later.
                  </p>
                  <Link
                    href="/admin/placeholders"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition hover:text-brand-500"
                  >
                    Start from class sizes <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

            {/* Default password */}
            <div className="mt-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">
                  Default password for imported accounts
                </span>
                <input
                  value={defaultPassword}
                  onChange={(e) => setDefaultPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={`${inputCls} max-w-xs`}
                />
              </label>
              <p className="mt-1.5 text-xs text-navy-400">
                Used when a row has no password. You&apos;ll be able to download a
                credentials sheet after the import — print it and hand out logins.
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
                onClick={() => runPreview()}
                disabled={!canContinue || loading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                Review my {meta.label.toLowerCase()} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============ STEP 2 — REVIEW ============ */}
        {step === 2 && preview && (
          <div className="mt-8 animate-fade-up">
            {/* Summary chips */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Ready to import", value: summary.ok, cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", icon: CheckCircle2 },
                { label: "Errors", value: summary.errors, cls: "bg-rose-50 text-rose-700 ring-rose-600/20", icon: XCircle },
                { label: "Duplicates skipped", value: summary.duplicates, cls: "bg-amber-50 text-amber-700 ring-amber-600/20", icon: AlertTriangle },
                { label: "New class arms", value: summary.newArms, cls: "bg-brand-50 text-brand-700 ring-brand-600/20", icon: Sparkles },
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

            {/* Unknown columns note */}
            {preview.unknownColumns?.length > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Ignored columns: <strong>{preview.unknownColumns.join(", ")}</strong>. They
                  aren&apos;t needed — only name, email, class, phone, password and parent
                  fields are used.
                </span>
              </div>
            )}

            {/* New arms toggle */}
            {preview.newArms.length > 0 && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50/70 px-5 py-4">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-navy-800">
                    {preview.newArms.length} new class arm{preview.newArms.length > 1 ? "s" : ""} found
                  </p>
                  <p className="mt-0.5 text-xs text-navy-500">
                    These arms aren&apos;t configured yet:{" "}
                    <strong className="text-navy-700">{preview.newArms.join(", ")}</strong>
                  </p>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-700">
                    <input
                      type="checkbox"
                      checked={createArms}
                      onChange={(e) => {
                        setCreateArms(e.target.checked);
                        runPreview({ createArms: e.target.checked });
                      }}
                      className="h-4 w-4 rounded border-navy-300 accent-brand-600"
                    />
                    Create them automatically during import
                  </label>
                </div>
              </div>
            )}

            {/* Rows table */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
              <div className="border-b border-navy-100 px-6 py-4">
                <h2 className="text-lg font-bold text-navy-800">Review before importing</h2>
                <p className="text-sm text-navy-400">
                  {summary.ok} valid rows will be created.{" "}
                  {summary.errors > 0
                    ? `${summary.errors} rows with errors will be skipped. `
                    : ""}
                  {summary.duplicates > 0
                    ? `${summary.duplicates} duplicates will be ignored.`
                    : ""}
                </p>
              </div>
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-navy-100 bg-navy-50/90 text-xs font-semibold uppercase tracking-wider text-navy-400 backdrop-blur">
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Class</th>
                      <th className="hidden px-4 py-3 md:table-cell">Parent</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr
                        key={r.row}
                        className={`border-b border-navy-50 transition ${
                          r.status === "error"
                            ? "bg-rose-50/40"
                            : r.status === "duplicate"
                            ? "bg-amber-50/40"
                            : "hover:bg-navy-50/40"
                        }`}
                      >
                        <td className="px-4 py-2.5 text-xs font-semibold text-navy-400">{r.row}</td>
                        <td className="px-4 py-2.5 font-semibold text-navy-800">{r.name || "—"}</td>
                        <td className="max-w-[16rem] truncate px-4 py-2.5 text-navy-500">
                          {r.email || <span className="text-navy-300">auto-generated</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="rounded-md bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-600">
                            {r.assignedClass || "Unassigned"}
                          </span>
                        </td>
                        <td className="hidden max-w-[12rem] truncate px-4 py-2.5 text-navy-500 md:table-cell">
                          {r.parentName || <span className="text-navy-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col items-start gap-0.5">
                            <StatusBadge status={r.status} />
                            {r.error && (
                              <span className="text-xs text-rose-600">{r.error}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-navy-400">
                          No rows found in this file.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {truncated && (
                <div className="border-t border-navy-100 bg-navy-50/60 px-6 py-3 text-xs text-navy-500">
                  Showing the first 200 of {preview.rows.length} rows. All valid rows will be imported.
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-600 transition hover:border-navy-300 hover:bg-navy-50"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex items-center gap-2">
                {summary.errors > 0 && (
                  <span className="hidden text-xs text-navy-400 sm:block">
                    Rows with errors will be skipped
                  </span>
                )}
                <button
                  onClick={runImport}
                  disabled={!canImport || loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Import {summary.ok} {meta.label.toLowerCase()}
                </button>
              </div>
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
                Import complete 🎉
              </h1>
              <p className="mt-1.5 max-w-md text-sm text-navy-500">
                {result.created.students || result.created.teachers}{" "}
                {meta.label.toLowerCase()} created
                {result.created.parents > 0 &&
                  `, ${result.created.parents} parent account${result.created.parents > 1 ? "s" : ""} created and linked`}
                {result.newArms.length > 0 &&
                  `, ${result.newArms.length} new class arm${result.newArms.length > 1 ? "s" : ""} added`}
                .
              </p>
            </div>

            {/* Stat row */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Created", value: result.created.students + result.created.teachers },
                { label: "Parents linked", value: result.created.linked },
                { label: "Duplicates skipped", value: result.summary.duplicates },
                { label: "Errors skipped", value: result.summary.errors },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl border border-navy-100 bg-navy-50/50 px-4 py-3 text-center"
                >
                  <p className="text-2xl font-extrabold text-navy-800">{c.value}</p>
                  <p className="text-xs font-semibold text-navy-400">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Partial failure warning */}
            {result.failed?.length > 0 && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-800">
                    {result.failed.length} account{result.failed.length > 1 ? "s" : ""} could not be created
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-700">
                    {result.failed.slice(0, 5).map((f, i) => (
                      <li key={i}>
                        <strong>{f.name || "Parent account"}:</strong> {f.error}
                      </li>
                    ))}
                  </ul>
                  {result.failed.length > 5 && (
                    <p className="mt-1 text-xs text-amber-600">
                      …and {result.failed.length - 5} more. Fix those rows and import again —
                      everything else is already in.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Credentials */}
            <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/30">
                    <FileSpreadsheet className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-navy-800">
                      Login credentials sheet
                    </p>
                    <p className="mt-0.5 text-xs text-navy-500">
                      {result.credentials.length} logins generated. Download the CSV, print it,
                      and hand out the details — no need to type anything.
                    </p>
                  </div>
                </div>
                <button
                  onClick={downloadCredentials}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
                >
                  <Download className="h-4 w-4" />
                  Download credentials (.csv)
                </button>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => {
                  setStep(1);
                  setPreview(null);
                  setResult(null);
                  setCsvText("");
                  setFileName("");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-600 transition hover:border-navy-300 hover:bg-navy-50"
              >
                <FileUp className="h-4 w-4" /> Import another file
              </button>
              <Link
                href={`/admin/dashboard#${result.role === "TEACHER" ? "teachers" : "students"}`}
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
