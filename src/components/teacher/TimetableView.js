"use client";

import { AlarmClock, BellRing, ChevronDown, Loader2, Printer } from "lucide-react";
import { DAYS, MAX_PERIOD } from "@/lib/timetable";

export default function TimetableView({
  ttEntries, ttLoaded, setPrintTtOpen, dayTimeline, dayTimelines, dayPeriodSets,
  ttByDayPeriod, myCount, myArms, isToday, classAlerts,
}) {
  return (
            <div className="animate-fade-up">
              <div className="overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-navy-100 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-bold text-navy-800">My weekly timetable</h2>
                    <p className="text-sm text-navy-400">
                      Set by your school admin. Each cell is a class <strong>you</strong> teach — the
                      subject and the class arm are on every slot, so you always know where to be and when.
                    </p>
                  </div>
                  <button
                    onClick={() => setPrintTtOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print timetable
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 bg-navy-50/60 text-xs font-semibold uppercase tracking-wider text-navy-400">
                        <th className="px-4 py-3">Period</th>
                        {DAYS.map((d) => {
                          const count = (dayTimelines[d] || []).filter((b) => b.type === "teaching").length;
                          return (
                            <th key={d} className={`px-4 py-3 text-center ${isToday(d) ? "text-brand-600" : ""}`}>
                              {d}
                              {count < MAX_PERIOD && (
                                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                  {count} periods
                                </span>
                              )}
                              {isToday(d) && (
                                <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  Today
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {dayTimeline.map((block) =>
                        block.type === "break" ? (
                          <tr key="break" className="border-b border-navy-50">
                            <td className="bg-violet-50/60 px-4 py-3">
                              <p className="text-xs font-bold text-violet-700">Break</p>
                              <p className="text-[10px] font-medium text-violet-500">
                                {block.start}–{block.end}
                              </p>
                            </td>
                            {DAYS.map((d) => {
                              const br = (dayTimelines[d] || []).find((b) => b.type === "break");
                              return (
                                <td key={d} className="bg-violet-50/40 px-2 py-2 text-center">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-500">
                                    {br ? `${br.start}–${br.end}` : "No break"}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ) : (
                          <tr key={block.period} className="border-b border-navy-50">
                            <td className="px-4 py-3">
                              <p className="text-xs font-bold text-navy-500">Period {block.period}</p>
                              <p className="text-[10px] font-medium text-navy-400">
                                {block.start}–{block.end}
                              </p>
                            </td>
                            {DAYS.map((d) => {
                              // A period that isn't on this day's bell (e.g.
                              // Friday ends at period 6) never rings or shows.
                              if (!(dayPeriodSets[d] || new Set()).has(Number(block.period))) {
                                return (
                                  <td key={d} className={`px-2 py-2 text-center ${isToday(d) ? "bg-brand-50/40" : ""}`}>
                                    <span className="text-[10px] font-medium text-navy-300">not scheduled</span>
                                  </td>
                                );
                              }
                              const mine = ttByDayPeriod[`${d}|${block.period}`];
                              return (
                                <td key={d} className={`px-2 py-2 text-center ${isToday(d) ? "bg-brand-50/40" : ""}`}>
                                  {mine ? (
                                    <div className="inline-flex flex-col items-center gap-0.5 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-1.5 shadow-sm">
                                      <span className="text-xs font-bold text-brand-800">{mine.subject}</span>
                                      <span className="text-[10px] font-medium text-brand-600">{mine.classArm}</span>
                                    </div>
                                  ) : (
                                    <span className="text-navy-200">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-navy-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Your teaching slots
                </span>
                <span className="text-navy-400">
                  {ttLoaded
                    ? `${myCount} period${myCount === 1 ? "" : "s"} this week across ${myArms.length} class arm${myArms.length === 1 ? "" : "s"}${myArms.length ? ` (${myArms.join(", ")})` : ""}`
                    : "Loading your schedule…"}
                </span>
              </div>

              {/* CLASS ALERTS & REMINDERS — ring when a class period starts */}
              <div className="mt-5 rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-navy-800">
                      <BellRing className="h-5 w-5 text-brand-600" /> Class alerts &amp; reminders
                    </h2>
                    <p className="mt-0.5 text-sm text-navy-400">
                      Ring when a class you teach is about to start — an alarm banner here, a desktop notification,
                      and a chime if sound is on. Alerts fire on every view of this portal, not just the timetable.
                    </p>
                  </div>
                  <button
                    onClick={toggleClassAlerts}
                    className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                      classAlerts.prefs.enabled
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500"
                        : "bg-navy-100 text-navy-600 hover:bg-navy-200"
                    }`}
                  >
                    <BellRing className="h-4 w-4" />
                    {classAlerts.prefs.enabled ? "Alerts on" : "Alerts off"}
                  </button>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">Ring how early?</span>
                    <div className="relative">
                      <select
                        value={classAlerts.prefs.leadMinutes}
                        onChange={(e) => classAlerts.updatePref({ leadMinutes: Number(e.target.value) })}
                        className="w-full appearance-none rounded-xl border border-navy-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-navy-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      >
                        {classAlerts.leadOptions.map((m) => (
                          <option key={m} value={m}>
                            {m === 0 ? "At the exact start" : `${m} minute${m === 1 ? "" : "s"} before`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">Chime</span>
                    <button
                      onClick={() => classAlerts.updatePref({ soundOn: !classAlerts.prefs.soundOn })}
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition ${
                        classAlerts.prefs.soundOn
                          ? "bg-brand-50 text-brand-700 ring-1 ring-brand-600/20 hover:bg-brand-100"
                          : "bg-navy-50 text-navy-500 ring-1 ring-navy-200 hover:bg-navy-100"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <AlarmClock className="h-4 w-4" />
                        {classAlerts.prefs.soundOn ? "Sound on" : "Sound off"}
                      </span>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${classAlerts.prefs.soundOn ? "bg-emerald-500" : "bg-navy-300"}`}
                      />
                    </button>
                  </label>

                  <div className="rounded-xl border border-navy-100 bg-navy-50/50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400">Next class</p>
                    {classAlerts.next ? (
                      <div className="mt-1">
                        <p className="text-sm font-bold text-navy-800">
                          {classAlerts.next.subject} · {classAlerts.next.classArm}
                        </p>
                        <p className="text-xs text-navy-500">
                          {classAlerts.minutesToLabel(classAlerts.next.startMinutes)}
                          {classAlerts.next.startsInMin <= 0
                            ? " · in progress"
                            : ` · in ${classAlerts.next.startsInMin} min`}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-navy-400">No classes left today</p>
                    )}
                  </div>
                </div>

                {classAlerts.notifPermission === "default" && (
                  <p className="mt-4 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-brand-800">
                    <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Turn alerts on to enable <strong>desktop notifications</strong> — the alarm rings even when this
                    tab is in the background.
                  </p>
                )}
              </div>
            </div>
  );
}
