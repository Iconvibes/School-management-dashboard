import { store } from "@/lib/store";
import { requirePermission, isDenied } from "@/lib/policy";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAuditLog, createPlatformAlert } from "@/modules/platform/store";

/**
 * GET /api/platform/approvals
 * List schools pending approval (platform admin only).
 */
export async function GET() {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  const allSchools = await store.listSchoolIds();
  const schools = [];
  for (const id of allSchools) {
    const school = await store.getSchoolById(id);
    if (school && !school.isPlatformSchool) {
      const users = await store.listUsers({ schoolId: id });
      schools.push({
        ...school,
        userCount: users.length,
        adminEmail: users.find((u) => u.role === "SUPER_ADMIN")?.email || "",
        adminName: users.find((u) => u.role === "SUPER_ADMIN")?.name || "",
        userBreakdown: {
          students: users.filter((u) => u.role === "STUDENT").length,
          teachers: users.filter((u) => u.role === "TEACHER").length,
          parents: users.filter((u) => u.role === "PARENT").length,
          staff: users.filter((u) => ["BURSAR", "REGISTRAR"].includes(u.role)).length,
        },
        activeArmsList: school.activeArms || [],
      });
    }
  }

  // Return only pending_approval schools
  const pending = schools.filter((s) => s.status === "pending_approval");
  return Response.json({ schools: pending, total: pending.length });
}

/**
 * POST /api/platform/approvals
 * Approve or reject a pending school registration.
 * Body: { schoolId, action: "approve" | "reject", reason?: string }
 */
export async function POST(request) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  // Rate limit: 20 single approval operations per 15 minutes per IP.
  const limited = await checkRateLimit({
    request,
    windowMs: 15 * 60 * 1000,
    max: 20,
    prefix: "platform-single-approval",
  });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { schoolId, action, reason } = body;
  if (!schoolId || !["approve", "reject"].includes(action)) {
    return Response.json({ error: "schoolId and action (approve|reject) required" }, { status: 400 });
  }

  const school = await store.getSchoolById(schoolId);
  if (!school) {
    return Response.json({ error: "School not found" }, { status: 404 });
  }
  if (school.status !== "pending_approval") {
    return Response.json({ error: "School is not pending approval" }, { status: 400 });
  }

  let updatedSchool;
  if (action === "approve") {
    updatedSchool = await store.approveSchool(schoolId, session.userId);
  } else {
    updatedSchool = await store.rejectSchool(schoolId, reason || "", session.userId);
  }

  if (!updatedSchool) {
    return Response.json({ error: "Failed to update school status" }, { status: 500 });
  }

  // Find the school admin to notify
  let adminUser = null;
  try {
    const users = await store.listUsers({ schoolId });
    adminUser = users.find((u) => u.role === "SUPER_ADMIN");
  } catch {
    // Non-fatal
  }

  // Send approval/rejection email (non-blocking)
  try {
    const { sendApprovalEmail, sendRejectionEmail } = await import("@/lib/password-reset");
    if (action === "approve" && adminUser) {
      await sendApprovalEmail({
        schoolId,
        adminEmail: adminUser.email,
        adminName: adminUser.name,
        schoolName: school.name,
      });
    } else if (action === "reject" && adminUser) {
      await sendRejectionEmail({
        schoolId,
        adminEmail: adminUser.email,
        adminName: adminUser.name,
        schoolName: school.name,
        reason: reason || "",
      });
    }
  } catch {
    // Email failure is non-fatal — status change already committed
  }

  // Audit log
  try {
    await createAuditLog({
      action: action === "approve" ? "school_approved" : "school_rejected",
      actor: "Platform Admin",
      schoolId,
      schoolName: school.name,
      description: action === "approve"
        ? `${school.name} was approved by platform admin`
        : `${school.name} was rejected by platform admin. Reason: ${reason || "No reason provided"}`,
      meta: { reason: reason || "", action },
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
      meta: { action, reason: reason || "" },
    });
  } catch {
    // Non-fatal
  }

  return Response.json({ success: true, school: updatedSchool });
}
