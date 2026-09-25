/**
 * Mongo store — scores domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  School,
  User,
  Score,
  FeeStructure,
  FeePayment,
  Attendance,
  computeGrade,
  ready,
} from "./shared.js";

// ---- Scores ----------------------------------------------------------------

export async function saveScores({ schoolId, classArm, subject, rows }) {
  await ready();
  const saved = [];
  for (const row of rows) {
    // Support both legacy (caScore) and new (ca1-4) formats
    const ca1 = Math.min(10, Math.max(0, Number(row.ca1) || 0));
    const ca2 = Math.min(10, Math.max(0, Number(row.ca2) || 0));
    const ca3 = Math.min(10, Math.max(0, Number(row.ca3) || 0));
    const ca4 = Math.min(10, Math.max(0, Number(row.ca4) || 0));
    const caScore = row.ca1 !== undefined ? Math.min(40, ca1 + ca2 + ca3 + ca4) : Math.min(40, Math.max(0, Number(row.caScore) || 0));
    const examScore = Math.min(60, Math.max(0, Number(row.examScore) || 0));
    const totalScore = caScore + examScore;
    const grade = computeGrade(totalScore);
    const update = { schoolId, ca1, ca2, ca3, ca4, caScore, examScore, totalScore, grade };
    const score = await Score.findOneAndUpdate(
      { studentId: row.studentId, schoolId, subject, classArm },
      update,
      { upsert: true, new: true }
    );
    saved.push(score.toJSON());
  }
  return saved;
}

export async function getScoresByClassSubject({ schoolId, classArm, subject }) {
  await ready();
  return (await Score.find({ schoolId, classArm, subject })).map((s) => s.toJSON());
}

export async function getScoresByStudent(studentId) {
  await ready();
  return (await Score.find({ studentId }).sort({ subject: 1 })).map((s) => s.toJSON());
}

export async function getScoresBySchool(schoolId) {
  await ready();
  return (await Score.find({ schoolId })).map((s) => s.toJSON());
}

/**
 * Arm-scoped scores — ranking/report-card comparisons that only need one
 * class arm load a bounded slice instead of the whole school's score table
 * (the 10k-user ceiling: 10k students × 5 subjects ≈ 50k docs per request).
 */
export async function getScoresByClassArm(schoolId, classArm) {
  await ready();
  return (await Score.find({ schoolId, classArm })).map((s) => s.toJSON());
}

export async function getDashboardStats(schoolId) {
  await ready();
  const [students, teachers, paidTeachers, feePaid, scoreRecords] = await Promise.all([
    User.countDocuments({ schoolId, role: "STUDENT" }),
    User.countDocuments({ schoolId, role: "TEACHER" }),
    User.countDocuments({ schoolId, role: "TEACHER", payrollStatus: "PAID" }),
    User.countDocuments({ schoolId, role: "STUDENT", feePaid: true }),
    Score.countDocuments({ schoolId }),
  ]);

  const studentUsers = await User.find({ schoolId, role: "STUDENT" }).select("assignedClass");
  const classDistribution = {};
  studentUsers.forEach((s) => {
    classDistribution[s.assignedClass || "Unassigned"] =
      (classDistribution[s.assignedClass || "Unassigned"] || 0) + 1;
  });

  const [structures, payments, studentList, school] = await Promise.all([
    FeeStructure.find({ schoolId }),
    FeePayment.find({ schoolId }),
    User.find({ schoolId, role: "STUDENT" }).select("assignedClass feePaid"),
    School.findById(schoolId),
  ]);
  // Scope fees to the school's CURRENT session+term so the overview reflects
  // "this term" (after a rollover, the old term's figures drop out). Only
  // CONFIRMED payments count as collected; PENDING awaits the school.
  const currentSession = school?.currentSession || "2025/2026";
  const currentTerm = school?.currentTerm || "First Term";
  const currentStructures = structures.filter(
    (f) => f.session === currentSession && f.term === currentTerm
  );
  const currentPayments = payments.filter(
    (p) => p.session === currentSession && p.term === currentTerm
  );
  const totalBilled = currentStructures.reduce(
    (acc, f) => acc + f.amount * (classDistribution[f.classArm] || 0),
    0
  );
  const totalCollected = currentPayments
    .filter((p) => p.status !== "PENDING")
    .reduce((acc, p) => acc + p.amount, 0);
  const pendingPayments = currentPayments.filter((p) => p.status === "PENDING");

  // Fee collection timeline — confirmed collections per calendar day for the
  // CURRENT term, ascending, capped to the last 30 days (the Overview's area
  // chart). Bounded on purpose: the full term history isn't needed on a card.
  const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const byDay = {};
  currentPayments
    .filter((p) => p.status !== "PENDING" && p.createdAt && p.createdAt.getTime() >= cutoff30)
    .forEach((p) => {
      const day = p.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + p.amount;
    });
  const collectionTimeline = Object.keys(byDay)
    .sort()
    .map((date) => ({ date, amount: byDay[date] }));

  // Attendance trend — present/absent per SCHOOL DAY for the current term,
  // last 7 days, ascending. Multiple arms marked on the same day collapse into
  // one point (the chart must never show duplicate dates). Aggregated in the
  // database (date is a YYYY-MM-DD string in the model).
  const trendRows = await Attendance.aggregate([
    { $match: { schoolId, session: currentSession, term: currentTerm } },
    { $unwind: { path: "$records" } },
    {
      $group: {
        _id: "$date",
        present: { $sum: { $cond: [{ $eq: ["$records.present", true] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$records.present", true] }, 0, 1] } },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: 7 },
  ]);
  const attendanceTrend = trendRows
    .map((r) => ({ date: r._id, present: r.present, absent: r.absent }))
    .sort((x, y) => String(x.date).localeCompare(String(y.date)));

  return {
    totalStudents: students,
    activeTeachers: teachers,
    payrollPaid: paidTeachers,
    payrollPending: teachers - paidTeachers,
    feeCollected: feePaid,
    feeRate: students ? Math.round((feePaid / students) * 100) : 0,
    feeCollectedAmount: totalCollected,
    feeOutstandingAmount: Math.max(0, totalBilled - totalCollected),
    feeBilledAmount: totalBilled,
    pendingPayments: {
      count: pendingPayments.length,
      amount: pendingPayments.reduce((acc, p) => acc + p.amount, 0),
    },
    classDistribution,
    totalScoreRecords: scoreRecords,
    collectionTimeline,
    attendanceTrend,
  };
}
