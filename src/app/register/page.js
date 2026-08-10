"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, Loader2, User, Mail, Lock } from "lucide-react";
import Logo from "@/components/Logo";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white py-3 pl-11 pr-4 text-sm text-navy-800 outline-none transition placeholder:text-navy-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function Field({ icon: Icon, label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-navy-700">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={inputCls}
        />
      </div>
    </label>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    schoolName: "",
    adminName: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolName: form.schoolName,
          adminName: form.adminName,
          email: form.email,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      router.push(data.redirect || "/onboarding");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      {/* Brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-navy-950 p-12 lg:flex">
        <div className="pointer-events-none absolute -top-32 right-0 h-96 w-96 rounded-full bg-brand-600/30 blur-[120px]" />
        <Logo light />
        <div className="relative">
          <Building2 className="h-12 w-12 text-brand-400" />
          <h2 className="mt-6 text-3xl font-extrabold leading-tight text-white">
            Your school, running in the cloud.
          </h2>
          <p className="mt-4 max-w-md text-navy-300">
            Register your institution and instantly get a fully isolated tenant
            with report cards, grading matrices and payroll.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-navy-200">
            <li>• Multi-tenant architecture — your data stays yours</li>
            <li>• Set up classes, sessions and branding next</li>
            <li>• No credit card required to start</li>
          </ul>
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
            <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">
              Register your school
            </h1>
            <p className="mt-1.5 text-sm text-navy-500">
              Create the school tenant and your super admin account.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field
                icon={Building2}
                label="School name"
                value={form.schoolName}
                onChange={set("schoolName")}
                placeholder="Greenfield International School"
              />
              <Field
                icon={User}
                label="Admin full name"
                value={form.adminName}
                onChange={set("adminName")}
                placeholder="Jane Doe"
              />
              <Field
                icon={Mail}
                label="Admin email"
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="admin@school.edu"
              />
              <Field
                icon={Lock}
                label="Password"
                type="password"
                value={form.password}
                onChange={set("password")}
                placeholder="At least 6 characters"
              />
              <Field
                icon={Lock}
                label="Confirm password"
                type="password"
                value={form.confirm}
                onChange={set("confirm")}
                placeholder="Repeat password"
              />
              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Creating tenant…
                  </>
                ) : (
                  <>
                    Create school <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-navy-500">
            Already registered?{" "}
            <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-500">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
