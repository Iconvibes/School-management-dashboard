"use client";

import { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  BellRing,
  RotateCcw,
} from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";
import {
  DEFAULT_REMINDER_MESSAGE,
  DEFAULT_STUDENT_REMINDER_MESSAGE,
} from "@/lib/notifications";

const inputCls =
  "w-full rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Send fee reminder modal — confirm or show the send result.
 * Parents get the first message; students without a parent get the second.
 */
export default function FeeReminderModal() {
  const {
    reminderModal,
    setReminderModal,
    reminderSending,
    reminderResult,
    setReminderResult,
    reminderMessage,
    setReminderMessage,
    reminderStudentMessage,
    setReminderStudentMessage,
    sendReminders,
    loadReminderTemplates,
    feeTotals,
    feeLedger,
    naira,
  } = useAdminShell();

  const [msg, setMsg] = useState(reminderMessage);
  const [stdMsg, setStdMsg] = useState(reminderStudentMessage);

  return (
    <Modal
      open={reminderModal !== null}
      onClose={() => setReminderModal(null)}
      title={
        reminderModal === "all" ? "Send fee reminders" : "Send fee reminder"
      }
    >
      {reminderSending ? (
        <div className="flex flex-col items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p className="mt-3 text-sm font-semibold text-navy-600">
            Sending reminders…
          </p>
        </div>
      ) : reminderResult ? (
        <div className="space-y-4">
          {reminderResult.sent?.length > 0 ? (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">
                    {reminderResult.sent.length} reminder
                    {reminderResult.sent.length === 1 ? "" : "s"} sent
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Parents have been notified via the notification system —
                    each send is logged in the audit trail below.
                  </p>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-navy-100">
                {reminderResult.sent.map((s) => (
                  <div
                    key={s.studentId}
                    className="flex items-center justify-between gap-3 border-b border-navy-50 px-4 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-800">
                        {s.studentName}
                      </p>
                      <p className="truncate text-xs text-navy-400">
                        to {s.recipient?.name}
                        {s.recipient?.kind === "student" && (
                          <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                            student · no parent
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-amber-600">
                      {naira(s.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No reminders were sent.{" "}
              {reminderResult.skipped?.length > 0
                ? `${reminderResult.skipped.length} student${reminderResult.skipped.length === 1 ? "" : "s"} ${reminderResult.skipped.length === 1 ? "has" : "have"} an outstanding balance but no linked parent account.`
                : "The selected students have no outstanding balance."}
            </div>
          )}
          {reminderResult.skipped?.length > 0 && (
            <p className="text-xs text-navy-400">
              Skipped {reminderResult.skipped.length} student
              {reminderResult.skipped.length === 1 ? "" : "s"} without a linked
              parent.
            </p>
          )}
          <button
            onClick={() => setReminderModal(null)}
            className="inline-flex w-full items-center justify-center rounded-xl bg-navy-800 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-navy-600">
            {reminderModal === "all" ? (
              <>
                This will notify the parent of{" "}
                <strong>
                  {feeTotals?.remindable ?? 0} student
                  {(feeTotals?.remindable ?? 0) === 1 ? "" : "s"}
                </strong>{" "}
                with an outstanding balance or unpaid fees. Students without a
                linked parent are reminded directly.
              </>
            ) : (
              <>
                Send a fee reminder to the parent of{" "}
                <strong>
                  {feeLedger.find((l) => l.studentId === reminderModal)?.name}
                </strong>{" "}
                (
                {naira(
                  feeLedger.find((l) => l.studentId === reminderModal)
                    ?.balance
                )}{" "}
                outstanding).
              </>
            )}
          </p>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-navy-700">
                Message to parents
                <button
                  type="button"
                  onClick={() => {
                    setMsg(DEFAULT_REMINDER_MESSAGE);
                    setReminderMessage(DEFAULT_REMINDER_MESSAGE);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 transition hover:text-violet-500"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to default
                </button>
              </span>
              <textarea
                value={msg}
                onChange={(e) => {
                  setMsg(e.target.value);
                  setReminderMessage(e.target.value);
                }}
                rows={6}
                maxLength={4000}
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-navy-700">
                Message to students (no linked parent)
                <button
                  type="button"
                  onClick={() => {
                    setStdMsg(DEFAULT_STUDENT_REMINDER_MESSAGE);
                    setReminderStudentMessage(
                      DEFAULT_STUDENT_REMINDER_MESSAGE
                    );
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 transition hover:text-violet-500"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to default
                </button>
              </span>
              <textarea
                value={stdMsg}
                onChange={(e) => {
                  setStdMsg(e.target.value);
                  setReminderStudentMessage(e.target.value);
                }}
                rows={5}
                maxLength={4000}
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </label>
            <span className="block text-[11px] leading-relaxed text-navy-400">
              Placeholders (both messages):{" "}
              <code className="rounded bg-navy-100 px-1 py-0.5">
                {"{name}"}
              </code>{" "}
              recipient ·{" "}
              <code className="rounded bg-navy-100 px-1 py-0.5">
                {"{student}"}
              </code>{" "}
              student ·{" "}
              <code className="rounded bg-navy-100 px-1 py-0.5">
                {"{class}"}
              </code>{" "}
              class ·{" "}
              <code className="rounded bg-navy-100 px-1 py-0.5">
                {"{balance}"}
              </code>{" "}
              amount ·{" "}
              <code className="rounded bg-navy-100 px-1 py-0.5">
                {"{school}"}
              </code>{" "}
              school name
            </span>
          </div>
          <p className="rounded-xl bg-violet-50 px-4 py-3 text-xs text-violet-700 ring-1 ring-violet-600/20">
            <BellRing className="mr-1 inline h-3.5 w-3.5" />
            Parents get the first message on their portal; students without a
            parent get the second on their dashboard. What you send is saved as
            this school&apos;s default — term-rollover reminders reuse it.
            Every send is recorded in the audit trail.
          </p>
          <button
            onClick={() => sendReminders(reminderModal)}
            disabled={reminderSending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500 disabled:opacity-60"
          >
            {reminderSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}
            Send reminder{reminderModal === "all" ? "s" : ""}
          </button>
        </div>
      )}
    </Modal>
  );
}
