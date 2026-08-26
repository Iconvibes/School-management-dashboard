import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { setAuthCookie } from "@/lib/auth";
import { IMPERSONATION_TIMEOUT_MS } from "@/lib/token";
import { NextResponse } from "next/server";
import { createPlatformAlert, createImpersonationSession } from "@/modules/platform/store";

/**
 * POST /api/platform/schools/[id]/impersonate
 * Platform admin impersonates a school admin for support/troubleshooting.
 * Creates a new session as the target user.
 */
export async function POST(req, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.impersonate");
  if (isDenied(session)) return session;

  const { id } = await params;
  const body = await req.json();
  const { userId } = body;

  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  // Get the target user
  const targetUser = await store.findUserById(userId);
  if (!targetUser) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // Verify the user belongs to this school
  if (targetUser.schoolId !== id) {
    return Response.json({ error: "User does not belong to this school" }, { status: 403 });
  }

  // Verify the user is an admin role
  if (!["SUPER_ADMIN", "BURSAR", "REGISTRAR"].includes(targetUser.role)) {
    return Response.json({ error: "Can only impersonate admin roles" }, { status: 400 });
  }

  // Get the auth snapshot for token version
  const authUser = await store.findAuthSnapshot(userId);
  if (!authUser) {
    return Response.json({ error: "User account not found" }, { status: 404 });
  }

  // Get school name for audit log
  const school = await store.getSchoolById(id);
  const schoolName = school?.name || id;

  // Log the impersonation event
  const actorName = session.user?.name || session.user?.email || "Platform Admin";
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
  
  // Create a session record for detailed audit trail tracking
  const impersonationSessionId = createImpersonationSession({
    impersonatorId: session.user?.id,
    impersonatorName: actorName,
    schoolId: id,
    schoolName,
    targetUserId: targetUser.id,
    targetUserName: targetUser.name,
    targetUserRole: targetUser.role,
    ip,
  });

  await store.createAuditLog({
    action: "impersonation",
    actor: actorName,
    schoolId: id,
    schoolName,
    description: `Impersonated ${targetUser.name} (${targetUser.role}) at ${schoolName} for support/troubleshooting`,
    meta: {
      sessionId: impersonationSessionId,
      impersonatorId: session.user?.id,
      impersonatorName: actorName,
      targetUserId: targetUser.id,
      targetUserName: targetUser.name,
      targetUserRole: targetUser.role,
      timeoutMs: IMPERSONATION_TIMEOUT_MS,
      duration: `${Math.round(IMPERSONATION_TIMEOUT_MS / 60000)} minutes max`,
      ip,
    },
    ip,
  });
  await createPlatformAlert({
    schoolId: id,
    schoolName,
    type: 'impersonation',
    severity: 'info',
    title: `${actorName} impersonating at ${schoolName}`,
    message: `${actorName} is impersonating ${targetUser.name} (${targetUser.role}) for up to ${Math.round(IMPERSONATION_TIMEOUT_MS / 60000)} minutes.`,
    meta: { sessionId: impersonationSessionId, targetUserName: targetUser.name, targetUserRole: targetUser.role },
  });

  const res = NextResponse.json({
    success: true,
    redirect: "/admin/dashboard",
    impersonating: {
      id: targetUser.id,
      name: targetUser.name,
      role: targetUser.role,
    },
  });

  // Set auth cookie as the impersonated user, with impersonation metadata
  setAuthCookie(res, {
    userId: targetUser.id,
    role: targetUser.role,
    schoolId: targetUser.schoolId,
    tokenVersion: authUser.tokenVersion || 0,
    // Impersonation tracking — used by policy.js to enforce timeout
    impersonatedAt: Date.now(),
    impersonatorId: session.user?.id || null,
    impersonatorName: session.user?.name || "Platform Admin",
    impersonationSessionId: impersonationSessionId,
  });

  return res;
}
