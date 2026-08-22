"use client";

import { useState, useEffect } from "react";
import { Trophy, TrendingUp, TrendingDown, Users, Minus, BarChart3, Target, Award } from "lucide-react";

/**
 * Teacher performance dashboard for admin.
 * Shows how each teacher's students perform compared to the school average.
 */
export default function TeacherPerformance({ session }) {
  const [performance, setPerformance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPerformance();
  }, []);

  async function loadPerformance() {
    setLoading(true);
    try {
      const res = await fetch("/api/teacher/performance");
      const data = await res.json();
      setPerformance(data.performance || []);
    } catch {}
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-navy-400">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy-200 border-t-brand-600" />
        <p className="mt-4 text-sm font-medium">Loading performance data...</p>
      </div>
    );
  }

  if (performance.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-navy-800">Teacher Performance</h2>
          <p className="text-sm text-navy-400">
            How each teacher&apos;s students perform compared to the school average — spot strengths and areas for support.
          </p>
        </div>

        {/* Empty state — detailed */}
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/80 via-white to-cyan-50/40 p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-100">
            <BarChart3 className="h-8 w-8 text-teal-600" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-teal-800">No performance data yet</h3>
          <p className="mt-2 max-w-md mx-auto text-sm text-teal-600">
            Performance metrics appear once teachers enter grades for their classes.
            The system compares each teacher&apos;s student averages against the school-wide average.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="rounded-xl bg-white/80 p-4 ring-1 ring-teal-200/60">
              <Target className="mx-auto h-5 w-5 text-teal-500" />
              <p className="mt-2 text-xs font-semibold text-navy-700">Per-subject metrics</p>
              <p className="mt-1 text-[11px] text-navy-400">Average scores per class and subject</p>
            </div>
            <div className="rounded-xl bg-white/80 p-4 ring-1 ring-teal-200/60">
              <TrendingUp className="mx-auto h-5 w-5 text-teal-500" />
              <p className="mt-2 text-xs font-semibold text-navy-700">School comparison</p>
              <p className="mt-1 text-[11px] text-navy-400">How each class compares to the average</p>
            </div>
            <div className="rounded-xl bg-white/80 p-4 ring-1 ring-teal-200/60">
              <Award className="mx-auto h-5 w-5 text-teal-500" />
              <p className="mt-2 text-xs font-semibold text-navy-700">Teacher insights</p>
              <p className="mt-1 text-[11px] text-navy-400">Strengths and areas needing support</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compute school-wide stats
  const allAverages = performance.map((t) => t.overallAverage).filter(Boolean);
  const schoolAvg = allAverages.length
    ? Math.round(allAverages.reduce((a, b) => a + b, 0) / allAverages.length)
    : 0;
  const aboveAvg = performance.filter((t) => t.overallAverage > schoolAvg).length;
  const topTeacher = performance.reduce((best, t) =>
    t.overallAverage > (best?.overallAverage || 0) ? t : best, null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-navy-800">Teacher Performance</h2>
        <p className="text-sm text-navy-400">
          How each teacher&apos;s students perform compared to the school average.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-navy-200/70 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-navy-800">{performance.length}</p>
          <p className="text-xs text-navy-400">Teachers</p>
        </div>
        <div className="rounded-xl border border-navy-200/70 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-teal-600">{schoolAvg}%</p>
          <p className="text-xs text-navy-400">School Average</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-emerald-600">{aboveAvg}</p>
          <p className="text-xs text-emerald-500">Above Average</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm">
          <Trophy className="mx-auto h-5 w-5 text-amber-500" />
          <p className="mt-1 text-sm font-bold text-navy-800 truncate">
            {topTeacher?.teacherName || "—"}
          </p>
          <p className="text-[11px] text-amber-600">Top Performer</p>
        </div>
      </div>

      {/* Teacher cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {performance.map((teacher) => {
          const vsAvg = teacher.overallAverage - schoolAvg;
          return (
            <div key={teacher.teacherId} className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-navy-800 truncate">{teacher.teacherName}</h3>
                  <p className="text-xs text-navy-400">
                    {teacher.classMetrics.length} class{teacher.classMetrics.length !== 1 ? "es" : ""}
                  </p>
                </div>
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                  vsAvg > 0 ? "bg-emerald-50" : vsAvg < 0 ? "bg-red-50" : "bg-navy-50"
                }`}>
                  <span className={`text-lg font-bold ${
                    vsAvg > 0 ? "text-emerald-700" : vsAvg < 0 ? "text-red-600" : "text-navy-700"
                  }`}>
                    {teacher.overallAverage}
                  </span>
                </div>
              </div>

              {/* vs school average */}
              <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                vsAvg > 0 ? "bg-emerald-50 text-emerald-700" :
                vsAvg < 0 ? "bg-red-50 text-red-600" :
                "bg-navy-50 text-navy-500"
              }`}>
                {vsAvg > 0 ? <TrendingUp className="h-3 w-3" /> :
                 vsAvg < 0 ? <TrendingDown className="h-3 w-3" /> :
                 <Minus className="h-3 w-3" />}
                {vsAvg > 0 ? "+" : ""}{vsAvg}% vs school avg
              </div>

              {/* Per-class metrics */}
              <div className="mt-3 space-y-2">
                {teacher.classMetrics.slice(0, 4).map((m) => (
                  <div key={`${m.subject}-${m.classArm}`} className="flex items-center justify-between text-xs">
                    <span className="min-w-0 truncate text-navy-500">
                      {m.subject}
                      <span className="hidden sm:inline text-navy-300 ml-1">({m.classArm})</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="font-semibold text-navy-700">{m.averageScore}%</span>
                      <span className={`font-bold ${
                        m.vsSchool > 0 ? "text-emerald-600" : m.vsSchool < 0 ? "text-red-500" : "text-navy-400"
                      }`}>
                        {m.vsSchool > 0 ? "+" : ""}{m.vsSchool}
                      </span>
                    </div>
                  </div>
                ))}
                {teacher.classMetrics.length > 4 && (
                  <p className="text-[11px] text-navy-400">
                    +{teacher.classMetrics.length - 4} more class{teacher.classMetrics.length - 4 !== 1 ? "es" : ""}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
