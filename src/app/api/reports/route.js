import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { computeGrade, standingFromAverage } from "@/lib/grading";

/**
 * GET /api/reports
 * Search and rank students across the school (or a single class arm).
 * - SUPER_ADMIN: all students in their school
 * - TEACHER:     students in their assigned class only
 * Query: ?search=name&classArm=SS1 Science&limit=50
 */
export async function GET(request) {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN" && session.role !== "TEACHER") {
    return jsonError("Forbidden", 403);
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").toLowerCase().trim();
  let classArm = searchParams.get("classArm") || undefined;
  const limit = Math.min(200, Number(searchParams.get("limit")) || 100);

  // Teachers are locked to their assigned class arm.
  // Unassigned teachers may only see students who are also unassigned.
  if (session.role === "TEACHER") {
    const teacher = await store.findUserById(session.userId);
    if (!teacher) return jsonError("Account no longer exists", 401);
    if (teacher.assignedClass) {
      if (classArm && classArm !== teacher.assignedClass) {
        return jsonError("Teachers can only view their assigned class", 403);
      }
      classArm = teacher.assignedClass;
    } else if (!classArm) {
      // No class arm filter: default to students without an assigned arm
      return jsonError("You have not been assigned a class arm yet. Contact your school admin.", 403);
    }
  }

  const [students, allScores] = await Promise.all([
    store.listUsers({ schoolId: session.schoolId, role: "STUDENT", classArm }),
    store.getScoresBySchool(session.schoolId),
  ]);

  const scoreMap = {};
  allScores.forEach((s) => {
    if (!scoreMap[s.studentId]) scoreMap[s.studentId] = [];
    scoreMap[s.studentId].push(s);
  });

  // Rank ALL students in the scope by average first, then apply search.
  // This gives real class positions (1st, 2nd, 3rd…) within the arm.
  const ranked = students
    .map((u) => {
      const sc = scoreMap[u.id] || [];
      const total = sc.reduce((acc, s) => acc + s.totalScore, 0);
      const average = sc.length ? total / sc.length : 0;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        assignedClass: u.assignedClass || "",
        feePaid: u.feePaid,
        subjects: sc.length,
        average: Math.round(average * 100) / 100,
        grade: sc.length ? computeGrade(Math.round(average)) : null,
        standing: standingFromAverage(average).label,
      };
    })
    .sort((a, b) => b.average - a.average);

  // Position is index+1 within the full ranked class list
  ranked.forEach((r, i) => {
    r.position = i + 1;
    r.outOf = ranked.length;
  });

  const rows = ranked
    .filter((u) =>
      search
        ? (u.name + " " + u.email + " " + (u.assignedClass || "")).toLowerCase().includes(search)
        : true
    )
    .slice(0, limit);

  return Response.json({ students: rows });
}
