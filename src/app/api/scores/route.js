import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission, requireClassScope } from "@/lib/policy";
import { scoresSchema, firstValidationMessage } from "@/lib/validation";

export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"], "scores.enter");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const invalid = firstValidationMessage(scoresSchema, body);
  if (invalid) return jsonError(invalid);
  const { classArm, subject, rows } = scoresSchema.parse(body);

  // Teachers may only enter scores for arms they teach AND subjects they
  // teach (a Mathematics teacher cannot grade Physics — requireClassScope
  // enforces both gates).
  const scope = await requireClassScope(session, { classArm, subject, mode: "resolve", unassigned: "allow" });
  if (isDenied(scope)) return scope;

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
  const session = await requirePermission(["SUPER_ADMIN", "TEACHER"], "scores.view");
  if (isDenied(session)) return session;

  const { searchParams } = new URL(request.url);
  const classArm = searchParams.get("classArm");
  const subject = searchParams.get("subject");

  if (!classArm || !subject) {
    return jsonError("classArm and subject query params are required");
  }

  // Teachers may only read arms + subjects they teach.
  const scope = await requireClassScope(session, { classArm, subject, mode: "resolve", unassigned: "allow" });
  if (isDenied(scope)) return scope;

  const scores = await store.getScoresByClassSubject({
    schoolId: session.schoolId,
    classArm,
    subject,
  });

  return Response.json({ scores });
}
