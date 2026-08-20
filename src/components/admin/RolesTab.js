"use client";

import { ArrowLeftRight, Check, History, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { MANAGED_ROLES, ROLE_LABELS } from "@/lib/roles";
import { summarizeRolePermissions } from "@/lib/permissions";
import { ROLE_BADGES } from "./utils";

export default function RolesTab({
  staffList, roleAudit, roleDraft, roleSaving, session,
  openReset, requestRoleChange, setRoleDraft,
}) {
  return (
            <div className="mt-5 space-y-5 animate-fade-up">
              {/* What each role can do — rendered straight from ROLE_PERMISSIONS
                  (the single source of truth), so what the admin sees here is
                  exactly what the API enforces on every request. */}
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                    <ShieldCheck className="h-5 w-5 text-brand-600" />
                    What each role can do
                  </h2>
                  <p className="mt-0.5 text-sm text-navy-400">
                    The exact action list from <code className="rounded bg-navy-100 px-1 py-0.5 font-mono text-xs text-navy-600">ROLE_PERMISSIONS</code> —
                    a promotion grants exactly this, nothing more.
                  </p>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
                  {MANAGED_ROLES.map((role) => {
                    const summary = summarizeRolePermissions(role);
                    return (
                      <div
                        key={role}
                        className="rounded-xl border border-navy-100 bg-navy-50/40 p-4 transition hover:border-brand-200 hover:bg-brand-50/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${ROLE_BADGES[role] || "bg-navy-100 text-navy-600"}`}
                          >
                            {ROLE_LABELS[role] || role}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-navy-500 ring-1 ring-navy-200/70">
                            {summary.count} action{summary.count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="mt-3 space-y-3">
                          {summary.domains.map((d) => (
                            <div key={d.key}>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
                                {d.label}
                              </p>
                              <ul className="mt-1 space-y-1">
                                {d.actions.map((a) => (
                                  <li
                                    key={a.action}
                                    className="flex items-start gap-1.5 text-xs text-navy-700"
                                    title={a.action}
                                  >
                                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                    {a.label}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-navy-100 bg-navy-50/40 px-6 py-3 text-xs text-navy-500">
                  Row-level scoping applies on top of this list — a teacher&apos;s actions cover
                  only their assigned class arm, a parent only their own children.
                </div>
              </div>

              {/* Staff directory */}
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                    <UserCog className="h-5 w-5 text-brand-600" />
                    Staff roles &amp; access
                  </h2>
                  <p className="mt-0.5 text-sm text-navy-400">
                    Promote or demote staff between Super Admin, Bursar, Registrar and Teacher.
                    Changes apply immediately — the staff member will need to sign in again.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-6 py-3">Staff</th>
                        <th className="px-6 py-3">Current role</th>
                        <th className="px-6 py-3">New role</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.map((u) => {
                        const isYou = u.id === session.user.id;
                        const draft = roleDraft[u.id] ?? u.role;
                        const dirty = draft !== u.role;
                        return (
                          <tr key={u.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-sm font-bold text-white">
                                  {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="flex items-center gap-2 font-semibold text-navy-800">
                                    {u.name}
                                    {isYou && (
                                      <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy-500">
                                        You
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-navy-400">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${ROLE_BADGES[u.role] || "bg-navy-100 text-navy-600"}`}>
                                {ROLE_LABELS[u.role] || u.role}
                              </span>
                            </td>
                            <td className="px-6 py-3.5">
                              {isYou ? (
                                <span className="text-xs text-navy-300">—</span>
                              ) : (
                                <select
                                  value={draft}
                                  onChange={(e) => setRoleDraft((d) => ({ ...d, [u.id]: e.target.value }))}
                                  className="rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-sm font-medium text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                >
                                  {Object.keys(ROLE_LABELS).map((r) => (
                                    <option key={r} value={r}>
                                      {ROLE_LABELS[r]}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openReset(u)}
                                  title={`Reset ${u.name}'s password`}
                                  className="rounded-lg p-1.5 text-navy-300 transition hover:bg-brand-50 hover:text-brand-600"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </button>
                                {!isYou && (
                                  <button
                                    onClick={() => requestRoleChange(u, draft)}
                                    disabled={!dirty || roleSaving}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                    Change role
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {staffList.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-navy-400">
                            No staff accounts yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Audit trail */}
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                    <History className="h-5 w-5 text-brand-600" />
                    Role change audit trail
                  </h2>
                  <p className="text-sm text-navy-400">
                    Every promotion or demotion — who did it, and when.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-6 py-3">When</th>
                        <th className="px-6 py-3">Change</th>
                        <th className="px-6 py-3">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roleAudit.map((e) => (
                        <tr key={e.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                          <td className="whitespace-nowrap px-6 py-3.5 text-xs text-navy-500">
                            {new Date(e.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-navy-800">{e.targetName}</span>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${ROLE_BADGES[e.fromRole] || "bg-navy-100 text-navy-600"}`}>
                                {ROLE_LABELS[e.fromRole] || e.fromRole}
                              </span>
                              <ArrowLeftRight className="h-3.5 w-3.5 text-navy-300" />
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${ROLE_BADGES[e.toRole] || "bg-navy-100 text-navy-600"}`}>
                                {ROLE_LABELS[e.toRole] || e.toRole}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <p className="font-semibold text-navy-800">{e.actorName}</p>
                            <p className="text-xs text-navy-400">{ROLE_LABELS[e.actorRole] || e.actorRole}</p>
                          </td>
                        </tr>
                      ))}
                      {roleAudit.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-10 text-center text-navy-400">
                            No role changes yet — the first promotion or demotion will appear here.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
  );
}
