import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { subjectRemark } from "@/lib/grading";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "STUDENT" && session.role !== "SUPER_ADMIN") {
    return jsonError("Forbidden", 403);
  }

  const [scores, school, user, attendance, feeLedger] = await Promise.all([
    store.getScoresByStudent(session.userId),
    store.getSchoolById(session.schoolId),
    store.findUserById(session.userId),
    store.getStudentAttendanceSummary(session.schoolId, session.userId),
    store.getFeeLedger(session.schoolId),
  ]);

  const summary = scores.reduce(
    (acc, s) => {
      acc.total += s.totalScore;
      acc.subjects += 1;
      return acc;
    },
    { total: 0, subjects: 0 }
  );

  // Class position within the student's arm
  let position = null;
  let outOf = null;
  if (user?.assignedClass) {
    const classmates = await store.listUsers({
      schoolId: session.schoolId,
      role: "STUDENT",
      classArm: user.assignedClass,
    });
    const classScores = await store.getScoresBySchool(session.schoolId);
    const ranked = classmates
      .map((c) => {
        const sc = classScores.filter((s) => s.studentId === c.id);
        const avg = sc.length ? sc.reduce((a, s) => a + s.totalScore, 0) / sc.length : 0;
        return { id: c.id, avg };
      })
      .sort((a, b) => b.avg - a.avg);
    position = ranked.findIndex((r) => r.id === session.userId) + 1;
    outOf = ranked.length;
    if (position <= 0) position = null;
  }

  const fee = feeLedger.find((l) => l.studentId === session.userId);

  return Response.json({
    scores: scores.map((s) => ({ ...s, remark: subjectRemark(s.grade) })),
    school: {
      name: school?.name || "",
      logoUrl: school?.logoUrl || "",
      brandColor: school?.brandColor || "#2563EB",
      currentSession: school?.currentSession || "",
      currentTerm: school?.currentTerm || "",
    },
    attendance,
    fee: fee
      ? {
          amount: fee.amount,
          paid: fee.paid,
          balance: fee.balance,
          feePaid: fee.feePaid,
        }
      : { amount: 0, paid: 0, balance: 0, feePaid: false },
    summary: {
      subjects: summary.subjects,
      average: summary.subjects
        ? Math.round((summary.total / summary.subjects) * 100) / 100
        : 0,
      position,
      outOf,
    },
  });
}
