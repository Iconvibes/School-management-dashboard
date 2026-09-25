"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

/**
 * Forgot Password page — step 1 of the password reset flow.
 * User enters their email, receives a reset link (logged in dev mode).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { success, message, resetUrl? }
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setResult({
          success: true,
          message: data.message,
          resetUrl: data.resetUrl, // only in dev mode
        });
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left panel — branding */}
      <div className="hidden w-1/2 bg-navy-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 transition hover:text-white">
            ← Back to home
          </Link>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-bold text-white leading-tight">
            Forgot your password?
          </h1>
          <p className="mt-4 text-base text-navy-300">
            No worries. Enter your email and we&apos;ll send you a link to reset your
            password. The link expires in 1 hour.
          </p>
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-navy-300">
              <strong className="text-white">Tip:</strong> Use the same email
              address you use to sign in to your school&apos;s Edutrack portal.
            </p>
          </div>
        </div>
        <p className="text-xs text-navy-500">
          © {new Date().getFullYear()} EduTrack. All rights reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* Back link (mobile) */}
          <Link
            href="/login"
            className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 transition hover:text-navy-700 lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>

          {/* Logo (mobile) */}
          <div className="mb-8 lg:hidden">
            <span className="text-xl font-bold text-navy-900">
              Edu<span className="text-brand-600">track</span>
            </span>
          </div>

          <h2 className="text-2xl font-bold text-navy-900">Reset your password</h2>
          <p className="mt-2 text-sm text-navy-500">
            Enter the email address associated with your account and we&apos;ll send
            you a link to reset your password.
          </p>

          {/* Success state */}
          {result?.success ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      Check your email
                    </p>
                    <p className="mt-1 text-sm text-emerald-700">
                      {result.message}
                    </p>
                  </div>
                </div>
              </div>

              {/* Dev mode: show the reset URL directly */}
              {result.resetUrl && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-2">
                    🔧 Development Mode
                  </p>
                  <p className="text-sm text-amber-800 mb-3">
                    Copy this link and open it in your browser:
                  </p>
                  <a
                    href={result.resetUrl}
                    className="block rounded-lg bg-amber-100 p-3 text-sm font-mono text-amber-900 break-all hover:bg-amber-200 transition"
                  >
                    {window.location.origin}{result.resetUrl}
                  </a>
                </div>
              )}

              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </div>
          ) : (
            /* Form */
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-navy-700">
                  Email address
                </label>
                <div className="relative mt-1.5">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Mail className="h-4 w-4 text-navy-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.edu"
                    className="block w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-10 pr-4 text-sm text-navy-800 placeholder:text-navy-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {loading ? "Sending reset link..." : "Send reset link"}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
