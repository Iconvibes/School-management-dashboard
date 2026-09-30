"use client";

import { useMemo } from "react";
import {
  DEFAULT_PERIOD_TIMES,
  DAYS,
  getBreakTime,
  getDayTimeline,
  getPeriodTimes,
  MAX_PERIOD,
  slotConflictReasons,
} from "@/lib/timetable";
import { warn } from "@/lib/log";
import { sparklinePoints } from "@/lib/conflict-scan";

/**
 * Timetable + bell schedule + term rollover actions and derived values —
 * extracted from useAdminActions.js (file-hygiene split). Receives the
 * timetable/bell/rollover state from the caller and returns the actions plus
 * memoised derived values; signatures are unchanged.
 */
export default function useTimetableActions({
  session,
  setSession,
  showToast,
  setStats,
  setFeeStructures,
  setFeeDraft,
  teachers,
  subjects,
  // Timetable state
  ttArm,
  setTtArm,
  ttEntries,
  setTtEntries,
  ttModal,
  setTtModal,
  ttDraft,
  setTtDraft,
  setTtSaving,
  ttConflictsOpen,
  setTtConflictsOpen,
  setTtConflictsLoading,
  setTtConflictFixing,
  ttHealth,
  setTtHealth,
  setTtHealthScanning,
  // Bell schedule state
  periodTimesDraft,
  setPeriodTimesDraft,
  setPeriodTimesSaving,
  breakDraft,
  setBreakDraft,
  bellDay,
  setBellDay,
  dailyDrafts,
  setDailyDrafts,
  // Term rollover state
  setRolloverOpen,
  rolloverTermName,
  setRolloverTermName,
  rolloverSession,
  setRolloverSession,
  setRolloverPreview,
  setRolloverPreviewing,
  setRolloverSaving,
}) {
  // ---- Timetable derived values -------------------------------------------

  const ttByKey = useMemo(() => {
    const m = {};
    ttEntries.forEach((e) => { m[`${e.day}|${e.period}`] = e; });
    return m;
  }, [ttEntries]);

  const ttFilled = ttEntries.length;

  const ttTeachersForSubject = useMemo(
    () => teachers.filter((t) => !t.subjects?.length || t.subjects.includes(ttDraft.subject)),
    [teachers, ttDraft.subject]
  );

  const ttFlaggedSlots = useMemo(() => new Set(ttHealth?.flaggedSlots || []), [ttHealth?.flaggedSlots]);

  const ttSpark = useMemo(() => sparklinePoints(ttHealth?.history), [ttHealth?.history]);

  // Keyed by the SAME day names the grid (DAYS) and the timetable data use —
  // abbreviated keys ("Mon") previously derived empty timelines here, which
  // rendered every grid column as "0 periods / not scheduled".
  const dayTimelines = useMemo(
    () => Object.fromEntries([...DAYS, "Saturday"].map((d) => [d, getDayTimeline(session?.school, d)])),
    [session?.school]
  );

  const dayPeriodSets = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(dayTimelines).map(([d, tl]) => [
          d,
          new Set((tl || []).filter((b) => b.type === "teaching").map((b) => Number(b.period))),
        ])
      ),
    [dayTimelines]
  );

  const bellDraft = useMemo(() => {
    if (bellDay === "ALL") {
      return { periodTimes: periodTimesDraft, breakTimes: breakDraft, overridden: false };
    }
    const d = dailyDrafts[bellDay] || {
      periodTimes: getPeriodTimes(session?.school, bellDay).map((p) => ({ ...p })),
      breakTimes: { ...getBreakTime(session?.school, bellDay) },
    };
    return { ...d, overridden: Boolean(dailyDrafts[bellDay]) };
  }, [bellDay, periodTimesDraft, breakDraft, dailyDrafts, session?.school]);

  // ---- Timetable actions ---------------------------------------------------

  function openTtCell(day, period) {
    const existing = ttByKey[`${day}|${period}`];
    const subject = existing?.subject || subjects[0] || "";
    setTtDraft({
      subject,
      teacherId:
        existing?.teacherId ||
        teachers.find((t) => !t.subjects?.length || t.subjects.includes(subject))?.id ||
        "",
    });
    setTtModal({ day, period });
  }

  async function saveTtSlot() {
    if (!ttModal || !ttDraft.subject || !ttDraft.teacherId) return;
    const slotKey = `${ttArm}|${ttModal.day}|${ttModal.period}`;
    const liveReasons = slotConflictReasons(ttHealth?.conflicts, ttArm, ttModal.day, ttModal.period);
    if (ttFlaggedSlots.has(slotKey) && liveReasons.length === 0) {
      const ok = window.confirm(
        "This slot was flagged by an earlier conflict scan. Reassigning it could " +
          "silently reintroduce the issue. Save anyway?"
      );
      if (!ok) return;
    }
    setTtSaving(true);
    try {
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classArm: ttArm,
          day: ttModal.day,
          period: ttModal.period,
          subject: ttDraft.subject,
          teacherId: ttDraft.teacherId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save slot");
      setTtEntries((prev) => {
        const key = `${data.entry.day}|${data.entry.period}`;
        return [...prev.filter((e) => `${e.day}|${e.period}` !== key), data.entry];
      });
      setTtModal(null);
      showToast(`Period ${ttModal.period} · ${ttModal.day} set for ${ttArm}`);
      fetch("/api/timetable/health")
        .then((r) => r.json())
        .then((d) => setTtHealth(d))
        .catch((e) => warn("tt-health", "refresh failed:", e?.message));
      if (ttConflictsOpen) checkTtConflicts(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtSaving(false);
    }
  }

  async function clearTtSlot() {
    if (!ttModal) return;
    setTtSaving(true);
    try {
      const res = await fetch("/api/timetable", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classArm: ttArm, day: ttModal.day, period: ttModal.period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear slot");
      setTtEntries((prev) =>
        prev.filter((e) => !(e.day === ttModal.day && e.period === ttModal.period))
      );
      setTtModal(null);
      showToast(`Period ${ttModal.period} on ${ttModal.day} freed`);
      if (ttConflictsOpen) checkTtConflicts(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtSaving(false);
    }
  }

  async function checkTtConflicts(silent = false) {
    setTtConflictsLoading(true);
    try {
      const res = await fetch("/api/timetable?conflicts=1");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scan the timetable");
      // Conflicts result is used locally — the tab component reads it from context.
      fetch("/api/timetable/health")
        .then((r) => r.json())
        .then((d) => setTtHealth(d))
        .catch((e) => warn("tt-health", "scan refresh failed:", e?.message));
      setTtConflictsOpen(true);
      const total =
        (data.conflicts.teacher?.length || 0) +
        (data.conflicts.arm?.length || 0) +
        (data.conflicts.scope?.length || 0);
      if (!silent) {
        showToast(
          total ? `${total} conflict${total === 1 ? "" : "s"} found — review them below` : "No conflicts — the schedule is clean"
        );
      }
    } catch (err) {
      if (!silent) showToast(err.message);
    } finally {
      setTtConflictsLoading(false);
    }
  }

  async function scanSchedule() {
    setTtHealthScanning(true);
    try {
      const res = await fetch("/api/timetable/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setTtHealth(data);
      showToast(
        data.conflictCount
          ? `${data.conflictCount} conflict${data.conflictCount === 1 ? "" : "s"} found${data.newConflictCount ? ` — ${data.newConflictCount} new` : ""}`
          : "No conflicts — the schedule is clean"
      );
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtHealthScanning(false);
    }
  }

  async function fixTtConflict(slot) {
    const key = `${slot.classArm}|${slot.day}|${slot.period}`;
    setTtConflictFixing(key);
    try {
      const res = await fetch("/api/timetable", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classArm: slot.classArm, day: slot.day, period: slot.period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to free the slot");
      setTtEntries((prev) =>
        prev.filter((e) => !(e.classArm === slot.classArm && e.day === slot.day && e.period === slot.period))
      );
      showToast(`Freed ${slot.classArm} · ${slot.day}, period ${slot.period}`);
      await checkTtConflicts(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtConflictFixing(null);
    }
  }

  async function swapTtTeacher(violation, teacherId) {
    if (!teacherId) return;
    const fixing = `swap|${violation.entryId}`;
    setTtConflictFixing(fixing);
    try {
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classArm: violation.classArm,
          day: violation.day,
          period: violation.period,
          subject: violation.subject,
          teacherId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Swap failed");
      setTtEntries((prev) => {
        const key = `${data.entry.day}|${data.entry.period}`;
        return [...prev.filter((e) => `${e.day}|${e.period}` !== key), data.entry];
      });
      showToast(`Swapped in ${data.entry.teacherName} for ${violation.subject} · ${violation.classArm}`);
      await checkTtConflicts(true);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTtConflictFixing(null);
    }
  }

  // ---- Bell schedule actions -----------------------------------------------

  function setPeriodTime(period, field, value) {
    if (bellDay === "ALL") {
      setPeriodTimesDraft((prev) =>
        prev.map((p) => (p.period === period ? { ...p, [field]: value } : p))
      );
      return;
    }
    setDailyDrafts((prev) => {
      const cur = prev[bellDay] || {
        periodTimes: getPeriodTimes(session?.school, bellDay).map((p) => ({ ...p })),
        breakTimes: { ...getBreakTime(session?.school, bellDay) },
      };
      return {
        ...prev,
        [bellDay]: {
          ...cur,
          periodTimes: cur.periodTimes.map((p) =>
            p.period === period ? { ...p, [field]: value } : p
          ),
        },
      };
    });
  }

  function setBreakTime(field, value) {
    if (bellDay === "ALL") {
      setBreakDraft((prev) => ({ ...prev, [field]: value }));
      return;
    }
    setDailyDrafts((prev) => {
      const cur = prev[bellDay] || {
        periodTimes: getPeriodTimes(session?.school, bellDay).map((p) => ({ ...p })),
        breakTimes: { ...getBreakTime(session?.school, bellDay) },
      };
      return {
        ...prev,
        [bellDay]: { ...cur, breakTimes: { ...cur.breakTimes, [field]: value } },
      };
    });
  }

  function selectBellDay(day) {
    setBellDay(day);
    if (day !== "ALL" && !dailyDrafts[day]) {
      setDailyDrafts((prev) => ({
        ...prev,
        [day]: {
          periodTimes: getPeriodTimes(session?.school, day).map((p) => ({ ...p })),
          breakTimes: { ...getBreakTime(session?.school, day) },
        },
      }));
    }
  }

  function setBellDayPeriodCount(day, n) {
    setDailyDrafts((prev) => {
      const cur = prev[day] || {
        periodTimes: getPeriodTimes(session?.school, day).map((p) => ({ ...p })),
        breakTimes: { ...getBreakTime(session?.school, day) },
      };
      const count = Math.min(MAX_PERIOD, Math.max(1, Number(n) || 1));
      const periodTimes = Array.from({ length: count }, (_, i) => {
        const p = i + 1;
        const existing = cur.periodTimes.find((x) => Number(x.period) === p);
        const def = DEFAULT_PERIOD_TIMES.find((x) => x.period === p);
        return existing ? { ...existing } : { ...def };
      });
      return { ...prev, [day]: { ...cur, periodTimes } };
    });
  }

  function resetBellDay(day) {
    setDailyDrafts((prev) => {
      const next = { ...prev };
      delete next[day];
      return next;
    });
  }

  async function savePeriodTimes() {
    setPeriodTimesSaving(true);
    try {
      const dailySchedules = Object.fromEntries(
        Object.entries(dailyDrafts).map(([day, d]) => [
          day,
          { periodTimes: d.periodTimes, breakTimes: d.breakTimes },
        ])
      );
      const res = await fetch("/api/school", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodTimes: periodTimesDraft,
          breakTimes: breakDraft,
          dailySchedules,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save period times");
      setSession((s) =>
        s
          ? {
              ...s,
              school: {
                ...s.school,
                periodTimes: data.school?.periodTimes ?? s.school?.periodTimes,
                breakTimes: data.school?.breakTimes ?? s.school?.breakTimes,
                dailySchedules: data.school?.dailySchedules ?? s.school?.dailySchedules,
              },
            }
          : s
      );
      showToast("Bell schedule saved — class alerts and timetables now follow it");
    } catch (err) {
      showToast(err.message);
    } finally {
      setPeriodTimesSaving(false);
    }
  }

  // ---- Term rollover -------------------------------------------------------

  function openRollover() {
    setRolloverTermName("");
    setRolloverSession(session?.school?.currentSession || "");
    setRolloverPreview(null);
    setRolloverOpen(true);
  }

  async function previewRollover() {
    if (!rolloverTermName.trim()) return;
    setRolloverPreviewing(true);
    try {
      const res = await fetch("/api/school/rollover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newTerm: rolloverTermName.trim(),
          newSession: rolloverSession.trim() || session?.school?.currentSession,
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not preview the rollover");
      setRolloverPreview(data.counts);
    } catch (err) {
      setRolloverPreview(null);
      showToast(err.message);
    } finally {
      setRolloverPreviewing(false);
    }
  }

  async function confirmRollover() {
    if (!rolloverTermName.trim()) return;
    setRolloverSaving(true);
    try {
      const res = await fetch("/api/school/rollover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newTerm: rolloverTermName.trim(),
          newSession: rolloverSession.trim() || session?.school?.currentSession,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the new term");
      const c = data.counts || {};
      setSession((s) =>
        s
          ? {
              ...s,
              school: {
                ...s.school,
                currentSession: data.school?.currentSession ?? s.school?.currentSession,
                currentTerm: data.school?.currentTerm ?? s.school?.currentTerm,
              },
            }
          : s
      );
      fetch("/api/admin/stats")
        .then((r) => r.json())
        .then((d) => d.stats && setStats(d.stats))
        .catch((e) => warn("stats", "refresh failed:", e?.message));
      fetch("/api/fees/structures")
        .then((r) => r.json())
        .then((d) => {
          if (d.structures) {
            setFeeStructures(d.structures);
            setFeeDraft(Object.fromEntries(d.structures.map((s) => [s.classArm, s.amount])));
          }
        })
        .catch((e) => warn("fee-structures", "refresh failed:", e?.message));
      showToast(
        `Started ${data.school?.currentSession} · ${data.school?.currentTerm} — archived ${c.scoresArchived || 0} scores and ${c.attendanceArchived || 0} attendance registers; cloned ${c.feesCloned || 0} fee structures and ${c.timetableCloned || 0} timetable slots; carried ${c.carryovers || 0} unpaid balances and sent ${c.remindersSent || 0} automatic reminders`
      );
      setRolloverOpen(false);
      setRolloverPreview(null);
    } catch (err) {
      showToast(err.message);
    } finally {
      setRolloverSaving(false);
    }
  }

  return {
    // Timetable derived values
    ttByKey,
    ttFilled,
    ttTeachersForSubject,
    ttFlaggedSlots,
    ttSpark,
    dayTimelines,
    dayPeriodSets,
    bellDraft,
    // Timetable actions
    openTtCell,
    saveTtSlot,
    clearTtSlot,
    checkTtConflicts,
    scanSchedule,
    fixTtConflict,
    swapTtTeacher,
    // Bell schedule actions
    setPeriodTime,
    setBreakTime,
    selectBellDay,
    setBellDayPeriodCount,
    resetBellDay,
    savePeriodTimes,
    // Term rollover actions
    openRollover,
    previewRollover,
    confirmRollover,
  };
}
