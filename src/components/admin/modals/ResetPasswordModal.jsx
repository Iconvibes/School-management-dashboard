"use client";

import { Loader2, KeyRound, Check, Copy, CheckCircle2 } from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Reset password modal — change a user's password (admin-initiated).
 */
export default function ResetPasswordModal() {
  const {
    resetTarget,
    setResetTarget,
    resetNewPassword,
    setResetNewPassword,
    resetDone,
    resetCopied,
    resetPassword,
    copyNewPassword,
    resetLoading,
  } = useAdminShell();

  return (
    <Modal
      open={resetTarget !== null}
      onClose={() => setResetTarget(null)}
      title="Reset password"
    >
      {resetTarget && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
              {resetTarget.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-navy-800">
                {resetTarget.name}
              </p>
              <p className="truncate text-xs text-navy-400">
                {resetTarget.email} · {resetTarget.assignedClass || "Unassigned"}
              </p>
            </div>
          </div>

          {resetDone ? (
            <div className="animate-fade-up space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Password reset successfully
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  The old password no longer works. Hand this new one to{" "}
                  {resetTarget.name.split(" ")[0]} — they can change it after
                  logging in.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-navy-900 px-4 py-3">
                <KeyRound className="h-5 w-5 shrink-0 text-brand-300" />
                <code className="min-w-0 flex-1 select-all break-all font-mono text-lg font-bold tracking-wide text-white">
                  {resetDone.newPassword}
                </code>
                <button
                  onClick={copyNewPassword}
                  title="Copy to clipboard"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  {resetCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {resetCopied ? "Copied" : "Copy"}
                </button>
              </div>

              <button
                onClick={() => setResetTarget(null)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 font-semibold text-white transition hover:bg-navy-700"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-navy-700">
                  New password
                </span>
                <input
                  type="text"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Leave blank to auto-generate a strong one"
                  className={inputCls}
                />
                <span className="mt-1.5 block text-xs text-navy-400">
                  Must be at least 6 characters. Auto-generated passwords skip
                  confusing characters (0/O, 1/l/I).
                </span>
              </label>
              <button
                onClick={resetPassword}
                disabled={resetLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
              >
                {resetLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <KeyRound className="h-5 w-5" />
                )}
                Reset password
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
