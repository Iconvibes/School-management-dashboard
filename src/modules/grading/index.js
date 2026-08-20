/**
 * Grading Module — Manages scores, grading, report cards, and academic risk detection.
 *
 * Store functions: saveScores, getScoresByClassSubject, getScoresByStudent,
 *   getScoresBySchool, getScoresByClassArm, detectAcademicRisks,
 *   getTeacherPerformance
 * API routes: /api/scores, /api/reports, /api/academic-risk, /api/teacher/performance
 * Components: MatrixView, ReportsView, ReportCard, ReportCardModal, RiskAlerts, TeacherPerformance
 * Models: Score
 */
export * from "./store";
