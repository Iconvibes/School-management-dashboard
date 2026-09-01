import { store } from "@/lib/store";
import { invalidateSchoolAuthSnapshots, isDenied, requirePermission } from "@/lib/policy";

/**
 * POST /api/platform/schools/bulk
 * Bulk-delete multiple schools — platform admin only.
 *
 * Body: { schoolIds: string[] }
 *   Soft-deletes every listed school (30-day grace period).
 *   Skips the platform school and any already-deleted schools.
 *   Returns { deleted: number, skipped: string[], errors: string[] }.
 */
export async function POST(request) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { schoolIds } = body;
  if (!Array.isArray(schoolIds) || schoolIds.length === 0) {
    return Response.json({ error: "schoolIds must be a non-empty array" }, { status: 400 });
  }

  if (schoolIds.length > 50) {
    return Response.json({ error: "Cannot delete more than 50 schools at once" }, { status: 400 });
  }

  const deleted = [];
  const skipped = [];
  const errors = [];

  for (const id of schoolIds) {
    try {
      const school = await store.getSchoolById(id);
      if (!school) {
        skipped.push(id);
        continue;
      }
      // Never delete the platform school
      if (school.isPlatformSchool) {
        skipped.push(id);
        continue;
      }
      // Skip already-deleted schools
      if (school.status === "deleted") {
        skipped.push(id);
        continue;
      }

      const ok = await store.deleteSchool(id);
      if (ok) {
        deleted.push(id);
        await invalidateSchoolAuthSnapshots(id);
      } else {
        errors.push(id);
      }
    } catch {
      errors.push(id);
    }
  }

  // Audit log for the bulk action
  if (deleted.length > 0) {
    try {
      await store.createAuditLog({
        action: "school_deleted",
        actor: "Platform Admin",
        schoolId: null,
        schoolName: `${deleted.length} schools`,
        description: `Platform admin bulk-deleted ${deleted.length} school(s)`,
        meta: { schoolIds: deleted, triggeredBy: session.userId },
      });
    } catch {
      // Non-blocking
    }

    // Platform alert
    try {
      await store.createPlatformAlert({
        schoolId: null,
        schoolName: "",
        type: "school_deleted",
        severity: "warning",
        title: `${deleted.length} schools deleted`,
        message: `Platform admin bulk-deleted ${deleted.length} school(s). Data is recoverable for 30 days.`,
        meta: { count: deleted.length },
      });
    } catch {
      // Non-blocking
    }
  }

  return Response.json({ deleted: deleted.length, skipped, errors });
}
