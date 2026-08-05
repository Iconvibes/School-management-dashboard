import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import {
  standingFromAverage,
  standingRemark,
  subjectRemark,
} from "@/lib/grading";

/**
 * GET /api/reports/[studentId]
 * Full report-card payload (student + school + scores + summary) for a
 * specific student. SUPER_ADMIN may read any student in their school;
 * TEACHER only students in their assigned class arm.
 */
export async function GET(request, { params }) {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN" && session.role !== "TEACHER" && session.role !== "PARENT") {
    return jsonError("Forbidden", 403);
  }

  const { studentId } = await params;
  const student = await store.findUserById(studentId);
  if (!student) return jsonError("Student not found", 404);
  if (student.schoolId !== session.schoolId) return jsonError("Forbidden", 403);
  if (student.role !== "STUDENT") return jsonError("Not a student account", 400);

  // Teachers only see students in their assigned class arm.
  // Unassigned teachers may not read any report until assigned a class.
  if (session.role === "TEACHER") {
    const teacher = await store.findUserById(session.userId);
    if (!teacher) return jsonError("Account no longer exists", 401);
    if (!teacher.assignedClass) {
      return jsonError("You have not been assigned a class arm yet. Contact your school admin.", 403);
    }
    if (student.assignedClass !== teacher.assignedClass) {
      return jsonError("Teachers can only view students in their assigned class", 403);
    }
  }

  // Parents may only read reports for their own linked children
  if (session.role === "PARENT") {
    const children = await store.getChildren(session.userId);
    if (!children.some((c) => c.id === studentId)) {
      return jsonError("You can only view reports for your own children", 403);
    }
  }

  const [scores, school, attendance] = await Promise.all([
    store.getScoresByStudent(studentId),
    store.getSchoolById(session.schoolId),
    store.getStudentAttendanceSummary(session.schoolId, studentId),
  ]);

  const total = scores.reduce((acc, s) => acc + s.totalScore, 0);
  const average = scores.length ? total / scores.length : 0;
  const standing = standingFromAverage(average);

  // Class position within this student's arm (1st, 2nd, …) based on averages
  let position = null;
  let outOf = null;
  if (student.assignedClass) {
    const classmates = await store.listUsers({
      schoolId: session.schoolId,
      role: "STUDENT",
      classArm: student.assignedClass,
    });
    const classScores = await store.getScoresBySchool(session.schoolId);
    const ranked = classmates
      .map((c) => {
        const sc = classScores.filter((s) => s.studentId === c.id);
        const avg = sc.length ? sc.reduce((a, s) => a + s.totalScore, 0) / sc.length : 0;
        return { id: c.id, avg };
      })
      .sort((a, b) => b.avg - a.avg);
    position = ranked.findIndex((r) => r.id === studentId) + 1;
    outOf = ranked.length;
    if (position <= 0) position = null;
  }

  return Response.json({
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      assignedClass: student.assignedClass || "",
    },
    school: {
      name: school?.name || "",
      logoUrl: school?.logoUrl || "",
      brandColor: school?.brandColor || "#2563EB",
      currentSession: school?.currentSession || "",
      currentTerm: school?.currentTerm || "",
    },
    scores: scores.map((s) => ({
      ...s,
      remark: subjectRemark(s.grade),
    })),
    attendance,
    summary: {
      subjects: scores.length,
      average: Math.round(average * 100) / 100,
      position,
      outOf,
      standing: {
        label: standing.label,
        color: standing.color,
        remark: standingRemark(standing.label),
      },
    },
  });
}
