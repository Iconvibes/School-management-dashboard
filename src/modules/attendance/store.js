/**
 * Attendance module — demo store implementation.
 * Functions: getAttendance, saveAttendance, getStudentAttendanceSummary, getStudentAttendanceRecords
 */
import { attendance as attendanceArray, schools, nid, clone, nowIso, persist } from "@/modules/shared/store-state";

export async function getAttendance(schoolId, classArm, date) {
  const records = attendanceArray.filter((a) => a.schoolId === schoolId && a.classArm === classArm && a.date === date);
  return records.length > 0 ? clone(records[0]) : null;
}

export async function saveAttendance(schoolId, classArm, date, records) {
  const school = schools.find((s) => s.id === schoolId);
  let rec = attendanceArray.find(
    (a) => a.schoolId === schoolId && a.classArm === classArm && a.date === date
  );
  if (!rec) {
    rec = {
      id: nid("att"),
      schoolId,
      classArm,
      date,
      session: school?.currentSession || "2025/2026",
      term: school?.currentTerm || "First Term",
      records: [],
      createdAt: nowIso(),
    };
    attendanceArray.push(rec);
  }
  rec.records = records.map((r) => ({
    studentId: r.studentId,
    present: !!r.present,
  }));
  persist();
  return clone(rec);
}

export async function getStudentAttendanceSummary(schoolId, studentId) {
  const studentRecords = attendanceArray.filter((a) => a.schoolId === schoolId);
  let total = 0, present = 0, absent = 0;
  for (const rec of studentRecords) {
    const entry = rec.records?.find((r) => r.studentId === studentId);
    if (entry) { total++; if (entry.present) present++; else absent++; }
  }
  return { total, present, absent };
}

export async function getStudentAttendanceRecords(schoolId, studentId) {
  const records = [];
  for (const rec of attendanceArray.filter((a) => a.schoolId === schoolId)) {
    const entry = rec.records?.find((r) => r.studentId === studentId);
    if (entry) records.push({ date: rec.date, classArm: rec.classArm, present: entry.present, status: entry.present ? "present" : "absent" });
  }
  return records.sort((a, b) => new Date(b.date) - new Date(a.date));
}
