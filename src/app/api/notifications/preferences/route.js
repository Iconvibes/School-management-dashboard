import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/notifications/preferences — get current user's notification preferences
 * PUT /api/notifications/preferences — update notification preferences
 */
export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER", "PARENT", "STUDENT"]);
  if (isDenied(session)) return session;

  const prefs = await store.getNotificationPreferences(session.schoolId, session.userId);
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER", "PARENT", "STUDENT"]);
  if (isDenied(session)) return session;

  const body = await req.json();
  const prefs = await store.updateNotificationPreferences(session.schoolId, session.userId, body);
  return NextResponse.json({ preferences: prefs });
}
