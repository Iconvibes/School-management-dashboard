"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

/**
 * Verify Email page — auto-verifies from token in URL query params.
 * Users arrive here by clicking the verification link in their email.
 */
export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setResult({ success: true, message: data.message });
        } else {
          setResult({ success: false, error: data.error || "Verification failed" });
        }
      } catch {
        setResult({ success: false, error: "Network error. Please try again." });
      }
      setLoading(false);
    }

    if (!token) {
      // Deferred to a microtask — synchronous setState in the effect body is
      // flagged as a cascading-render risk by the React Compiler lint.
      Promise.resolve().then(() => {
        setLoading(false);
        setResult({ success: false, error: "No verification token provided" });
      });
      return;
    }

    verify();
  }, [token]);

  // Auto-redirect after success
  useEffect(() => {
    if (!result?.success) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/admin/dashboard");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [result, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="max-w-md text-center">
        {/* Loading */}
        {loading && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            </div>
            <h2 className="text-xl font-bold text-navy-900">Verifying your email...</h2>
            <p className="mt-2 text-sm text-navy-500">
              Please wait while we confirm your email address.
            </p>
          </>
        )}

        {/* Success */}
        {!loading && result?.success && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-navy-900">Email verified!</h2>
            <p className="mt-2 text-sm text-navy-500">
              Your email has been verified. Your account is now fully activated.
            </p>
            <p className="mt-3 text-xs text-navy-400">
              Redirecting to your dashboard in {countdown}s...
            </p>
            <Link
              href="/admin/dashboard"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Go to Dashboard
            </Link>
          </>
        )}

        {/* Error */}
        {!loading && result?.error && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-navy-900">Verification failed</h2>
            <p className="mt-2 text-sm text-navy-500">{result.error}</p>
            <div className="mt-6 space-y-3">
              <Link
                href="/admin/dashboard"
                className="block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Go to Dashboard
              </Link>
              <p className="text-xs text-navy-400">
                You can request a new verification email from the dashboard banner.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
