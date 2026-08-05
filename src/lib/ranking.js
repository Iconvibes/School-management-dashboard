/**
 * Class ranking — the "average → sort → position = index+1" algorithm that was
 * copy-pasted across four route handlers (reports, reports/[studentId],
 * scores/student, parent/children) with drifting rounding and null handling.
 * Now it lives here, behind one seam, and is unit-testable.
 *
 * The store supplies raw data; these functions stay pure. Callers build the
 * standard score map from a score list:
 *
 *   const scoreMap = {};
 *   allScores.forEach((s) => {
 *     if (!scoreMap[s.studentId]) scoreMap[s.studentId] = [];
 *     scoreMap[s.studentId].push(s);
 *   });
 */

import { computeGrade, standingFromAverage } from "./grading.js";

/** 2-decimal average, the way report cards display it. */
export function roundAverage(avg) {
  return Math.round(avg * 100) / 100;
}

/**
 * Rank students by average total score, descending, and attach the report-card
 * fields. Rows are rebuilt from an explicit allow-list (never spread the raw
 * user row — the store's listUsers may include the password hash).
 *
 * @param {Array} students  user rows ({ id, name, email, assignedClass, feePaid })
 * @param {Object} scoreMap studentId -> [score, ...]
 * @returns {Array} rows with { id, name, email, assignedClass, feePaid,
 *   subjects, average, grade, standing, position, outOf } sorted by average
 *   descending; ties keep their input order (stable sort).
 */
export function rankStudents(students, scoreMap = {}) {
  return students
    .map((u) => {
      const sc = scoreMap[u.id] || [];
      const raw = sc.length
        ? sc.reduce((acc, s) => acc + s.totalScore, 0) / sc.length
        : 0;
      return { u, raw, subjects: sc.length };
    })
    .sort((a, b) => b.raw - a.raw)
    .map(({ u, raw, subjects }, i) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      assignedClass: u.assignedClass || "",
      feePaid: u.feePaid,
      subjects,
      average: roundAverage(raw),
      grade: subjects ? computeGrade(Math.round(raw)) : null,
      standing: standingFromAverage(raw).label,
      position: i + 1,
      outOf: students.length,
    }));
}

/**
 * A single student's position within their class. Returns
 * { position, outOf } — position is null when the student isn't in the list.
 */
export function rankClassPosition(studentId, classmates, scoreMap = {}) {
  const ranked = rankStudents(classmates, scoreMap);
  const idx = ranked.findIndex((r) => r.id === studentId);
  if (idx === -1) return { position: null, outOf: ranked.length };
  return { position: idx + 1, outOf: ranked.length };
}

/**
 * Rank every class arm once, in a single pass: returns
 * { [classArm]: { [studentId]: { position, outOf } } }.
 *
 * The parent portal used to re-rank the whole school per child (an N+1 loop);
 * this lets it resolve every child's position from one map.
 */
export function buildArmRankings(students, scoreMap = {}) {
  const byArm = {};
  for (const s of students) {
    const arm = s.assignedClass || "";
    if (!byArm[arm]) byArm[arm] = [];
    byArm[arm].push(s);
  }
  const out = {};
  for (const [arm, list] of Object.entries(byArm)) {
    out[arm] = {};
    rankStudents(list, scoreMap).forEach((r) => {
      out[arm][r.id] = { position: r.position, outOf: r.outOf };
    });
  }
  return out;
}
