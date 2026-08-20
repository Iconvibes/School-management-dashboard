"use client";

import { Download, Eye, EyeOff, KeyRound, Printer, Search, Users } from "lucide-react";
import { ROLE_BADGES } from "./utils";
import { ROLE_LABELS } from "@/lib/roles";

export default function LoginsTab({
  loginMode, setLoginMode, loginUsers, loginStudents, loginStudentsLoaded,
  loginStudentsSearch, setLoginStudentsSearch, loginExportClass, setLoginExportClass,
  revealedPasswords, loginClasses, filteredLoginStudents,
  openStaffPrintSheet, openStudentPrintSheet, exportStaffLoginsCsv,
  exportParentLoginsCsv, exportStudentLoginsCsv, openReset, toggleRevealPassword,
}) {
  return (
            <div className="mt-5 space-y-5 animate-fade-up">
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                        <KeyRound className="h-5 w-5 text-brand-600" />
                        Login Details
                      </h2>
                      <p className="mt-0.5 text-sm text-navy-400">
                        Look up or reset any account&apos;s login — staff, parents and
                        students, all from one place.
                      </p>
                    </div>
                    <div className="flex w-fit gap-1 rounded-xl bg-navy-100 p-1">
                      <button
                        onClick={() => setLoginMode("staff")}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                          loginMode === "staff" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                        }`}
                      >
                        Staff &amp; parents
                      </button>
                      <button
                        onClick={() => setLoginMode("students")}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                          loginMode === "students" ? "bg-white text-navy-800 shadow-sm" : "text-navy-500 hover:text-navy-700"
                        }`}
                      >
                        Students
                      </button>
                    </div>
                  </div>
                </div>

                {loginMode === "staff" ? (
                  <div>
                    {/* Staff & parents — count plus bulk CSV export of logins
                        for printing/distribution */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-6 py-3">
                      <p className="text-xs font-medium text-navy-400">
                        {loginUsers.length} staff &amp; parent account{loginUsers.length === 1 ? "" : "s"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {loginUsers.length > 0 && (
                          <button
                            onClick={openStaffPrintSheet}
                            title="Open a printable sheet with every staff & parent login — name and password side by side"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600"
                          >
                            <Printer className="h-3.5 w-3.5" /> Print sheet
                          </button>
                        )}
                        {loginUsers.some((u) => u.role === "PARENT") && (
                          <button
                            onClick={exportParentLoginsCsv}
                            title="Download parent logins — the password is any linked child's full name"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600"
                          >
                            <Users className="h-3.5 w-3.5" /> Export parent logins
                          </button>
                        )}
                        {loginUsers.length > 0 && (
                          <button
                            onClick={exportStaffLoginsCsv}
                            title="Download name, email, role, class and password for every staff & parent account"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600"
                          >
                            <Download className="h-3.5 w-3.5" /> Export CSV
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-navy-100 bg-navy-50/60 text-left text-xs font-semibold uppercase tracking-wider text-navy-400">
                          <th className="px-6 py-3">User</th>
                          <th className="px-6 py-3">Role</th>
                          <th className="px-6 py-3">Class</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loginUsers.map((u) => (
                          <tr key={u.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-sm font-bold text-white">
                                  {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-navy-800">{u.name}</p>
                                  <p className="text-xs text-navy-400">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${ROLE_BADGES[u.role] || "bg-navy-100 text-navy-600"}`}>
                                {ROLE_LABELS[u.role] || u.role}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-xs text-navy-500">
                              {u.assignedClass || (u.assignedClasses?.length ? u.assignedClasses.join(", ") : "—")}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <button
                                onClick={() => openReset(u)}
                                title={`Reset ${u.name}'s password`}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-700"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                                Reset password
                              </button>
                            </td>
                          </tr>
                        ))}
                        {loginUsers.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-6 py-10 text-center text-navy-400">
                              No accounts yet beyond the super admin.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Student search — name / email / class arm, plus bulk
                        CSV export of logins for printing/distribution */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 px-6 py-3">
                      <div className="relative w-full max-w-sm flex-1">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                        <input
                          value={loginStudentsSearch}
                          onChange={(e) => setLoginStudentsSearch(e.target.value)}
                          placeholder="Search students…"
                          className="w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-10 pr-4 text-sm text-navy-800 outline-none transition placeholder:text-navy-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                        />
                      </div>
                      {loginClasses.length > 0 && (
                        <select
                          value={loginExportClass}
                          onChange={(e) => setLoginExportClass(e.target.value)}
                          title="Export one class arm at a time — pick a class to limit the CSV to those students"
                          className="rounded-xl border border-navy-200 bg-white px-3 py-2.5 text-xs font-semibold text-navy-700 outline-none transition hover:border-brand-400 focus:border-brand-500"
                        >
                          <option value="">All classes</option>
                          {loginClasses.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      )}
                      {loginStudents.length > 0 && (
                        <button
                          onClick={openStudentPrintSheet}
                          title="Open a printable sheet with every student's login — name and password side by side"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600"
                        >
                          <Printer className="h-3.5 w-3.5" /> Print sheet
                        </button>
                      )}
                      {loginStudents.length > 0 && (
                        <button
                          onClick={exportStudentLoginsCsv}
                          title={
                            loginExportClass
                              ? `Download name, email, class and password for every student in ${loginExportClass}`
                              : "Download name, email, class and password for every student"
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600"
                        >
                          <Download className="h-3.5 w-3.5" /> Export CSV
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-navy-100 bg-navy-50/60 text-left text-xs font-semibold uppercase tracking-wider text-navy-400">
                            <th className="px-6 py-3">Student</th>
                            <th className="px-6 py-3">Email</th>
                            <th className="px-6 py-3">Class Arm</th>
                            <th className="px-6 py-3">Password</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLoginStudents.map((s) => {
                            const revealed = revealedPasswords.has(s.id);
                            return (
                              <tr key={s.id} className="border-b border-navy-50 transition hover:bg-navy-50/40">
                                <td className="px-6 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-600">
                                      {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                    </div>
                                    <p className="font-semibold text-navy-800">{s.name}</p>
                                  </div>
                                </td>
                                <td className="px-6 py-3.5 text-navy-500">{s.email}</td>
                                <td className="px-6 py-3.5">
                                  <span className="rounded-md bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-600">
                                    {s.assignedClass || "Unassigned"}
                                  </span>
                                </td>
                                <td className="px-6 py-3.5">
                                  {s.generatedPassword ? (
                                    revealed ? (
                                      <span className="inline-flex items-center gap-2">
                                        <code className="select-all rounded bg-navy-800 px-2 py-1 font-mono text-xs font-bold text-white">
                                          {s.generatedPassword}
                                        </code>
                                        <button
                                          onClick={() => toggleRevealPassword(s.id)}
                                          title="Hide password"
                                          className="rounded-lg p-1.5 text-navy-300 transition hover:bg-navy-100 hover:text-navy-600"
                                        >
                                          <EyeOff className="h-4 w-4" />
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => toggleRevealPassword(s.id)}
                                        title="Show password"
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-2.5 py-1.5 text-xs font-semibold text-navy-500 transition hover:border-brand-300 hover:text-brand-600"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Reveal
                                      </button>
                                    )
                                  ) : (
                                    <span className="text-xs text-navy-300">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-3.5 text-right">
                                  <button
                                    onClick={() => openReset(s)}
                                    title={`Reset ${s.name}'s password`}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-700"
                                  >
                                    <KeyRound className="h-3.5 w-3.5" />
                                    Reset password
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {filteredLoginStudents.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-6 py-10 text-center text-navy-400">
                                {loginStudentsLoaded
                                  ? "No students match your search."
                                  : "Loading students…"}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
  );
}
