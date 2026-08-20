"use client";

import { useState, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Attendance calendar heatmap for parent dashboard.
 * Shows a monthly calendar with color-coded attendance (present/absent).
 */
export default function AttendanceCalendar({ studentId, studentName }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    loadRecords();
  }, [studentId, currentMonth]);

  async function loadRecords() {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/parent/attendance?studentId=${studentId}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch {}
    setLoading(false);
  }

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build attendance map: date -> "present" | "absent" | null
  const attendanceMap = {};
  for (const r of records) {
    if (r.date) {
      const dateStr = r.date.slice(0, 10);
      attendanceMap[dateStr] = r.status || (r.present ? "present" : "absent");
    }
  }

  const present = records.filter((r) => r.present || r.status === "present").length;
  const absent = records.filter((r) => !r.present && r.status !== "present").length;
  const total = present + absent;
  const rate = total ? Math.round((present / total) * 100) : 0;

  function prevMonth() {
    if (month === 0) setCurrentMonth({ year: year - 1, month: 11 });
    else setCurrentMonth({ year, month: month - 1 });
  }

  function nextMonth() {
    if (month === 11) setCurrentMonth({ year: year + 1, month: 0 });
    else setCurrentMonth({ year, month: month + 1 });
  }

  return (
    <div className="rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-navy-800">
            <CalendarDays className="h-4 w-4 text-brand-500" />
            Attendance · {studentName || "Student"}
          </h3>
          {total > 0 && (
            <p className="mt-1 text-xs text-navy-400">
              {present} present · {absent} absent · {rate}% attendance rate
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[100px] text-center text-sm font-semibold text-navy-700">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Attendance rate bar */}
      {total > 0 && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-navy-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${rate}%`,
                background: rate >= 90 ? "#059669" : rate >= 75 ? "#d97706" : "#e11d48",
              }}
            />
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="mt-4 grid grid-cols-7 gap-1">
        {DAYS.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase text-navy-400">
            {d}
          </div>
        ))}

        {/* Empty cells for days before the first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const status = attendanceMap[dateStr];
          const isToday = new Date().toISOString().slice(0, 10) === dateStr;

          return (
            <div
              key={day}
              className={`flex h-8 w-full items-center justify-center rounded-lg text-xs font-medium transition ${
                status === "present"
                  ? "bg-emerald-100 text-emerald-700"
                  : status === "absent"
                  ? "bg-red-100 text-red-600"
                  : "text-navy-500"
              } ${isToday ? "ring-2 ring-brand-400" : ""}`}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-navy-400">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-emerald-100" /> Present
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-red-100" /> Absent
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border-2 border-brand-400" /> Today
        </span>
      </div>
    </div>
  );
}
