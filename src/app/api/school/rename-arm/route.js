import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * POST /api/school/rename-arm — rename one class arm across every reference.
 *
 * SUPER_ADMIN only (school.edit). A rename is a migration, not an edit: the
 * school's activeArms list, student/teacher assignedClass, teacher
 * assignedClasses arrays, fee structures, scores, attendance registers and
 * timetable entries all move to the new name atomically (per-store). The
 * response carries per-collection counts so the UI can say what moved.
 *
 * Deliberately a dedicated endpoint: the generic school PATCH replaces the
 * whole activeArms list and must never do that implicitly — a rename has to
 * be an explicit, validated, migration-aware operation.
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const result = await store.renameArm(
    session.schoolId,
    body?.from,
    body?.to
  );
  if (!result) return jsonError("School not found", 404);
  if (result.error) return jsonError(result.error, 400);

  return Response.json({ school: result.school, counts: result.counts });
}
