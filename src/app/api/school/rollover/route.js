import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * POST /api/school/rollover — move the school to a new term.
 *
 * SUPER_ADMIN only (school.edit). One atomic operation that:
 *   • ARCHIVES the old term's scores + attendance (snapshotted per arm into
 *     the term archive, then cleared from the live tables),
 *   • CLONES each arm's fee structure and the weekly timetable into the new
 *     term,
 *   • resets every student's feePaid and moves the school's
 *     currentSession/currentTerm, so all term-scoped reads switch over.
 *
 * Body: { newTerm, newSession?, dryRun? }. `dryRun: true` returns the exact
 * counts WITHOUT mutating anything — the UI shows the preview before the
 * SUPER_ADMIN confirms. Same-term rolls are rejected (400).
 *
 * Deliberately a dedicated endpoint (like rename-arm): switching terms is a
 * migration with an archive, never a bare school PATCH.
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

  const result = await store.rolloverTerm(session.schoolId, {
    newTerm: body?.newTerm,
    newSession: body?.newSession,
    dryRun: body?.dryRun === true,
  });
  if (!result) return jsonError("School not found", 404);
  if (result.error) return jsonError(result.error, 400);

  return Response.json({ school: result.school, counts: result.counts });
}
