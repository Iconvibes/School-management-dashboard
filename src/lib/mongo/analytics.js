/**
 * Mongo store — analytics domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  Score,
  TimetableEntry,
  ready,
} from "./shared.js";

// ── Academic Risk ───────────────────────────────────────────────────
export async function detectAcademicRisks(schoolId) {
  await ready();
  const allScores = await Score.find({ schoolId }).sort({ session: 1, term: 1 });
  const byStudent = {};
  for (const s of allScores) {
    const key = `${s.studentId}::${s.subject}`;
    if (!byStudent[key]) byStudent[key] = [];
    byStudent[key].push(s);
  }
  const risks = [];
  for (const [key, studentScores] of Object.entries(byStudent)) {
    if (studentScores.length < 2) continue;
    const latest = studentScores[studentScores.length - 1];
    const previous = studentScores[studentScores.length - 2];
    const latestAvg = (Number(latest.ca) + Number(latest.exam)) / 2;
    const previousAvg = (Number(previous.ca) + Number(previous.exam)) / 2;
    const drop = previousAvg - latestAvg;
    if (drop >= 15) {
      risks.push({
        studentId: latest.studentId, subject: latest.subject,
        classArm: latest.classArm || "",
        previousAverage: Math.round(previousAvg),
        currentAverage: Math.round(latestAvg),
        drop: Math.round(drop),
        severity: drop >= 25 ? "high" : "medium",
        previousTerm: previous.term, currentTerm: latest.term,
      });
    }
  }
  return risks.sort((a, b) => b.drop - a.drop);
}

// ── Teacher Performance ─────────────────────────────────────────────
export async function getTeacherPerformance(schoolId, teacherId) {
  await ready();
  const teacherEntries = await TimetableEntry.find({ schoolId, teacherId });
  const taughtClasses = [...new Set(teacherEntries.map((e) => `${e.subject}::${e.classArm}`))];
  const classMetrics = [];
  for (const combo of taughtClasses) {
    const [subject, classArm] = combo.split("::");
    const classScores = await Score.find({ schoolId, subject, classArm });
    if (classScores.length === 0) continue;
    const avg = classScores.reduce((sum, s) => sum + (Number(s.ca) + Number(s.exam)) / 2, 0) / classScores.length;
    const allSubjectScores = await Score.find({ schoolId, subject });
    const schoolAvg = allSubjectScores.reduce((sum, s) => sum + (Number(s.ca) + Number(s.exam)) / 2, 0) / Math.max(1, allSubjectScores.length);
    classMetrics.push({ subject, classArm, studentCount: classScores.length, averageScore: Math.round(avg), schoolAverage: Math.round(schoolAvg), vsSchool: Math.round(avg - schoolAvg) });
  }
  const overallAvg = classMetrics.length ? classMetrics.reduce((sum, m) => sum + m.averageScore, 0) / classMetrics.length : 0;
  return { teacherId, classMetrics, overallAverage: Math.round(overallAvg) };
}
