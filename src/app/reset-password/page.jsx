"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowLeft, Loader2, CheckCircle, AlertTriangle, Eye, EyeOff } from "lucide-react";

const MIN_LENGTH = 6;

/**
 * Reset Password page — step 2 of the password reset flow.
 * User enters a new password after clicking the reset link.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(3);

  // Redirect to login after success
  useEffect(() => {
    if (!result?.success) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/login");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [result, router]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-navy-900">Invalid reset link</h2>
          <p className="mt-2 text-sm text-navy-500">
            This password reset link is invalid or missing a token. Please request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Request new reset link
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters`);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setResult({ success: true, message: data.message });
      } else {
        setError(data.error || "Failed to reset password");
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
            Create a new password
          </h1>
          <p className="mt-4 text-base text-navy-300">
            Choose a strong password that you haven&apos;t used before. Make sure it&apos;s
            at least {MIN_LENGTH} characters long.
          </p>
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-navy-300">
              <strong className="text-white">Security tip:</strong> Use a
              combination of letters, numbers, and symbols. Avoid using your
              name or common words.
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

          {/* Success state */}
          {result?.success ? (
            <div className="space-y-6">
              <div className="flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-navy-900">
                  Password updated!
                </h2>
                <p className="mt-2 text-sm text-navy-500">
                  Your password has been changed successfully. You can now sign in
                  with your new password.
                </p>
                <p className="mt-3 text-xs text-navy-400">
                  Redirecting to login in {countdown}s...
                </p>
              </div>
              <Link
                href="/login"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Sign in now
              </Link>
            </div>
          ) : (
            /* Form */
            <>
              <h2 className="text-2xl font-bold text-navy-900">Set new password</h2>
              <p className="mt-2 text-sm text-navy-500">
                Enter your new password below.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-navy-700">
                    New password
                  </label>
                  <div className="relative mt-1.5">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Lock className="h-4 w-4 text-navy-400" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      autoFocus
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={`At least ${MIN_LENGTH} characters`}
                      className="block w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-10 pr-11 text-sm text-navy-800 placeholder:text-navy-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-navy-400 hover:text-navy-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {password.length > 0 && password.length < MIN_LENGTH && (
                    <p className="mt-1 text-xs text-amber-600">
                      {MIN_LENGTH - password.length} more character{MIN_LENGTH - password.length !== 1 ? "s" : ""} needed
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-navy-700">
                    Confirm new password
                  </label>
                  <div className="relative mt-1.5">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Lock className="h-4 w-4 text-navy-400" />
                    </div>
                    <input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Type your password again"
                      className="block w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-10 pr-4 text-sm text-navy-800 placeholder:text-navy-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || password.length < MIN_LENGTH || password !== confirmPassword}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {loading ? "Updating password..." : "Update password"}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
