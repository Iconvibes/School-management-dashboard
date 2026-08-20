"use client";

import { HeartHandshake, KeyRound, Trash2, UserCog } from "lucide-react";

/**
 * Students & Fees tab — extracted from admin dashboard page.js.
 * Presentational: all data and handlers arrive through props.
 */
export default function StudentsTab({
  filteredStudents,
  isSuper,
  toggleFee,
  openReset,
  openEdit,
  setDeleteTarget,
  unlinkParent,
  setLinkModal,
  parentNameById,
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
      <div className="border-b border-navy-100 px-6 py-4">
        <h2 className="text-lg font-bold text-navy-800">Students, fees & parents</h2>
        <p className="text-sm text-navy-400">
          Toggle fee status, or link a parent/guardian so they can view report cards, attendance and pay fees online.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
              <th className="px-6 py-3">Student</th>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Password</th>
              <th className="px-6 py-3">Class Arm</th>
              <th className="px-6 py-3">Fee Status</th>
              <th className="px-6 py-3">Parent / Guardian</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s) => (
              <tr key={s.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-600">
                      {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-semibold text-navy-800">{s.name}</span>
                    <button
                      onClick={() => openReset(s)}
                      title={`Reset ${s.name}'s password`}
                      className="ml-1 rounded-lg p-1.5 text-navy-300 transition hover:bg-emerald-50 hover:text-emerald-600"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {isSuper && (
                      <>
                        <button
                          onClick={() => openEdit(s)}
                          title={`Edit ${s.name}'s details`}
                          className="rounded-lg p-1.5 text-navy-300 transition hover:bg-brand-50 hover:text-brand-600"
                        >
                          <UserCog className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          title={`Remove ${s.name} (left the school)`}
                          className="rounded-lg p-1.5 text-navy-300 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-navy-500">{s.email}</td>
                <td className="px-6 py-4">
                  {s.generatedPassword ? (
                    <code className="select-all rounded bg-navy-800 px-2 py-1 font-mono text-xs font-bold text-white">
                      {s.generatedPassword}
                    </code>
                  ) : (
                    <span className="text-xs text-navy-300">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-600">
                    {s.assignedClass || "Unassigned"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {isSuper ? (
                    <button onClick={() => toggleFee(s.id, s.feePaid)} title="Click to toggle fee status">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                          s.feePaid
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                            : "bg-rose-50 text-rose-700 ring-rose-600/20"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${s.feePaid ? "bg-emerald-500" : "bg-rose-500"}`} />
                        {s.feePaid ? "Paid" : "Unpaid"}
                      </span>
                    </button>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                        s.feePaid
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-rose-50 text-rose-700 ring-rose-600/20"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${s.feePaid ? "bg-emerald-500" : "bg-rose-500"}`} />
                      {s.feePaid ? "Paid" : "Unpaid"}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {s.parentId ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-brand-600/20">
                        <HeartHandshake className="h-3 w-3" />
                        {parentNameById[s.parentId] || "Linked"}
                      </span>
                      <button
                        onClick={() => unlinkParent(s.id)}
                        className="text-xs font-semibold text-navy-400 transition hover:text-rose-600"
                        title="Unlink parent"
                      >
                        Unlink
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setLinkModal(s.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-600 transition hover:border-brand-300 hover:text-brand-600"
                    >
                      <HeartHandshake className="h-3 w-3" />
                      Link parent
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredStudents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-navy-400">
                  No students found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
