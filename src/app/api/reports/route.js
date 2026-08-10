import { store } from "@/lib/store";
import { rankStudents } from "@/lib/ranking";
import { isDenied, requirePermission, requireClassScope } from "@/lib/policy";

/**
 * GET /api/reports
 * Search and rank students across the school (or a single class arm).
 * - SUPER_ADMIN / REGISTRAR: all students in their school
 * - TEACHER:                 students in their assigned class only
 * Query: ?search=name&classArm=SS1 Science&limit=50
 */
export async function GET(request) {
  const session = await requirePermission(["SUPER_ADMIN", "REGISTRAR", "TEACHER"], "reports.view");
  if (isDenied(session)) return session;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").toLowerCase().trim();
  let classArm = searchParams.get("classArm") || undefined;
  const limit = Math.min(200, Number(searchParams.get("limit")) || 100);

  // Teachers are locked to their assigned class arm; unassigned teachers must
  // request an explicit arm.
  const scope = await requireClassScope(session, { classArm, mode: "resolve", unassigned: "require-arm" });
  if (isDenied(scope)) return scope;
  classArm = scope.classArm;

  // When scoped to one arm, load only that arm's scores — not the whole
  // school's score table (10k students × ~5 subjects ≈ 50k docs otherwise).
  // The all-school view (no classArm) is inherently whole-school.
  const [students, allScores] = await Promise.all([
    store.listUsers({ schoolId: session.schoolId, role: "STUDENT", classArm }),
    classArm
      ? store.getScoresByClassArm(session.schoolId, classArm)
      : store.getScoresBySchool(session.schoolId),
  ]);

  const scoreMap = {};
  allScores.forEach((s) => {
    if (!scoreMap[s.studentId]) scoreMap[s.studentId] = [];
    scoreMap[s.studentId].push(s);
  });

  // Rank ALL students in the scope by average first, then apply search.
  // This gives real class positions (1st, 2nd, 3rd…) within the arm.
  const ranked = rankStudents(students, scoreMap);

  const rows = ranked
    .filter((u) =>
      search
        ? (u.name + " " + u.email + " " + (u.assignedClass || "")).toLowerCase().includes(search)
        : true
    )
    .slice(0, limit);

  return Response.json({ students: rows });
}
