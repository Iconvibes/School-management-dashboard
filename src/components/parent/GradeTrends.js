"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * Grade trend sparkline chart for parent dashboard.
 * Shows subject-by-subject performance trends across terms.
 */
export default function GradeTrends({ studentId, studentName }) {
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrends();
  }, [studentId]);

  async function loadTrends() {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${studentId}`);
      const data = await res.json();
      // Build trends from scores
      const bySubject = {};
      for (const s of data.scores || []) {
        if (!bySubject[s.subject]) bySubject[s.subject] = [];
        bySubject[s.subject].push({
          term: s.term,
          session: s.session,
          average: (Number(s.ca) + Number(s.exam)) / 2,
        });
      }

      const trendList = Object.entries(bySubject).map(([subject, entries]) => {
        entries.sort((a, b) => {
          if (a.session !== b.session) return a.session?.localeCompare(b.session);
          const order = { "First Term": 1, "Second Term": 2, "Third Term": 3 };
          return (order[a.term] || 0) - (order[b.term] || 0);
        });

        const latest = entries[entries.length - 1]?.average || 0;
        const previous = entries.length > 1 ? entries[entries.length - 2].average : latest;
        const change = latest - previous;

        return {
          subject,
          entries,
          latest: Math.round(latest),
          change: Math.round(change),
          trend: change > 3 ? "improving" : change < -3 ? "declining" : "stable",
        };
      });

      trendList.sort((a, b) => b.latest - a.latest);
      setTrends(trendList);
    } catch {}
    setLoading(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-navy-400">Loading trends...</div>;
  }

  if (trends.length === 0) {
    return (
      <div className="rounded-2xl border border-navy-200/70 bg-white py-8 text-center shadow-sm">
        <TrendingUp className="mx-auto h-8 w-8 text-navy-300" />
        <p className="mt-2 text-sm text-navy-500">No grade data yet for {studentName || "this student"}.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-navy-800">
        Grade Trends · {studentName || "Student"}
      </h3>
      <div className="space-y-3">
        {trends.map((t) => {
          const maxVal = Math.max(100, ...t.entries.map((e) => e.average));
          return (
            <div key={t.subject} className="flex items-center gap-4">
              <div className="w-32 shrink-0">
                <p className="text-xs font-semibold text-navy-700 truncate">{t.subject}</p>
                <p className="text-[10px] text-navy-400">{t.latest}%</p>
              </div>

              {/* Mini sparkline bar chart */}
              <div className="flex flex-1 items-end gap-1" style={{ height: "28px" }}>
                {t.entries.slice(-6).map((e, i) => {
                  const height = Math.max(4, (e.average / maxVal) * 28);
                  const isLatest = i === t.entries.slice(-6).length - 1;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{
                        height: `${height}px`,
                        background: isLatest ? "#2563EB" : "#cbd5e1",
                      }}
                      title={`${e.term}: ${Math.round(e.average)}%`}
                    />
                  );
                })}
              </div>

              {/* Trend indicator */}
              <div className="w-16 shrink-0 text-right">
                {t.trend === "improving" ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600">
                    <TrendingUp className="h-3 w-3" /> +{t.change}
                  </span>
                ) : t.trend === "declining" ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-red-500">
                    <TrendingDown className="h-3 w-3" /> {t.change}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-navy-400">
                    <Minus className="h-3 w-3" /> 0
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
