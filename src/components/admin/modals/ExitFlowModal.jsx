"use client";

import { useState } from "react";
import {
  Loader2,
  AlertTriangle,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * School exit flow — SUPER_ADMIN deactivates & permanently deletes the
 * tenant. Two protected steps: an un-undoable warning, then an exit
 * survey (recorded before the wipe) so we know why the school left.
 */
const EXIT_REASONS = [
  "Too expensive for our budget",
  "Missing a feature we need",
  "Too complex / hard to learn",
  "Our school is closing",
  "Switching to another platform",
  "Other",
];

export default function ExitFlowModal({ inputCls }) {
  const {
    session,
    exitStep,
    setExitStep,
    submitExitSurvey,
    exitRestorableUntil,
    router,
  } = useAdminShell();

  const [exitReason, setExitReason] = useState("");
  const [exitFeedback, setExitFeedback] = useState("");
  const [exitSaving, setExitSaving] = useState(false);

  // Override submitExitSurvey with our local state
  const handleSubmit = async () => {
    if (!exitReason) return;
    setExitSaving(true);
    try {
      const res = await fetch("/api/school", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: exitReason, feedback: exitFeedback }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete the school");
      // Update parent state through the context
      setExitStep("done");
    } catch (err) {
      setExitStep(null);
    } finally {
      setExitSaving(false);
    }
  };

  if (!exitStep) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4 backdrop-blur-sm"
      onClick={() => exitStep === "confirm" && setExitStep(null)}
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {exitStep === "confirm" && (
          <div className="p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-bold text-navy-800">
                Delete your school permanently?
              </h2>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-navy-600">
              This will deactivate{" "}
              <strong>{session.school?.name}</strong> and delete all of its
              data — students, teachers, scores, attendance, fee records,
              timetables, report cards and archives.{" "}
              <strong className="text-rose-700">
                Your data is kept for a 30-day recovery window — sign back in
                as the super admin to restore everything before it is
                permanently removed.
              </strong>
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setExitStep(null)}
                className="flex-1 rounded-xl border border-navy-200 bg-white py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50"
              >
                Cancel
              </button>
              <button
                onClick={() => setExitStep("survey")}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
              >
                I understand — continue
              </button>
            </div>
          </div>
        )}

        {exitStep === "survey" && (
          <div className="max-h-[calc(100vh-2rem)] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-navy-800">
              We&apos;re sorry to see you go
            </h2>
            <p className="mt-1 text-sm text-navy-500">
              Help us improve — why is{" "}
              <strong>{session.school?.name}</strong> leaving Edutrack?
            </p>
            <div className="mt-4 space-y-2">
              {EXIT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setExitReason(r)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition ${
                    exitReason === r
                      ? "border-rose-400 bg-rose-50 text-rose-800"
                      : "border-navy-200 text-navy-700 hover:border-navy-300"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      exitReason === r
                        ? "border-rose-500"
                        : "border-navy-300"
                    }`}
                  >
                    {exitReason === r && (
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                    )}
                  </span>
                  {r}
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">
                Anything else? (optional)
              </span>
              <textarea
                value={exitFeedback}
                onChange={(e) => setExitFeedback(e.target.value)}
                rows={3}
                placeholder="Tell us what we could have done better…"
                className={inputCls}
              />
            </label>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setExitStep("confirm")}
                disabled={exitSaving}
                className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!exitReason || exitSaving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exitSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Yes, delete my school permanently
              </button>
            </div>
          </div>
        )}

        {exitStep === "done" && (
          <div className="p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h2 className="mt-3 text-lg font-bold text-navy-800">
              Your school has been deleted
            </h2>
            <p className="mt-1 text-sm text-navy-500">
              Nothing is gone yet — your data is kept for a{" "}
              <strong className="text-navy-700">
                30-day recovery period
              </strong>
              . Sign back in with your super admin account before{" "}
              <strong className="text-navy-700">
                {exitRestorableUntil
                  ? new Date(exitRestorableUntil).toLocaleDateString(
                      undefined,
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      }
                    )
                  : "the deadline"}
              </strong>{" "}
              to restore the account and keep everything. After that the data
              is permanently removed. Thank you for the feedback.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 font-semibold text-white transition hover:bg-navy-700"
            >
              Return to Edutrack
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
