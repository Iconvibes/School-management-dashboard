/**
 * Grading module — demo store implementation.
 * Functions: saveScores, getScoresByClassSubject, getScoresByStudent,
 *            getScoresBySchool, getScoresByClassArm, detectAcademicRisks, getTeacherPerformance
 */
import { scores, timetable, users, nid, clone, nowIso, persist } from "@/modules/shared/store-state";

export async function saveScores({ schoolId, classArm, subject, rows }) {
  const saved = [];
  for (const row of rows) {
    const ca1 = Math.min(10, Math.max(0, Number(row.ca1) || 0));
    const ca2 = Math.min(10, Math.max(0, Number(row.ca2) || 0));
    const ca3 = Math.min(10, Math.max(0, Number(row.ca3) || 0));
    const ca4 = Math.min(10, Math.max(0, Number(row.ca4) || 0));
    const caScore = row.ca1 !== undefined ? Math.min(40, ca1 + ca2 + ca3 + ca4) : Math.min(40, Math.max(0, Number(row.caScore) || 0));
    const examScore = Math.min(60, Math.max(0, Number(row.examScore) || 0));
    const totalScore = caScore + examScore;
    const grade = totalScore >= 70 ? "A" : totalScore >= 60 ? "B" : totalScore >= 50 ? "C" : totalScore >= 40 ? "D" : "F";
    let score = scores.find((s) => s.studentId === row.studentId && s.subject === subject && s.classArm === classArm);
    if (!score) { score = { id: nid("scr"), studentId: row.studentId, schoolId, subject, classArm, createdAt: nowIso() }; scores.push(score); }
    Object.assign(score, { ca1, ca2, ca3, ca4, caScore, examScore, totalScore, grade });
    saved.push(clone(score));
  }
  if (saved.length) persist();
  return saved;
}

export async function getScoresByClassSubject({ schoolId, classArm, subject }) {
  return scores.filter((s) => s.schoolId === schoolId && s.classArm === classArm && s.subject === subject).map(clone);
}

export async function getScoresByStudent(studentId) {
  return scores.filter((s) => s.studentId === studentId).map(clone);
}

export async function getScoresBySchool(schoolId) {
  return scores.filter((s) => s.schoolId === schoolId).map(clone);
}

export async function getScoresByClassArm(schoolId, classArm) {
  return scores.filter((s) => s.schoolId === schoolId && s.classArm === classArm).map(clone);
}

export async function detectAcademicRisks(schoolId) {
  const byStudent = {};
  for (const s of scores) {
    if (s.schoolId !== schoolId) continue;
    const key = `${s.studentId}::${s.subject}`;
    if (!byStudent[key]) byStudent[key] = [];
    byStudent[key].push(s);
  }
  const risks = [];
  for (const [, studentScores] of Object.entries(byStudent)) {
    studentScores.sort((a, b) => { if (a.session !== b.session) return a.session?.localeCompare(b.session); const o = { "First Term": 1, "Second Term": 2, "Third Term": 3 }; return (o[a.term] || 0) - (o[b.term] || 0); });
    if (studentScores.length < 2) continue;
    const latest = studentScores[studentScores.length - 1];
    const previous = studentScores[studentScores.length - 2];
    const latestAvg = (Number(latest.caScore) + Number(latest.examScore)) / 2;
    const previousAvg = (Number(previous.caScore) + Number(previous.examScore)) / 2;
    const drop = previousAvg - latestAvg;
    if (drop >= 15) risks.push({ studentId: latest.studentId, subject: latest.subject, classArm: latest.classArm || "", previousAverage: Math.round(previousAvg), currentAverage: Math.round(latestAvg), drop: Math.round(drop), severity: drop >= 25 ? "high" : "medium", previousTerm: previous.term, currentTerm: latest.term });
  }
  return risks.sort((a, b) => b.drop - a.drop);
}

export async function getTeacherPerformance(schoolId, teacherId) {
  const teacherEntries = timetable.filter((e) => e.schoolId === schoolId && e.teacherId === teacherId);
  const taughtClasses = [...new Set(teacherEntries.map((e) => `${e.subject}::${e.classArm}`))];
  const classMetrics = [];
  for (const combo of taughtClasses) {
    const [subject, classArm] = combo.split("::");
    const classScores = scores.filter((s) => s.schoolId === schoolId && s.subject === subject && s.classArm === classArm);
    if (classScores.length === 0) continue;
    const avg = classScores.reduce((sum, s) => sum + (Number(s.caScore) + Number(s.examScore)) / 2, 0) / classScores.length;
    const allSubjectScores = scores.filter((s) => s.schoolId === schoolId && s.subject === subject);
    const schoolAvg = allSubjectScores.reduce((sum, s) => sum + (Number(s.caScore) + Number(s.examScore)) / 2, 0) / Math.max(1, allSubjectScores.length);
    classMetrics.push({ subject, classArm, studentCount: classScores.length, averageScore: Math.round(avg), schoolAverage: Math.round(schoolAvg), vsSchool: Math.round(avg - schoolAvg) });
  }
  const overallAvg = classMetrics.length ? classMetrics.reduce((sum, m) => sum + m.averageScore, 0) / classMetrics.length : 0;
  return { teacherId, classMetrics, overallAverage: Math.round(overallAvg) };
}
