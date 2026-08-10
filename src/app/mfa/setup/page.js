"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Logo from "@/components/Logo";

/**
 * Forced MFA self-enrollment (staff). Reachable after the password step of a
 * staff login without MFA, or straight after school registration — the
 * browser holds the 10-minute enroll ticket, NOT a session.
 *
 * Step 1: add the secret to an authenticator app (copy-paste the otpauth URI
 * — no QR dependency) and enter a code. Step 2: the code is verified against
 * the ticket-bound secret and the real session is issued; the ?next= deep
 * link survives via the validated redirect.
 */
export default function MfaSetupPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/mfa/setup");
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setExpired(true);
          setError(data.error || "Could not start MFA setup");
          return;
        }
        setSecret(data.secret);
        setOtpauthUrl(data.otpauthUrl);
      } catch {
        if (alive) setExpired(true);
      } finally {
        if (alive) setLoadingSetup(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(otpauthUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function confirm(e) {
    e.preventDefault();
    if (confirming) return;
    setError("");
    setConfirming(true);
    try {
      // ?next= is read at submit time — this page is statically prerendered,
      // so window.location during render would cause a hydration mismatch.
      const next = new URLSearchParams(window.location.search).get("next") || "";
      const res = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      router.push(data.redirect || "/");
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-navy-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-2xl border border-navy-200/70 bg-white p-8 shadow-xl shadow-navy-900/5">
          {loadingSetup ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-navy-300" />
            </div>
          ) : expired ? (
            <div className="text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
              <h1 className="mt-4 text-xl font-extrabold tracking-tight text-navy-800">
                This setup session has expired
              </h1>
              <p className="mt-2 text-sm text-navy-500">{error}</p>
              <Link
                href="/login"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
              >
                Sign in again
              </Link>
            </div>
          ) : (
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" /> Required for staff accounts
              </span>
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-navy-800">
                Set up two-factor authentication
              </h1>
              <p className="mt-1.5 text-sm text-navy-500">
                Add this account to an authenticator app (Google Authenticator,
                Authy, 1Password…) — then confirm with a code. You&apos;ll need it
                every time you sign in.
              </p>

              <div className="mt-6 rounded-xl border border-navy-100 bg-navy-50/60 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-navy-400">
                  <Smartphone className="h-3.5 w-3.5" /> 1 · Add to your authenticator
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2.5 text-xs font-semibold text-navy-700 ring-1 ring-navy-100">
                    {secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-navy-700"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy URI"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-navy-400">
                  The full otpauth:// link is on your clipboard — paste it into your
                  authenticator app. Manual entry also works with the secret above.
                </p>
              </div>

              <div className="mt-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-navy-400">
                  <ShieldCheck className="h-3.5 w-3.5" /> 2 · Confirm with a code
                </div>
                <form onSubmit={confirm} className="mt-3 space-y-4">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    autoFocus
                    className="w-full rounded-xl border border-navy-200 bg-white py-3 pl-4 pr-4 text-center text-2xl font-bold tracking-[0.5em] text-navy-800 outline-none transition placeholder:text-navy-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                  {error && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={confirming || code.length !== 6}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {confirming ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Enable & continue <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-navy-500">
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-500">
            Sign in instead
          </Link>
        </p>
      </div>
    </main>
  );
}
