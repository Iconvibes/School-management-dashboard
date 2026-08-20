"use client";

import { Layers, Loader2, Pencil, Plus, Save, X } from "lucide-react";
import { naira } from "./utils";
import ArmStreamSplitter from "@/components/ArmStreamSplitter";

export default function ClassesTab({
  armsDraft, stats, armsSlotCounts, armsFeeAmounts, armsSaving, newArm,
  setNewArm, addArm, removeArm, openRename, saveArms, addStreamedArms, session,
}) {
  return (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="border-b border-navy-100 px-6 py-4">
                  <h2 className="text-lg font-bold text-navy-800">Classes & arms</h2>
                  <p className="text-sm text-navy-400">
                    Class arms are free-form — name them however your school does
                    (&quot;JSS1 A&quot;, &quot;JSS1 Blue&quot;, &quot;SS1 Science&quot;…). Every feature keys off
                    these names: timetables, teacher scopes, fees, attendance and report cards.
                  </p>
                </div>

                <div className="p-6">
                  {armsDraft === null ? (
                    <div className="flex items-center gap-2 py-10 text-sm text-navy-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading classes…
                    </div>
                  ) : armsDraft.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
                      <Layers className="mx-auto h-8 w-8 text-navy-300" />
                      <p className="mt-3 text-sm font-medium text-navy-600">No classes yet</p>
                      <p className="mt-1 text-xs text-navy-400">
                        Add your first arm below, or split a class into streams.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {armsDraft.map((arm) => {
                        const students = stats?.classDistribution?.[arm] || 0;
                        const slots = armsSlotCounts[arm] || 0;
                        const fee = armsFeeAmounts[arm];
                        return (
                          <div
                            key={arm}
                            className="rounded-xl border border-navy-200/70 bg-white p-4 transition hover:border-brand-300"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-bold text-navy-800">{arm}</p>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openRename(arm)}
                                  className="rounded-lg p-1 text-navy-300 transition hover:bg-brand-50 hover:text-brand-600"
                                  title={`Rename ${arm}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => removeArm(arm)}
                                  className="rounded-lg p-1 text-navy-300 transition hover:bg-rose-50 hover:text-rose-600"
                                  title={`Remove ${arm}`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-lg bg-navy-50 py-2">
                                <p className="text-sm font-bold text-navy-800">{students}</p>
                                <p className="text-[10px] uppercase tracking-wide text-navy-400">Students</p>
                              </div>
                              <div className="rounded-lg bg-navy-50 py-2">
                                <p className="text-sm font-bold text-navy-800">{slots}</p>
                                <p className="text-[10px] uppercase tracking-wide text-navy-400">Timetable</p>
                              </div>
                              <div className="rounded-lg bg-navy-50 py-2">
                                <p className="text-sm font-bold text-navy-800">{fee ? naira(fee) : "—"}</p>
                                <p className="text-[10px] uppercase tracking-wide text-navy-400">Term fee</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add a custom arm */}
                  <div className="mt-5 flex gap-2">
                    <input
                      value={newArm}
                      onChange={(e) => setNewArm(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addArm()}
                      placeholder="Custom arm, e.g. JSS1 Blue"
                      className="flex-1 rounded-xl border border-navy-200 px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                    <button
                      onClick={addArm}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
                    >
                      <Plus className="h-4 w-4" /> Add arm
                    </button>
                  </div>

                  <div className="mt-4">
                    <ArmStreamSplitter onAdd={addStreamedArms} />
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-3">
                    <span className="text-xs text-navy-400">
                      {armsDraft !== null &&
                      JSON.stringify(armsDraft) !== JSON.stringify(session?.school?.activeArms || [])
                        ? "Unsaved changes"
                        : "Saved"}
                    </span>
                    <button
                      onClick={saveArms}
                      disabled={armsSaving || armsDraft === null}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {armsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
  );
}
