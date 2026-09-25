/**
 * Mongo store — timetable domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  mongoose,
  School,
  TimetableEntry,
  ClassAlertPref,
  ConflictScan,
  ready,
  safe,
} from "./shared.js";

// ---- Timetable ---------------------------------------------------------------

export async function getTimetable({ schoolId, classArm, day }) {
  await ready();
  const query = { schoolId };
  if (classArm) query.classArm = classArm;
  if (day) query.day = day;
  return (await TimetableEntry.find(query)).map(safe);
}

/**
 * Upsert one slot — one subject per period per class arm. teacherId is a
 * Mongo ObjectId here (unlike the demo store's string ids), and mongoose
 * casts the route-passed id automatically.
 */
export async function saveTimetableEntry({ schoolId, classArm, day, period, subject, teacherId }) {
  await ready();
  const school = await School.findById(schoolId);
  return safe(
    await TimetableEntry.findOneAndUpdate(
      { schoolId, classArm, day, period },
      {
        schoolId,
        classArm,
        day,
        period,
        subject,
        teacherId,
        // Stamp with the school's CURRENT term so the shared grid follows the
        // rollover (and the term field stays honest for the archive).
        session: school?.currentSession || "2025/2026",
        term: school?.currentTerm || "First Term",
      },
      { upsert: true, new: true }
    )
  );
}

export async function deleteTimetableEntry({ schoolId, classArm, day, period }) {
  await ready();
  const res = await TimetableEntry.deleteOne({ schoolId, classArm, day, period });
  return res.deletedCount > 0;
}

/** Double-booking guard — any other slot where the teacher already teaches. */
export async function getTimetableConflict({ schoolId, teacherId, day, period, excludeClassArm }) {
  await ready();
  const query = { schoolId, teacherId, day, period };
  if (excludeClassArm) query.classArm = { $ne: excludeClassArm };
  return safe(await TimetableEntry.findOne(query));
}

// ---- Class alert preferences (per teacher) -----------------------------------

/** One teacher's class-alert preferences (defaults when never set). */
export async function getClassAlertPref(schoolId, userId) {
  await ready();
  const pref = await ClassAlertPref.findOne({ schoolId, userId });
  if (pref) return safe(pref);
  return { schoolId, userId, enabled: false, leadMinutes: 5, soundOn: true };
}

export async function setClassAlertPref(schoolId, userId, patch = {}) {
  await ready();
  const update = {};
  if (patch.enabled !== undefined) update.enabled = patch.enabled === true;
  if (patch.soundOn !== undefined) update.soundOn = patch.soundOn === true;
  if (patch.leadMinutes !== undefined && [0, 5, 10, 15, 30].includes(Number(patch.leadMinutes))) {
    update.leadMinutes = Number(patch.leadMinutes);
  }
  return safe(
    await ClassAlertPref.findOneAndUpdate(
      { schoolId, userId },
      { $set: update },
      { upsert: true, new: true }
    )
  );
}

// ---- Timetable conflict scans (the Overview health metric) -------------------

/** The school's most recent timetable-conflict scan, or null when never run. */
export async function getConflictScan(schoolId) {
  await ready();
  return safe(await ConflictScan.findOne({ schoolId }));
}

export async function saveConflictScan(schoolId, record = {}) {
  await ready();
  return safe(
    await ConflictScan.findOneAndUpdate(
      { schoolId },
      {
        $set: {
          lastRunAt: new Date(record.lastRunAt || Date.now()),
          conflicts: record.conflicts || { teacher: [], arm: [] },
          conflictKeys: record.conflictKeys || [],
          newConflictKeys: record.newConflictKeys || [],
          flaggedSlots: record.flaggedSlots || [],
          history: record.history || [],
        },
      },
      { upsert: true, new: true }
    )
  );
}
