"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Users,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  ClipboardList,
} from "lucide-react";
import Logo from "@/components/Logo";
import { parseNames } from "@/lib/quick-add";
import { toCSV, withBOM } from "@/lib/csv";
import { can } from "@/lib/permissions";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

// CSV injection guard — names come from pasted text, neutralize formula chars
// for Excel before building the credentials sheet.
function sanitizeCell(value) {
  const s = String(value ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function downloadCredentials(credentials, classArm) {
  if (!credentials?.length) return;
  const rows = [
    ["Name", "Email", "Password", "Class"],
    ...credentials.map((c) => [
      sanitizeCell(c.name),
      sanitizeCell(c.email),
      sanitizeCell(c.password),
      sanitizeCell(c.assignedClass || classArm),
    ]),
  ];
  const blob = new Blob([withBOM(toCSV(rows))], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `edutrack-logins-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function QuickAddPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [namesText, setNamesText] = useState("");
  const [classArm, setClassArm] = useState("");
  const [defaultPassword, setDefaultPassword] = useState("edutrack123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user || !can(d.user.role, "students.manage")) {
          router.replace("/login");
          return;
        }
        setSession(d);
        setClassArm(d.school?.activeArms?.[0] || "");
      })
      .catch(() => {});
  }, [router]);

  const names = useMemo(() => parseNames(namesText), [namesText]);
  const canAdd = names.length > 0 && classArm && defaultPassword.length >= 6;

  async function runQuickAdd() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names,
          classArm,
          defaultPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add students");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setNamesText("");
    setResult(null);
    setError("");
  }

  const arms = session?.school?.activeArms || [];

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-navy-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-navy-200/70 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
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

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!result ? (
          <div className="animate-fade-up rounded-2xl border border-navy-200/70 bg-white p-8 shadow-xl shadow-navy-900/5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
              <UserPlus className="h-6 w-6" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-navy-800">
              Quick-add students
            </h1>
            <p className="mt-1.5 text-sm text-navy-500">
              Paste a list of names, pick their class, and we&apos;ll create every account with
              an auto-generated login. No spreadsheet needed.
            </p>

            {/* Class arm */}
            <div className="mt-6">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">Class arm</span>
                <select
                  value={classArm}
                  onChange={(e) => setClassArm(e.target.value)}
                  className={`${inputCls} max-w-xs`}
                >
                  <option value="">Choose a class arm…</option>
                  {arms.map((arm) => (
                    <option key={arm}>{arm}</option>
                  ))}
                </select>
              </label>
              {arms.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">
                  No class arms configured yet — add them in school onboarding first.
                </p>
              )}
            </div>

            {/* Names */}
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-navy-700">Student names</span>
                {names.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                    <Users className="h-3 w-3" /> {names.length} name{names.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <textarea
                value={namesText}
                onChange={(e) => setNamesText(e.target.value)}
                placeholder={"Kunle Adebayo\nChidinma Obi\nAmina Suleiman\n\n…one name per line, or comma-separated"}
                rows={9}
                className={`${inputCls} font-mono text-sm leading-relaxed`}
              />
              <p className="mt-1.5 text-xs text-navy-400">
                One name per line works best. Bullet points, numbers and commas are all fine —
                duplicates are skipped automatically.
              </p>
            </div>

            {/* Default password */}
            <div className="mt-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">
                  Default password
                </span>
                <input
                  value={defaultPassword}
                  onChange={(e) => setDefaultPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={`${inputCls} max-w-xs`}
                />
              </label>
              <p className="mt-1.5 text-xs text-navy-400">
                Every student gets this password plus an auto-generated
                email like <span className="font-mono">kunle.adebayo@…</span>. You&apos;ll be able
                to download a credentials sheet after adding.
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
                onClick={runQuickAdd}
                disabled={!canAdd || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Add {names.length} student{names.length === 1 ? "" : "s"}
              </button>
            </div>

            <div className="mt-6 flex items-start gap-2 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-xs text-navy-500">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <p>
                Adding a whole roster with parents, phones and teachers? Use the{" "}
                <Link href="/admin/import" className="font-semibold text-brand-600 hover:underline">
                  CSV importer
                </Link>{" "}
                instead — it handles hundreds of students at once.
              </p>
            </div>
          </div>
        ) : (
          <div className="animate-fade-up rounded-2xl border border-navy-200/70 bg-white p-8 shadow-xl shadow-navy-900/5">
            <div className="flex flex-col items-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-navy-800">
                {result.created.students > 0
                  ? `${result.created.students} student${result.created.students === 1 ? "" : "s"} added 🎉`
                  : "Nothing new to add"}
              </h1>
              <p className="mt-1.5 max-w-md text-sm text-navy-500">
                {result.created.students > 0
                  ? `All added to ${result.classArm} with auto-generated logins.`
                  : result.summary.duplicates > 0
                  ? "Every name in your list is already in this class — nothing was re-created."
                  : "Check the errors below and try again."}
              </p>
            </div>

            {/* Stat row */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { label: "Added", value: result.created.students, cls: "text-emerald-700" },
                { label: "Duplicates skipped", value: result.summary.duplicates, cls: "text-amber-700" },
                { label: "Errors", value: result.summary.errors, cls: "text-rose-700" },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-navy-100 bg-navy-50/50 px-4 py-3 text-center">
                  <p className={`text-2xl font-extrabold ${c.cls}`}>{c.value}</p>
                  <p className="text-xs font-semibold text-navy-400">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Failed rows */}
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

            {/* Per-name results */}
            {result.rows?.length > 0 && (
              <div className="mt-6 overflow-hidden rounded-2xl border border-navy-200/70">
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-navy-100 bg-navy-50/90 text-xs font-semibold uppercase tracking-wider text-navy-400 backdrop-blur">
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Login</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r) => (
                        <tr
                          key={r.row}
                          className={`border-b border-navy-50 ${
                            r.status === "error"
                              ? "bg-rose-50/40"
                              : r.status === "duplicate"
                              ? "bg-amber-50/40"
                              : "hover:bg-navy-50/40"
                          }`}
                        >
                          <td className="px-4 py-2.5 font-semibold text-navy-800">{r.name}</td>
                          <td className="max-w-[14rem] truncate px-4 py-2.5 text-navy-500">
                            {r.email || <span className="text-navy-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {r.status === "ok" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                <CheckCircle2 className="h-3 w-3" /> Added
                              </span>
                            ) : r.status === "duplicate" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
                                <AlertTriangle className="h-3 w-3" /> Skipped
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-600/20">
                                <XCircle className="h-3 w-3" /> Error
                              </span>
                            )}
                            {r.error && (
                              <span className="mt-0.5 block text-xs text-rose-600">{r.error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Credentials */}
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
                        {result.credentials.length} login{result.credentials.length === 1 ? "" : "s"} generated.
                        Download the CSV and hand them out — no typing needed.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadCredentials(result.credentials, result.classArm)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
                  >
                    <Download className="h-4 w-4" /> Download credentials (.csv)
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-600 transition hover:border-navy-300 hover:bg-navy-50"
              >
                <UserPlus className="h-4 w-4" /> Add another batch
              </button>
              <Link
                href="/admin/dashboard#students"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
              >
                View in dashboard <ArrowLeft className="h-4 w-4 rotate-180" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
