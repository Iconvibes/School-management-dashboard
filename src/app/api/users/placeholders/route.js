import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import {
  parseCountCsv,
  planPlaceholders,
  applyImport,
  buildCredentials,
} from "@/lib/placeholders";
import { placeholdersSchema, firstValidationMessage } from "@/lib/validation";

/**
 * Paper-register onboarding (Phase 2).
 *
 * POST /api/users/placeholders
 *   body: {
 *     csv: "<Class Arm,Number of Students csv>",
 *     defaultPassword?: string
 *   }
 *
 * Generates placeholder student accounts ("Student 1", …) per class arm with
 * auto-generated logins. Idempotent: re-running the same counts creates
 * nothing new; recounting upward only creates the difference.
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN", "REGISTRAR"], "students.manage");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const invalid = firstValidationMessage(placeholdersSchema, body);
  if (invalid) return jsonError(invalid);
  const csv = typeof body.csv === "string" ? body.csv : "";
  const defaultPassword = String(body.defaultPassword || "");

  const parsed = parseCountCsv(csv);
  if (parsed.error) return jsonError(parsed.error, 400);
  if (parsed.errors?.length) return jsonError(parsed.errors.join(" · "), 400);

  const [school, existingUsers] = await Promise.all([
    store.getSchoolById(session.schoolId),
    store.listUsers({ schoolId: session.schoolId }),
  ]);
  if (!school) return jsonError("School not found", 404);

  // Student-count plan enforcement
  const currentStudents = existingUsers.filter((u) => u.role === "STUDENT").length;
  const addingStudents = parsed.pairs.reduce((sum, p) => sum + (p.count || 0), 0);
  const { checkStudentLimit } = await import("@/lib/paystack");
  const limit = checkStudentLimit(
    school.billingPlan || "trial",
    school.subscriptionStatus || "trial",
    currentStudents,
    addingStudents
  );
  if (!limit.allowed) {
    return jsonError(limit.message, 402, { planLimit: true, limit });
  }

  const planned = planPlaceholders({
    pairs: parsed.pairs,
    schoolName: school.name,
    activeArms: school.activeArms || [],
    existingUsers,
    defaultPassword,
  });

  // dryRun — preview only, write nothing.
  if (body.dryRun === true) {
    const safeRows = planned.plans.map(({ password: _pw, parentKey: _pk, ...row }) => row);
    return Response.json({
      dryRun: true,
      summary: planned.summary,
      arms: planned.arms,
      newArms: planned.newArms,
      rows: safeRows,
    });
  }

  const applied = await applyImport({
    store,
    schoolId: session.schoolId,
    role: "STUDENT",
    plans: planned.plans,
    parentRefs: planned.parentRefs,
    newArms: planned.newArms,
  });

  const failedRows = new Set(
    applied.failed.filter((f) => f.row != null).map((f) => f.row)
  );
  const okPlans = planned.plans.filter(
    (p) => p.status === "ok" && !failedRows.has(p.row)
  );
  const credentials = buildCredentials("STUDENT", okPlans, planned.parentRefs, {
    skipParentKeys: applied.failedParentKeys,
  });

  const safeRows = planned.plans.map(({ password: _pw, parentKey: _pk, ...row }) => row);

  return Response.json({
    summary: planned.summary,
    arms: planned.arms,
    newArms: planned.newArms,
    created: applied.created,
    failed: applied.failed,
    credentials,
    rows: safeRows,
  });
}
