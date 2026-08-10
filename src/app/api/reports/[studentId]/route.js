import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import {
  standingFromAverage,
  standingRemark,
  subjectRemark,
} from "@/lib/grading";
import { rankClassPosition } from "@/lib/ranking";
import {
  assertSameTenant,
  isDenied,
  requirePermission,
  requireClassScope,
  requireOwnChild,
} from "@/lib/policy";

/**
 * GET /api/reports/[studentId]
 * Full report-card payload (student + school + scores + summary) for a
 * specific student. SUPER_ADMIN/REGISTRAR may read any student in their
 * school; TEACHER only students in their assigned class arm; PARENT only
 * their own linked children.
 */
export async function GET(request, { params }) {
  const session = await requirePermission(
    ["SUPER_ADMIN", "REGISTRAR", "TEACHER", "PARENT"],
    "reports.view"
  );
  if (isDenied(session)) return session;

  const { studentId } = await params;
  const student = await store.findUserById(studentId);
  if (!student) return jsonError("Student not found", 404);
  const tenantErr = assertSameTenant(student, session);
  if (tenantErr) return tenantErr;
  if (student.role !== "STUDENT") return jsonError("Not a student account", 400);

  // Teachers only see students in their assigned class arm.
  const scope = await requireClassScope(session, { classArm: student.assignedClass, mode: "validate" });
  if (isDenied(scope)) return scope;

  // Parents may only read reports for their own linked children
  const child = await requireOwnChild(session, studentId, "You can only view reports for your own children");
  if (isDenied(child)) return child;

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
    // Only this student's arm is needed for the class position.
    const classScores = await store.getScoresByClassArm(session.schoolId, student.assignedClass);
    const classMap = {};
    classScores.forEach((s) => {
      if (!classMap[s.studentId]) classMap[s.studentId] = [];
      classMap[s.studentId].push(s);
    });
    const pos = rankClassPosition(studentId, classmates, classMap);
    position = pos.position;
    outOf = pos.outOf;
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
