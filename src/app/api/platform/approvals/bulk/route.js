import { store } from "@/lib/store";
import { requirePermission, isDenied } from "@/lib/policy";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAuditLog, createPlatformAlert } from "@/modules/platform/store";

/**
 * POST /api/platform/approvals/bulk
 * Bulk approve or reject multiple pending school registrations.
 * Body: { schoolIds: string[], action: "approve" | "reject", reason?: string }
 */
export async function POST(request) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  // Rate limit: 5 bulk approval operations per 15 minutes per IP.
  // Bulk operations are expensive (emails, audit logs, alerts per school)
  // and dangerous in bulk — a single abused session can't spam-approve.
  const limited = await checkRateLimit({
    request,
    windowMs: 15 * 60 * 1000,
    max: 5,
    prefix: "platform-bulk-approval",
  });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { schoolIds, action, reason } = body;
  if (!Array.isArray(schoolIds) || schoolIds.length === 0 || !["approve", "reject"].includes(action)) {
    return Response.json(
      { error: "schoolIds (non-empty array) and action (approve|reject) required" },
      { status: 400 }
    );
  }

  if (schoolIds.length > 50) {
    return Response.json(
      { error: "Cannot process more than 50 schools in a single bulk operation" },
      { status: 400 }
    );
  }

  const results = [];
  const errors = [];

  for (const schoolId of schoolIds) {
    try {
      const school = await store.getSchoolById(schoolId);
      if (!school) {
        errors.push({ schoolId, error: "School not found" });
        continue;
      }
      if (school.status !== "pending_approval") {
        errors.push({ schoolId, error: "School is not pending approval" });
        continue;
      }

      let updatedSchool;
      if (action === "approve") {
        updatedSchool = await store.approveSchool(schoolId, session.userId);
      } else {
        updatedSchool = await store.rejectSchool(schoolId, reason || "", session.userId);
      }

      if (!updatedSchool) {
        errors.push({ schoolId, error: "Failed to update school status" });
        continue;
      }

      // Send email (non-blocking)
      try {
        const users = await store.listUsers({ schoolId });
        const adminUser = users.find((u) => u.role === "SUPER_ADMIN");
        if (adminUser) {
          const { sendApprovalEmail, sendRejectionEmail } = await import("@/lib/password-reset");
          if (action === "approve") {
            await sendApprovalEmail({
              schoolId,
              adminEmail: adminUser.email,
              adminName: adminUser.name,
              schoolName: school.name,
            });
          } else {
            await sendRejectionEmail({
              schoolId,
              adminEmail: adminUser.email,
              adminName: adminUser.name,
              schoolName: school.name,
              reason: reason || "",
            });
          }
        }
      } catch {
        // Non-fatal
      }

      // Audit log
      try {
        await createAuditLog({
          action: action === "approve" ? "school_approved" : "school_rejected",
          actor: "Platform Admin",
          schoolId,
          schoolName: school.name,
          description: action === "approve"
            ? `${school.name} was approved by platform admin (bulk)`
            : `${school.name} was rejected by platform admin (bulk). Reason: ${reason || "No reason provided"}`,
          meta: { reason: reason || "", action, bulk: true },
        });
      } catch {
        // Non-fatal
      }

      // Platform alert
      try {
        await createPlatformAlert({
          schoolId,
          schoolName: school.name,
          type: action === "approve" ? "school_approved" : "school_rejected",
          severity: action === "approve" ? "info" : "warning",
          title: action === "approve"
            ? `School approved: ${school.name}`
            : `School rejected: ${school.name}`,
          message: action === "approve"
            ? `${school.name} has been approved and can now access the platform.`
            : `${school.name} registration was rejected. Reason: ${reason || "No reason provided"}`,
          meta: { action, reason: reason || "", bulk: true },
        });
      } catch {
        // Non-fatal
      }

      results.push({ schoolId, name: school.name, status: action === "approve" ? "active" : "rejected" });
    } catch (err) {
      errors.push({ schoolId, error: err.message || "Unexpected error" });
    }
  }

  return Response.json({
    success: errors.length === 0,
    approved: action === "approve" ? results.length : 0,
    rejected: action === "reject" ? results.length : 0,
    results,
    errors,
  });
}
