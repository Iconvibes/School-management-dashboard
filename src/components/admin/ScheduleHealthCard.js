"use client";

import {
  Loader2,
  Activity,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  CalendarX,
  UserX,
  Link2Off,
} from "lucide-react";
import { useAdminShell } from "@/components/admin/context/AdminContext";
import { sparklinePoints } from "@/lib/conflict-scan";

/**
 * Schedule Health — the daily timetable integrity scan card.
 *
 * The background job (src/instrumentation.js) runs it at a fixed hour;
 * flags collisions AND the other integrity checks (arms with unassigned
 * days, unscheduled teachers, orphaned entries) new since last scan.
 *
 * Extracted from the admin dashboard overview section to keep page.js
 * focused on layout orchestration.
 */
export default function ScheduleHealthCard() {
  const {
    ttHealth,
    ttHealthScanning,
    scanSchedule,
    setTab,
    checkTtConflicts,
  } = useAdminShell();

  const fmtHour = (h) => `${String(h ?? 2).padStart(2, "0")}:00`;

  function timeAgo(iso) {
    if (!iso) return "never";
    const secs = Math.max(
      1,
      Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    );
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days === 1 ? "yesterday" : `${days}d ago`;
  }

  const ttSpark = sparklinePoints(ttHealth?.history);

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
        ttHealth?.issueCount
          ? "border-rose-200 hover:shadow-lg hover:shadow-rose-900/5"
          : "border-navy-200/70 hover:shadow-lg hover:shadow-navy-900/5"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-navy-500">
            Schedule Health
          </p>
          <p
            className={`mt-2 text-3xl font-bold tracking-tight ${
              ttHealth?.issueCount ? "text-rose-600" : "text-navy-800"
            }`}
          >
            {!ttHealth ? (
              <Loader2 className="inline h-7 w-7 animate-spin text-navy-300" />
            ) : ttHealth.neverScanned ? (
              "Pending"
            ) : (ttHealth.issueCount ?? 0) === 0 ? (
              "Clear"
            ) : (
              `${ttHealth.issueCount} issue${ttHealth.issueCount === 1 ? "" : "s"}`
            )}
          </p>
          <p className="mt-1.5 text-xs font-medium text-navy-400">
            {ttHealth
              ? ttHealth.neverScanned
                ? `First scan scheduled ${fmtHour(ttHealth.scanHour)}`
                : `Scanned ${timeAgo(ttHealth.scannedAt)} · daily scan ${fmtHour(ttHealth.scanHour)}`
              : "Scanning…"}
          </p>
        </div>
        <div
          className={`rounded-xl p-2.5 ring-1 ${
            ttHealth?.issueCount
              ? "bg-rose-50 text-rose-600 ring-rose-600/10"
              : "bg-emerald-50 text-emerald-600 ring-emerald-600/10"
          }`}
        >
          <Activity className="h-5 w-5" />
        </div>
      </div>

      {ttHealth?.newConflictCount > 0 && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {ttHealth.newConflictCount} new collision
          {ttHealth.newConflictCount === 1 ? "" : "s"} since last scan
        </div>
      )}

      {ttSpark && (
        <div className="mt-3">
          <svg
            viewBox="0 0 120 28"
            preserveAspectRatio="none"
            className="h-7 w-full"
            aria-hidden="true"
          >
            <polyline
              points={ttSpark}
              fill="none"
              stroke={ttHealth?.issueCount ? "#f43f5e" : "#10b981"}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="mt-1 text-[10px] font-medium text-navy-400">
            Conflict trend · last {ttHealth.history.length} scan day
            {ttHealth.history.length === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {/* The other integrity checks, surfaced as compact chips */}
      {(ttHealth?.unassignedPeriodCount || 0) +
        (ttHealth?.unstaffedTeacherCount || 0) +
        (ttHealth?.orphanedEntryCount || 0) >
        0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ttHealth.unassignedPeriodCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-600/20">
              <CalendarX className="h-3 w-3" />
              {ttHealth.unassignedPeriodCount} unassigned day
              {ttHealth.unassignedPeriodCount === 1 ? "" : "s"}
            </span>
          )}
          {ttHealth.unstaffedTeacherCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-600/20">
              <UserX className="h-3 w-3" />
              {ttHealth.unstaffedTeacherCount} teacher
              {ttHealth.unstaffedTeacherCount === 1 ? "" : "s"} unscheduled
            </span>
          )}
          {ttHealth.orphanedEntryCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-600/20">
              <Link2Off className="h-3 w-3" />
              {ttHealth.orphanedEntryCount} orphaned entr
              {ttHealth.orphanedEntryCount === 1 ? "y" : "ies"}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={scanSchedule}
          disabled={ttHealthScanning}
          className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
        >
          {ttHealthScanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {ttHealthScanning ? "Scanning…" : "Scan now"}
        </button>
        {ttHealth?.issueCount > 0 && (
          <button
            onClick={() => {
              setTab("timetable");
              checkTtConflicts(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-600/20 transition hover:bg-rose-100"
          >
            Review in Timetable <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
