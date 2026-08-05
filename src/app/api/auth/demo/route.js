import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { setAuthCookie, jsonError } from "@/lib/auth";
import { isDemoMode } from "@/lib/db";

/**
 * POST /api/auth/demo — one-click exploration of the seeded demo school.
 * Only enabled in demo mode (no MONGODB_URI). Signs in as the demo super admin.
 */
export async function POST() {
  if (!isDemoMode()) {
    return jsonError("The demo school is only available in demo mode", 403);
  }

  const user = await store.findUserByEmail("admin@edutrack.app");
  if (!user) return jsonError("Demo account not found", 404);

  const school = await store.getSchoolById(user.schoolId);

  const res = NextResponse.json({
    success: true,
    redirect: "/admin/dashboard",
    school: { id: school?.id, name: school?.name },
  });
  setAuthCookie(res, {
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });
  return res;
}
