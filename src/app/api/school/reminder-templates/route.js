import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { reminderTemplatesSchema, firstValidationMessage } from "@/lib/validation";

const MAX_LENGTH = 4000;

/**
 * Per-school fee-reminder wording — the persisted { parent, student }
 * templates the Send reminder modal prefills and term-rollover automatic
 * reminders reuse. Blank = the built-in copy (see src/lib/notifications.js).
 *
 * GET  — { templates: { parent, student } } (both "" when never customized)
 * PUT  — body { parent?, student? }; both trimmed and clamped to 4000 chars;
 *        blank values mean \"use the built-in copy\". Returns the saved pair.
 *
 * Only roles that can send reminders (SUPER_ADMIN, BURSAR with fees.remind)
 * may read or write the wording.
 */
export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.remind");
  if (isDenied(session)) return session;

  const school = await store.getSchoolById(session.schoolId);
  if (!school) return jsonError("School not found", 404);
  return Response.json({ templates: school.reminderTemplates || {} });
}

export async function PUT(request) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.remind");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const invalid = firstValidationMessage(reminderTemplatesSchema, body);
  if (invalid) return jsonError(invalid);
  const parent = typeof body?.parent === "string" ? body.parent.trim() : "";
  const student = typeof body?.student === "string" ? body.student.trim() : "";

  const school = await store.updateSchool(session.schoolId, {
    reminderTemplates: { parent, student },
  });
  if (!school) return jsonError("School not found", 404);

  return Response.json({ templates: school.reminderTemplates || { parent, student } });
}
