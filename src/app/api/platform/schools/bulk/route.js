import { store } from "@/lib/store";
import { invalidateSchoolAuthSnapshots, isDenied, requirePermission } from "@/lib/policy";

/**
 * POST /api/platform/schools/bulk
 * Bulk manage multiple schools — platform admin only.
 *
 * Body: { schoolIds: string[], action: "delete" | "freeze" | "unfreeze" | "restore" | "change-plan", plan?: string }
 *   - delete: soft-deletes every listed school (30-day grace period)
 *   - freeze: freezes schools (blocks non-admin logins)
 *   - unfreeze: unfreezes frozen schools
 *   - restore: restores deleted schools within grace period
 *   - change-plan: changes billing plan (requires `plan` field)
 *
 * Returns { success: number, skipped: string[], errors: string[] }
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

  const { schoolIds, action, plan } = body;
  if (!Array.isArray(schoolIds) || schoolIds.length === 0) {
    return Response.json({ error: "schoolIds must be a non-empty array" }, { status: 400 });
  }
  if (!["delete", "freeze", "unfreeze", "restore", "change-plan"].includes(action)) {
    return Response.json({ error: "action must be delete|freeze|unfreeze|restore|change-plan" }, { status: 400 });
  }
  if (action === "change-plan" && !plan) {
    return Response.json({ error: "plan is required for change-plan action" }, { status: 400 });
  }
  if (schoolIds.length > 50) {
    return Response.json({ error: "Cannot process more than 50 schools at once" }, { status: 400 });
  }

  const results = [];
  const skipped = [];
  const errors = [];

  for (const id of schoolIds) {
    try {
      const school = await store.getSchoolById(id);
      if (!school) {
        skipped.push(id);
        continue;
      }
      // Never modify the platform school
      if (school.isPlatformSchool) {
        skipped.push(id);
        continue;
      }

      let ok = false;

      switch (action) {
        case "delete": {
          if (school.status === "deleted") { skipped.push(id); continue; }
          ok = await store.deleteSchool(id);
          if (ok) await invalidateSchoolAuthSnapshots(id);
          break;
        }
        case "freeze": {
          if (school.status !== "active") { skipped.push(id); continue; }
          ok = await store.setSchoolStatus(id, "frozen");
          if (ok) await invalidateSchoolAuthSnapshots(id);
          break;
        }
        case "unfreeze": {
          if (school.status !== "frozen") { skipped.push(id); continue; }
          ok = await store.setSchoolStatus(id, "active");
          if (ok) await invalidateSchoolAuthSnapshots(id);
          break;
        }
        case "restore": {
          if (school.status !== "deleted") { skipped.push(id); continue; }
          // Check grace period
          const GRACE_MS = 30 * 24 * 60 * 60 * 1000;
          if (school.deletedAt && Date.now() - new Date(school.deletedAt).getTime() > GRACE_MS) {
            skipped.push(id);
            continue;
          }
          ok = await store.setSchoolStatus(id, "active");
          if (ok) await invalidateSchoolAuthSnapshots(id);
          break;
        }
        case "change-plan": {
          if (typeof store.updateSchool === "function") {
            ok = await store.updateSchool(id, { billingPlan: plan });
          } else {
            // Fallback: directly mutate via setSchoolStatus won't work for plan,
            // so we try the school store's update function
            skipped.push(id);
          }
          break;
        }
      }

      if (ok) {
        results.push(id);
      } else {
        errors.push(id);
      }
    } catch {
      errors.push(id);
    }
  }

  // Audit log for the bulk action
  if (results.length > 0) {
    const actionLabels = {
      delete: "bulk-deleted",
      freeze: "bulk-frozen",
      unfreeze: "bulk-unfrozen",
      restore: "bulk-restored",
      "change-plan": `bulk plan changed to ${plan}`,
    };
    try {
      await store.createAuditLog({
        action: `school_${action.replace("-", "_")}`,
        actor: "Platform Admin",
        schoolId: null,
        schoolName: `${results.length} schools`,
        description: `Platform admin ${actionLabels[action]} ${results.length} school(s)`,
        meta: { schoolIds: results, action, plan: plan || "", triggeredBy: session.userId },
      });
    } catch {
      // Non-blocking
    }

    try {
      await store.createPlatformAlert({
        schoolId: null,
        schoolName: "",
        type: `school_${action.replace("-", "_")}`,
        severity: action === "delete" || action === "freeze" ? "warning" : "info",
        title: `${results.length} schools ${actionLabels[action]}`,
        message: `Platform admin ${actionLabels[action]} ${results.length} school(s).`,
        meta: { count: results.length, action, plan: plan || "" },
      });
    } catch {
      // Non-blocking
    }
  }

  return Response.json({ success: results.length, skipped, errors });
}
