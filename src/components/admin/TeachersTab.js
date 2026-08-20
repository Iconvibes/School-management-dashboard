"use client";

import { KeyRound, Pencil, Trash2, UserCog } from "lucide-react";
import { PayrollBadge } from "./utils";

/**
 * Teachers & Payroll tab — extracted from admin dashboard page.js.
 * Presentational: all data and handlers arrive through props.
 */
export default function TeachersTab({
  filteredTeachers,
  isSuper,
  togglePayroll,
  openReset,
  openScope,
  openEdit,
  setDeleteTarget,
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
      <div className="border-b border-navy-100 px-6 py-4">
        <h2 className="text-lg font-bold text-navy-800">Teacher directory & payroll</h2>
        <p className="text-sm text-navy-400">
          Click the status badge to toggle a teacher&apos;s compensation between Paid and Pending.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
              <th className="px-6 py-3">Teacher</th>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Teaches</th>
              <th className="px-6 py-3">Payroll</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeachers.map((t) => (
              <tr key={t.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                      {t.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-semibold text-navy-800">{t.name}</span>
                    <button
                      onClick={() => openReset(t)}
                      title={`Reset ${t.name}'s password`}
                      className="ml-1 rounded-lg p-1.5 text-navy-300 transition hover:bg-brand-50 hover:text-brand-600"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {isSuper && (
                      <button
                        onClick={() => openScope(t)}
                        title={`Assign ${t.name}'s subjects & arms`}
                        className="rounded-lg p-1.5 text-navy-300 transition hover:bg-violet-50 hover:text-violet-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(t)}
                      title={`Edit ${t.name}'s details`}
                      className="rounded-lg p-1.5 text-navy-300 transition hover:bg-brand-50 hover:text-brand-600"
                    >
                      <UserCog className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(t)}
                      title={`Remove ${t.name} (left the school)`}
                      className="rounded-lg p-1.5 text-navy-300 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 text-navy-500">{t.email}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap gap-1">
                      {(t.subjects?.length ? t.subjects : [t.assignedClass || "Unassigned"]).map((s) => (
                        <span
                          key={s}
                          className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-600/20"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <span className="text-[11px] font-medium text-navy-400">
                      {t.assignedClasses?.length
                        ? `${t.assignedClasses.length} arm${t.assignedClasses.length === 1 ? "" : "s"}: ${t.assignedClasses.join(", ")}`
                        : t.assignedClass || "No arms assigned"}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => togglePayroll(t.id, t.payrollStatus)}
                    title="Click to toggle payroll status"
                  >
                    <PayrollBadge status={t.payrollStatus} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredTeachers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-navy-400">
                  No teachers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
