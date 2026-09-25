"use client";

import {
  Loader2,
  BookOpen,
  ClipboardList,
  AlertTriangle,
  Check,
} from "lucide-react";
import Modal from "@/components/Modal";
import { useAdminShell } from "@/components/admin/context/AdminContext";

/**
 * Assign subjects & arms — edit a teacher's teaching scope (subjects ×
 * class arms). Saves through PATCH; the SUPER_ADMIN gate + field-level
 * mayEditUser guard re-validate, and the teacher portal enforces the
 * new scope on their next request (bouncing a stale selection).
 */
export default function ScopeEditorModal() {
  const {
    scopeTarget,
    setScopeTarget,
    scopeDraft,
    setScopeDraft,
    scopeSaving,
    saveScope,
    session,
    subjects,
  } = useAdminShell();

  return (
    <Modal
      open={scopeTarget !== null}
      onClose={() => setScopeTarget(null)}
      title="Assign subjects & arms"
    >
      {scopeTarget && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
              {scopeTarget.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-navy-800">
                {scopeTarget.name}
              </p>
              <p className="truncate text-xs text-navy-400">
                {scopeTarget.email}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-navy-700">
              <BookOpen className="h-4 w-4 text-violet-600" /> Subjects they
              teach
            </span>
            <div className="flex flex-wrap gap-1.5">
              {subjects.map((s) => {
                const on = scopeDraft.subjects.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setScopeDraft((d) => ({
                        ...d,
                        subjects: on
                          ? d.subjects.filter((x) => x !== s)
                          : [...d.subjects, s],
                      }))
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                      on
                        ? "bg-violet-600 text-white shadow-sm"
                        : "bg-white text-navy-600 ring-1 ring-navy-200 hover:ring-violet-300"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-navy-700">
                <ClipboardList className="h-4 w-4 text-brand-600" /> Class
                arms they teach
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setScopeDraft((d) => ({
                      ...d,
                      assignedClasses: [
                        ...(session.school?.activeArms || []),
                      ],
                      assignedClass:
                        (session.school?.activeArms || [])[0] || "",
                    }))
                  }
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-100"
                >
                  All arms
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScopeDraft((d) => ({
                      ...d,
                      assignedClasses: [],
                      assignedClass: "",
                    }))
                  }
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-navy-500 ring-1 ring-navy-200 transition hover:bg-navy-50"
                >
                  Clear
                </button>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(session.school?.activeArms || []).map((arm) => {
                const on = scopeDraft.assignedClasses.includes(arm);
                return (
                  <button
                    key={arm}
                    type="button"
                    onClick={() =>
                      setScopeDraft((d) => {
                        const onArm = d.assignedClasses.includes(arm);
                        return {
                          ...d,
                          assignedClasses: onArm
                            ? d.assignedClasses.filter((x) => x !== arm)
                            : [...d.assignedClasses, arm],
                          assignedClass:
                            onArm && d.assignedClass === arm
                              ? ""
                              : d.assignedClass || arm,
                        };
                      })
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                      on
                        ? "bg-brand-600 text-white shadow-sm"
                        : "bg-white text-navy-600 ring-1 ring-navy-200 hover:ring-brand-300"
                    }`}
                  >
                    {arm}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-navy-400">
              {scopeDraft.subjects.length} subject
              {scopeDraft.subjects.length === 1 ? "" : "s"} ×{" "}
              {scopeDraft.assignedClasses.length} arm
              {scopeDraft.assignedClasses.length === 1 ? "" : "s"} selected.
            </p>
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Takes effect instantly — if a teacher is currently viewing a class
            arm you remove, their dashboard switches them to a valid arm on the
            next request.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setScopeTarget(null)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-navy-200 px-4 py-2.5 text-sm font-semibold text-navy-600 transition hover:bg-navy-50"
            >
              Cancel
            </button>
            <button
              onClick={saveScope}
              disabled={scopeSaving}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:opacity-60"
            >
              {scopeSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save scope
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
