"use client";

import { Trophy, ChevronRight } from "lucide-react";
import { gradeBadgeClasses } from "@/lib/grading";

const MEDALS = ["text-amber-500", "text-navy-300", "text-orange-400"];
const RANK_COLORS = ["bg-amber-100 text-amber-700", "bg-navy-100 text-navy-600", "bg-orange-100 text-orange-700"];

/**
 * "Best students" leaderboard sorted by average.
 * Props: students (already sorted desc by average), onView(studentId), limit
 */
export default function TopStudents({ students, onView, limit = 5, title = "Top students" }) {
  const top = (students || []).slice(0, limit);

  return (
    <div className="rounded-2xl border border-navy-200/70 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-bold text-navy-800">{title}</h2>
        {top.length > 0 && (
          <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
            Ranked by average
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2.5">
        {top.length === 0 && (
          <p className="py-6 text-center text-sm text-navy-400">
            No scores recorded yet. Grades will rank students here automatically.
          </p>
        )}
        {top.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onView && onView(s.id)}
            className="group flex w-full items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/50 px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/60"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                RANK_COLORS[i] || "bg-white text-navy-400 ring-1 ring-navy-200"
              }`}
            >
              {i === 0 ? <Trophy className="h-4 w-4 text-amber-500" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy-800">{s.name}</p>
              <p className="text-xs text-navy-400">
                {s.assignedClass || "Unassigned"} · {s.subjects} subjects
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-extrabold text-navy-800">{s.average}%</p>
              {s.grade ? (
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ring-1 ${gradeBadgeClasses(s.grade)}`}>
                  {s.grade}
                </span>
              ) : (
                <span className="text-xs text-navy-300">—</span>
              )}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-navy-300 transition group-hover:text-brand-600" />
          </button>
        ))}
      </div>
    </div>
  );
}
