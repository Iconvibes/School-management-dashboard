import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requireAuth, requireClassScope } from "@/lib/policy";

export async function POST(request) {
  const session = await requireAuth(["SUPER_ADMIN", "TEACHER"]);
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const { classArm, subject, rows } = body;
  if (!classArm || !subject || !Array.isArray(rows) || rows.length === 0) {
    return jsonError("classArm, subject and rows[] are required");
  }

  // Teachers may only enter scores for their assigned arm.
  const scope = await requireClassScope(session, { classArm, mode: "resolve", unassigned: "allow" });
  if (isDenied(scope)) return scope;

  // Validate bounds
  for (const row of rows) {
    const ca = Number(row.caScore) || 0;
    const exam = Number(row.examScore) || 0;
    if (!row.studentId) return jsonError("Each row requires a studentId");
    if (ca < 0 || ca > 40) return jsonError("CA scores must be between 0 and 40");
    if (exam < 0 || exam > 60) return jsonError("Exam scores must be between 0 and 60");
  }

  // Tenant isolation: every scored student must belong to this school
  const tenantStudents = await store.listUsers({
    schoolId: session.schoolId,
    role: "STUDENT",
  });
  const tenantIds = new Set(tenantStudents.map((s) => s.id));
  const foreign = rows.find((r) => !tenantIds.has(r.studentId));
  if (foreign) {
    return jsonError("One or more students do not belong to your school", 403);
  }

  const saved = await store.saveScores({
    schoolId: session.schoolId,
    classArm,
    subject,
    rows,
  });

  return Response.json({ success: true, saved });
}

export async function GET(request) {
  const session = await requireAuth(["SUPER_ADMIN", "TEACHER"]);
  if (isDenied(session)) return session;

  const { searchParams } = new URL(request.url);
  const classArm = searchParams.get("classArm");
  const subject = searchParams.get("subject");

  if (!classArm || !subject) {
    return jsonError("classArm and subject query params are required");
  }

  // Teachers may only read their assigned arm.
  const scope = await requireClassScope(session, { classArm, mode: "resolve", unassigned: "allow" });
  if (isDenied(scope)) return scope;

  const scores = await store.getScoresByClassSubject({
    schoolId: session.schoolId,
    classArm,
    subject,
  });

  return Response.json({ scores });
}
