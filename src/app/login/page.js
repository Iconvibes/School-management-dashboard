"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  GraduationCap,
  BookOpen,
  HeartHandshake,
  Wallet,
  ClipboardList,
  Info,
  Search,
  School,
  Check,
  Building2,
  ChevronRight,
} from "lucide-react";
import Logo from "@/components/Logo";

const ROLES = [
  { key: "SUPER_ADMIN", label: "Super Admin", icon: ShieldCheck, desc: "Run the school" },
  { key: "BURSAR", label: "Bursar", icon: Wallet, desc: "Manage fees & payments" },
  { key: "REGISTRAR", label: "Registrar", icon: ClipboardList, desc: "Manage the roster" },
  { key: "TEACHER", label: "Teacher", icon: GraduationCap, desc: "Grade & manage class" },
  { key: "STUDENT", label: "Student", icon: BookOpen, desc: "View report card" },
  { key: "PARENT", label: "Parent", icon: HeartHandshake, desc: "Track your children" },
];

// Demo accounts all belong to the seeded demo school
const DEMO_SCHOOL = { id: "sch_101", name: "Greenfield International School" };
const DEMO_CREDENTIALS = [
  { role: "SUPER_ADMIN", email: "admin@edutrack.app", password: "admin123" },
  { role: "BURSAR", email: "bursar@edutrack.app", password: "bursar123" },
  { role: "REGISTRAR", email: "registrar@edutrack.app", password: "registrar123" },
  { role: "TEACHER", email: "a.okafor@edutrack.app", password: "teacher123" },
  { role: "STUDENT", email: "k.adebayo@edutrack.app", password: "student123" },
  { role: "PARENT", email: "p.adebayo@edutrack.app", password: "parent123" },
];

const SCHOOL_KEY = "edutrack_last_school";

export default function LoginPage() {
  const router = useRouter();
  const [school, setSchool] = useState(null); // { id, name }
  const [step, setStep] = useState("school"); // "school" | "credentials"
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [role, setRole] = useState("SUPER_ADMIN");
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchDebounce = useRef(null);
  // Whether the seeded demo school exists & may be signed into. Defaults to
  // false so a clean slate (SEED_DEMO_SCHOOL unset) never flashes demo UI.
  const [demoAvailable, setDemoAvailable] = useState(false);
  // The selected school's account state — "" | "frozen" | "deleted". The
  // credentials step shows a notice before anyone types a password.
  const [schoolStatus, setSchoolStatus] = useState("");

  // Restore last-used school AFTER hydration — the /login page is statically
  // prerendered, so reading localStorage during the initial render would cause
  // a hydration mismatch. Deferred (setTimeout) so the first client render
  // always matches the server HTML.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(SCHOOL_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          setSchool(s);
          setStep("credentials");
        }
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Preload popular schools for the picker
  useEffect(() => {
    fetch("/api/schools?limit=8")
      .then((r) => r.json())
      .then((data) => setResults(data.schools || []))
      .catch(() => {});
  }, []);

  // Only show the demo school / demo account boxes when the seeded demo
  // school actually exists (SEED_DEMO_SCHOOL=1 in demo mode). Swallowing the
  // error keeps a clean-slate deployment looking clean.
  useEffect(() => {
    fetch("/api/auth/demo-status")
      .then((r) => r.json())
      .then((d) => setDemoAvailable(!!d.enabled))
      .catch(() => {});
  }, []);

  // Fresh account-status check whenever the credentials step opens — covers a
  // school picked from the directory AND one restored from localStorage, and
  // re-checks on every visit so a school frozen/deleted after the last pick is
  // caught before anyone submits credentials. (schoolStatus is reset by the
  // event handlers below; the effect only ever sets state from the callback.)
  useEffect(() => {
    if (step !== "credentials" || !school) return;
    let cancelled = false;
    fetch(`/api/schools?id=${encodeURIComponent(school.id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const match = (d.schools || [])[0];
        setSchoolStatus(match && match.status !== "active" ? match.status : "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step, school]);

  const searchSchools = useCallback((q) => {
    setSearching(true);
    fetch(`/api/schools?search=${encodeURIComponent(q)}&limit=8`)
      .then((r) => r.json())
      .then((data) => setResults(data.schools || []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, []);

  function onQueryChange(v) {
    setQuery(v);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => searchSchools(v), 250);
  }

  function selectSchool(s) {
    setSchool(s);
    setError("");
    setSchoolStatus(""); // the status effect re-checks and sets the real value
    try {
      localStorage.setItem(SCHOOL_KEY, JSON.stringify(s));
    } catch {}
    setStep("credentials");
  }

  function backToSchools() {
    setStep("school");
    setSchool(null);
    setSchoolStatus("");
    setError("");
  }

  function fillDemo(demo) {
    selectSchool(DEMO_SCHOOL);
    setRole(demo.role);
    setForm({ email: demo.email, password: demo.password });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Preserve a ?next= deep link (the proxy sets it when bouncing an
      // unauthenticated visitor off a portal). Read from the URL at submit
      // time — this page is statically prerendered, so touching
      // window.location during render would cause a hydration mismatch.
      const next = new URLSearchParams(window.location.search).get("next") || "";
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role, schoolId: school.id, next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.push(data.redirect || "/");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      {/* Brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-navy-950 p-12 lg:flex">
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-brand-600/30 blur-[120px]" />
        <Logo light />
        <div className="relative">
          <h2 className="text-3xl font-extrabold leading-tight text-white">
            Your school.
            <br />
            One portal.
          </h2>
          <p className="mt-4 max-w-md text-navy-300">
            Every school is a fully isolated tenant. Pick your school, then sign
            in — your data stays inside your school&apos;s portal.
          </p>
          <div className="mt-8 space-y-3">
            {ROLES.map((r) => (
              <div key={r.key} className="flex items-center gap-3 text-sm text-navy-200">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                  <r.icon className="h-4 w-4 text-brand-300" />
                </span>
                <span>
                  <strong className="text-white">{r.label}</strong> — {r.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 transition hover:text-navy-800"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>

          <div className="rounded-2xl border border-navy-200/70 bg-white p-8 shadow-xl shadow-navy-900/5">
            {/* STEP 1 — School picker */}
            {step === "school" && (
              <div className="animate-fade-up">
                <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
                  Which school are you from?
                </h1>
                <p className="mt-1.5 text-sm text-navy-500">
                  Find your school to open its portal. You&apos;ll then sign in with
                  the credentials your school gave you.
                </p>

                <div className="relative mt-6">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                  <input
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Search school name…"
                    autoFocus
                    className="w-full rounded-xl border border-navy-200 bg-white py-3 pl-11 pr-4 text-sm text-navy-800 outline-none transition placeholder:text-navy-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>

                <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {searching && (
                    <div className="flex items-center justify-center gap-2 py-6 text-sm text-navy-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                    </div>
                  )}
                  {!searching &&
                    results.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selectSchool(s)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/50 px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/60"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                          style={{ backgroundColor: s.brandColor || "#2563EB" }}
                        >
                          {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-navy-800">{s.name}</span>
                          <span className="block text-xs text-navy-400">School portal</span>
                        </span>
                        <ChevronRight className="h-4 w-4 text-navy-300 transition group-hover:text-brand-600" />
                      </button>
                    ))}
                  {!searching && results.length === 0 && (
                    <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-8 text-center">
                      <Building2 className="mx-auto h-8 w-8 text-navy-300" />
                      <p className="mt-3 text-sm font-medium text-navy-600">No school found</p>
                      <p className="mt-1 text-xs text-navy-400">
                        Your school may not have registered yet.
                      </p>
                    </div>
                  )}
                </div>

                {/* Demo school quick-entry — only when the demo school has
                    been seeded (SEED_DEMO_SCHOOL=1 in demo mode). */}
                {demoAvailable && (
                  <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700">
                      <Info className="h-3.5 w-3.5" /> Demo school
                    </p>
                    <button
                      onClick={() => selectSchool(DEMO_SCHOOL)}
                      className="mt-2.5 flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-xs shadow-sm ring-1 ring-navy-100 transition hover:ring-brand-300"
                    >
                      <span className="font-semibold text-navy-700">{DEMO_SCHOOL.name}</span>
                      <span className="text-navy-400">Tap to continue →</span>
                    </button>
                  </div>
                )}

                <p className="mt-6 text-center text-sm text-navy-500">
                  New school?{" "}
                  <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-500">
                    Register your school
                  </Link>
                </p>
              </div>
            )}

            {/* STEP 2 — Credentials */}
            {step === "credentials" && school && (
              <div className="animate-fade-up">
                <button
                  onClick={backToSchools}
                  className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-navy-400 transition hover:text-navy-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Change school
                </button>

                {/* Selected school */}
                <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: "#2563EB" }}
                  >
                    <School className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy-800">{school.name}</p>
                    <p className="text-xs text-navy-400">Signing into this school&apos;s portal</p>
                  </div>
                </div>

                {/* Frozen / deleted-school notice — shown BEFORE credentials are
                    typed so staff see why they can't sign in. The SUPER_ADMIN is
                    the exception (they can still sign in to reactivate or restore),
                    so the wording adapts to the selected portal role. */}
                {schoolStatus && (
                  <div
                    className={`mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 ${
                      schoolStatus === "frozen" ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"
                    }`}
                  >
                    <Info
                      className={`mt-0.5 h-4 w-4 shrink-0 ${schoolStatus === "frozen" ? "text-amber-600" : "text-rose-600"}`}
                    />
                    {schoolStatus === "frozen" ? (
                      <p className="text-sm leading-relaxed text-amber-900">
                        {role === "SUPER_ADMIN" ? (
                          <>
                            <strong>{school.name}</strong>&apos;s account is currently deactivated —
                            staff and student sign-ins are blocked. As the school administrator you
                            can still sign in to reactivate it.
                          </>
                        ) : (
                          <>
                            <strong>{school.name}</strong>&apos;s account is currently deactivated —
                            staff and student sign-ins are blocked. Please contact your school
                            administrator to reactivate it.
                          </>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm leading-relaxed text-rose-900">
                        {role === "SUPER_ADMIN" ? (
                          <>
                            <strong>{school.name}</strong> was deleted and is pending permanent
                            removal. Its data is kept for 30 days — as the school administrator you
                            can still sign in to restore it.
                          </>
                        ) : (
                          <>
                            <strong>{school.name}</strong> was deleted and is pending permanent
                            removal. Please contact your school administrator to restore it.
                          </>
                        )}
                      </p>
                    )}
                  </div>
                )}

                <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-navy-800">Welcome back</h1>
                <p className="mt-1.5 text-sm text-navy-500">Choose your portal and sign in.</p>

                {/* Role tabs */}
                <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-navy-50 p-1.5 sm:grid-cols-3 lg:grid-cols-6">
                  {ROLES.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRole(r.key)}
                      className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition ${
                        role === r.key
                          ? "bg-white text-brand-600 shadow-sm"
                          : "text-navy-500 hover:text-navy-700"
                      }`}
                    >
                      <r.icon className="h-4 w-4" />
                      {r.label}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">Email</span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="you@school.edu"
                        className="w-full rounded-xl border border-navy-200 bg-white py-3 pl-11 pr-4 text-sm text-navy-800 outline-none transition placeholder:text-navy-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">Password</span>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="Your password"
                        className="w-full rounded-xl border border-navy-200 bg-white py-3 pl-11 pr-4 text-sm text-navy-800 outline-none transition placeholder:text-navy-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      />
                    </div>
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" /> Signing in…
                      </>
                    ) : (
                      <>
                        Sign in as {ROLES.find((r) => r.key === role)?.label}
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>

                {/* Demo accounts — only when the demo school has been seeded
                    (SEED_DEMO_SCHOOL=1 in demo mode). */}
                {demoAvailable && (
                  <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700">
                      <Info className="h-3.5 w-3.5" /> Demo accounts
                    </p>
                    <div className="mt-3 space-y-2">
                      {DEMO_CREDENTIALS.map((d) => (
                        <button
                          key={d.role}
                          onClick={() => fillDemo(d)}
                          className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-xs shadow-sm ring-1 ring-navy-100 transition hover:ring-brand-300"
                        >
                          <span className="font-semibold text-navy-700">
                            {ROLES.find((r) => r.key === d.role)?.label}
                          </span>
                          <span className="flex items-center gap-2 text-navy-400">
                            <span>{d.email}</span>
                            <Check className="h-3 w-3 text-emerald-500" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Shared error (credentials step) */}
            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-navy-500">
            New school?{" "}
            <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-500">
              Register your school
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
