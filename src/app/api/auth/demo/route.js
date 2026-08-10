import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { setAuthCookie, jsonError } from "@/lib/auth";
import { isDemoMode } from "@/lib/db";
import { demoSeedEnabled } from "@/lib/demo-store.js";
import { checkRateLimit } from "@/lib/rate-limit";
import { ROLE_HOME } from "@/lib/portal-guard";

/**
 * POST /api/auth/demo — one-click exploration of the seeded demo school.
 * Only enabled in demo mode (no MONGODB_URI) AND when demo seeding is
 * enabled (SEED_DEMO_SCHOOL, off by default in production). Signs in as the
 * demo super admin.
 */
export async function POST(request) {
  const limited = checkRateLimit({
    request,
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: "auth-demo",
  });
  if (limited) return limited;

  if (!isDemoMode()) {
    return jsonError("The demo school is only available in demo mode", 403);
  }
  if (!demoSeedEnabled()) {
    return jsonError("The demo school is disabled on this deployment", 403);
  }

  const user = await store.findUserByEmail("admin@edutrack.app");
  if (!user) return jsonError("Demo account not found", 404);

  const school = await store.getSchoolById(user.schoolId);

  const res = NextResponse.json({
    success: true,
    redirect: ROLE_HOME[user.role] || "/admin/dashboard",
    school: { id: school?.id, name: school?.name },
  });
  setAuthCookie(res, {
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
    tokenVersion: user.tokenVersion || 0,
  });
  return res;
}
