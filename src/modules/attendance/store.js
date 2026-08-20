/**
 * Attendance module — demo store implementation.
 * Functions: getAttendance, saveAttendance, getStudentAttendanceSummary, getStudentAttendanceRecords
 */
import { attendance as attendanceArray, schools, clone, nowIso, persist } from "@/modules/shared/store-state";

export async function getAttendance(schoolId, classArm, date) {
  const records = attendanceArray.filter((a) => a.schoolId === schoolId && a.classArm === classArm && a.date === date);
  return records.length > 0 ? clone(records[0]) : null;
}

export async function saveAttendance(schoolId, classArm, date, records) {
  const existing = attendanceArray.findIndex((a) => a.schoolId === schoolId && a.classArm === classArm && a.date === date);
  const record = { schoolId, classArm, date, records, createdAt: nowIso() };
  if (existing >= 0) attendanceArray[existing] = record; else attendanceArray.push(record);
  persist();
  return clone(record);
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
