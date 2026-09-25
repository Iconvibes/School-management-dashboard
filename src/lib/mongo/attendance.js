/**
 * Mongo store — attendance domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  School,
  Attendance,
  ready,
  safe,
} from "./shared.js";

// ---- Attendance -------------------------------------------------------------

export async function getAttendance(schoolId, classArm, date) {
  await ready();
  return safe(
    await Attendance.findOne({ schoolId, classArm, date })
  );
}

export async function saveAttendance(schoolId, classArm, date, records) {
  await ready();
  const school = await School.findById(schoolId);
  return safe(
    await Attendance.findOneAndUpdate(
      { schoolId, classArm, date },
      {
        schoolId,
        classArm,
        date,
        // Stamp the register with the school's CURRENT term — the rollover
        // archives exactly the old term's registers and the new term starts
        // with a clean count.
        session: school?.currentSession || "2025/2026",
        term: school?.currentTerm || "First Term",
        records: records.map((r) => ({
          studentId: r.studentId,
          present: !!r.present,
        })),
      },
      { upsert: true, new: true }
    )
  );
}

export async function getStudentAttendanceSummary(schoolId, studentId) {
  await ready();
  const school = await School.findById(schoolId);
  // Term-scoped: "days present THIS term" must not leak the old term's
  // registers after a rollover (the old term lives in the archive).
  const docs = await Attendance.find({
    schoolId,
    session: school?.currentSession || "2025/2026",
    term: school?.currentTerm || "First Term",
    "records.studentId": studentId,
  });
  let present = 0;
  docs.forEach((a) => {
    const rec = a.records.find((r) => r.studentId.toString() === studentId);
    if (rec?.present) present += 1;
  });
  return { total: docs.length, present, absent: docs.length - present };
}

/**
 * Daily attendance records for a student this term — the parent portal's
 * detailed attendance view. Returns newest-first: [{ date, present }].
 */
export async function getStudentAttendanceRecords(schoolId, studentId) {
  await ready();
  const school = await School.findById(schoolId);
  const docs = await Attendance.find({
    schoolId,
    session: school?.currentSession || "2025/2026",
    term: school?.currentTerm || "First Term",
    "records.studentId": studentId,
  });
  return docs
    .map((a) => {
      const rec = a.records.find((r) => r.studentId.toString() === studentId);
      return { date: a.date, present: !!rec?.present };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
