/**
 * Timetable module — demo store implementation.
 *
 * Functions: getTimetable, saveTimetableEntry, deleteTimetableEntry,
 *            getTimetableConflict, getClassAlertPref, setClassAlertPref,
 *            getConflictScan, saveConflictScan
 */
import {
  timetable,
  classAlertPrefs,
  conflictScans,
  schools,
  nid,
  clone,
  nowIso,
  persist,
} from "@/modules/shared/store-state";

export async function getTimetable({ schoolId, classArm, day }) {
  return timetable
    .filter((t) => t.schoolId === schoolId)
    .filter((t) => (classArm ? t.classArm === classArm : true))
    .filter((t) => (day ? t.day === day : true))
    .map(clone);
}

/**
 * Upsert one slot — a class arm can only hold one subject per period, so
 * assigning a period replaces what was there.
 */
export async function saveTimetableEntry({ schoolId, classArm, day, period, subject, teacherId }) {
  const school = schools.find((s) => s.id === schoolId);
  let entry = timetable.find(
    (t) => t.schoolId === schoolId && t.classArm === classArm && t.day === day && t.period === period
  );
  if (!entry) {
    entry = {
      id: nid("ttb"), schoolId, classArm, day, period,
      session: school?.currentSession || "2025/2026",
      term: school?.currentTerm || "First Term",
      createdAt: nowIso(),
    };
    timetable.push(entry);
  }
  entry.subject = subject;
  entry.teacherId = teacherId;
  persist();
  return clone(entry);
}

export async function deleteTimetableEntry({ schoolId, classArm, day, period }) {
  const idx = timetable.findIndex(
    (t) => t.schoolId === schoolId && t.classArm === classArm && t.day === day && t.period === period
  );
  if (idx === -1) return false;
  timetable.splice(idx, 1);
  persist();
  return true;
}

export async function getTimetableConflict({ schoolId, teacherId, day, period, excludeClassArm }) {
  const entry = timetable.find(
    (t) =>
      t.schoolId === schoolId &&
      t.teacherId === teacherId &&
      t.day === day &&
      t.period === period &&
      (!excludeClassArm || t.classArm !== excludeClassArm)
  );
  return entry ? clone(entry) : null;
}

// ---- Class alert preferences (per teacher) -----------------------------------

const DEFAULT_ALERT_PREF = Object.freeze({
  enabled: false,
  leadMinutes: 5,
  soundOn: true,
});

export async function getClassAlertPref(schoolId, userId) {
  const pref = classAlertPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (pref) return clone(pref);
  return { schoolId, userId, ...DEFAULT_ALERT_PREF };
}

export async function setClassAlertPref(schoolId, userId, patch = {}) {
  let pref = classAlertPrefs.find((p) => p.schoolId === schoolId && p.userId === userId);
  if (!pref) {
    pref = { id: nid("cap"), schoolId, userId, ...DEFAULT_ALERT_PREF, createdAt: nowIso() };
    classAlertPrefs.push(pref);
  }
  if (patch.enabled !== undefined) pref.enabled = patch.enabled === true;
  if (patch.soundOn !== undefined) pref.soundOn = patch.soundOn === true;
  if (patch.leadMinutes !== undefined && [0, 5, 10, 15, 30].includes(Number(patch.leadMinutes))) {
    pref.leadMinutes = Number(patch.leadMinutes);
  }
  persist();
  return clone(pref);
}

// ---- Timetable conflict scans -------------------------------------------------

export async function getConflictScan(schoolId) {
  return clone(conflictScans.find((c) => c.schoolId === schoolId) || null);
}

export async function saveConflictScan(schoolId, record = {}) {
  let scan = conflictScans.find((c) => c.schoolId === schoolId);
  if (!scan) {
    scan = { id: nid("csc"), schoolId, createdAt: nowIso() };
    conflictScans.push(scan);
  }
  scan.lastRunAt = record.lastRunAt || nowIso();
  scan.conflicts = record.conflicts || { teacher: [], arm: [] };
  scan.conflictKeys = Array.isArray(record.conflictKeys) ? record.conflictKeys : [];
  scan.newConflictKeys = Array.isArray(record.newConflictKeys) ? record.newConflictKeys : [];
  scan.flaggedSlots = Array.isArray(record.flaggedSlots) ? record.flaggedSlots : [];
  scan.history = Array.isArray(record.history) ? record.history : scan.history || [];
  persist();
  return clone(scan);
}
