"use client";

import { useState, useEffect } from "react";
import { Trophy, TrendingUp, TrendingDown, Users, Minus } from "lucide-react";

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
    return <div className="flex items-center justify-center py-12 text-navy-400">Loading performance data...</div>;
  }

  if (performance.length === 0) {
    return (
      <div className="rounded-2xl border border-navy-200/70 bg-white py-12 text-center shadow-sm">
        <Users className="mx-auto h-10 w-10 text-navy-300" />
        <p className="mt-3 text-sm font-medium text-navy-500">No performance data yet</p>
        <p className="text-xs text-navy-400">Performance metrics appear once teachers enter grades.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-navy-800">Teacher Performance</h2>
        <p className="text-sm text-navy-400">How each teacher&apos;s students perform compared to the school average.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {performance.map((teacher) => (
          <div key={teacher.teacherId} className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-navy-800">{teacher.teacherName}</h3>
                <p className="text-xs text-navy-400">{teacher.classMetrics.length} class{teacher.classMetrics.length !== 1 ? "es" : ""}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                <span className="text-lg font-bold text-brand-700">{teacher.overallAverage}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {teacher.classMetrics.slice(0, 3).map((m) => (
                <div key={`${m.subject}-${m.classArm}`} className="flex items-center justify-between text-xs">
                  <span className="text-navy-500">{m.subject} ({m.classArm})</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-navy-700">{m.averageScore}</span>
                    <span className={`flex items-center gap-0.5 font-bold ${
                      m.vsSchool > 0 ? "text-emerald-600" : m.vsSchool < 0 ? "text-red-500" : "text-navy-400"
                    }`}>
                      {m.vsSchool > 0 ? <TrendingUp className="h-3 w-3" /> :
                       m.vsSchool < 0 ? <TrendingDown className="h-3 w-3" /> :
                       <Minus className="h-3 w-3" />}
                      {m.vsSchool > 0 ? "+" : ""}{m.vsSchool}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
