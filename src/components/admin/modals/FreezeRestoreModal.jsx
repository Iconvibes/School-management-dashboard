"use client";

import { useState } from "react";
import { Loader2, Snowflake, RefreshCw } from "lucide-react";
import { useAdminShell } from "@/components/admin/context/AdminContext";

/**
 * Freeze / reactivate / restore confirm modal.
 * Freezing blocks all logins while keeping data;
 * restoring revives a deleted school inside its 30-day recovery window.
 *
 * This component manages its own loading state since `flipSchoolStatus`
 * reloads the page on success, making external loading state unnecessary
 * in the success path (but needed for error handling).
 */
export default function FreezeRestoreModal() {
  const { freezeModal, setFreezeModal, flipSchoolStatus, session } =
    useAdminShell();
  const [busy, setBusy] = useState(false);

  if (!freezeModal) return null;

  const handleFlip = async () => {
    setBusy(true);
    try {
      const action =
        freezeModal === "freeze"
          ? "deactivate"
          : freezeModal === "restore"
            ? "restore"
            : "reactivate";
      await flipSchoolStatus(action);
      // flipSchoolStatus calls window.location.reload() on success
    } catch {
      // Error was already shown as toast by flipSchoolStatus
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4 backdrop-blur-sm"
      onClick={() => !busy && setFreezeModal(null)}
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                freezeModal === "freeze"
                  ? "bg-amber-100 text-amber-600"
                  : "bg-emerald-100 text-emerald-600"
              }`}
            >
              {freezeModal === "freeze" ? (
                <Snowflake className="h-5 w-5" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
            </span>
            <h2 className="text-lg font-bold text-navy-800">
              {freezeModal === "freeze"
                ? `Freeze ${session.school?.name}?`
                : freezeModal === "restore"
                  ? `Restore ${session.school?.name}?`
                  : `Reactivate ${session.school?.name}?`}
            </h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-navy-600">
            {freezeModal === "freeze" ? (
              <>
                All staff and student logins will be blocked immediately.{" "}
                <strong>No data is deleted</strong> — students, teachers,
                scores, fees and timetables are all kept safe, and you can
                reactivate the account at any time by signing back in.
              </>
            ) : freezeModal === "restore" ? (
              <>
                This school was deleted, but its data is fully intact.
                Restoring revives the account and everything in it — all logins
                resume working immediately.
              </>
            ) : (
              <>
                All staff and student logins will resume working immediately.
                Your data has been kept safe while deactivated — nothing was
                deleted.
              </>
            )}
          </p>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => setFreezeModal(null)}
              disabled={busy}
              className="flex-1 rounded-xl border border-navy-200 bg-white py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleFlip}
              disabled={busy}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
                freezeModal === "freeze"
                  ? "bg-amber-500 hover:bg-amber-400"
                  : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : freezeModal === "freeze" ? (
                <Snowflake className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {freezeModal === "freeze"
                ? "Freeze account"
                : freezeModal === "restore"
                  ? "Restore school"
                  : "Reactivate school"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
