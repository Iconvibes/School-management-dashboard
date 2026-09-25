"use client";

import { useState, useEffect } from "react";
import { Mail, CheckCircle, X, Loader2, AlertTriangle } from "lucide-react";

/**
 * EmailVerificationBanner — Shows at the top of the admin dashboard when
 * the school's email has not been verified. Includes a "Resend" button.
 *
 * Hidden when: email is already verified, or dismissed.
 */
export default function EmailVerificationBanner() {
  const [verified, setVerified] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/billing/subscription");
        if (res.ok && !cancelled) {
          const data = await res.json();
          // Use a simple heuristic: if the school has been created but
          // emailVerified is not set, it needs verification
          setVerified(data.emailVerified === true);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    check();
    return () => { cancelled = true; };
  }, []);

  async function handleResend() {
    setSending(true);
    try {
      const res = await fetch("/api/auth/send-verification", { method: "POST" });
      if (res.ok) {
        setSent(true);
      }
    } catch {}
    setSending(false);
  }

  if (loading || verified === true || verified === null || dismissed) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
            <Mail className="h-4.5 w-4.5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-200">
              Email not verified
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Verify your email to unlock all features including report card delivery and notifications.
            </p>
            {sent && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle className="h-3 w-3" />
                Verification email sent! Check your inbox.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!sent && (
            <button
              onClick={handleResend}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-amber-400 disabled:opacity-60"
            >
              {sending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Mail className="h-3 w-3" />
              )}
              {sending ? "Sending..." : "Resend Email"}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg p-1.5 text-gray-500 hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
