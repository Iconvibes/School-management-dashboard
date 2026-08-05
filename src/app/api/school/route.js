import { getSession, jsonError } from "@/lib/auth";
import { store } from "@/lib/store";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  const school = await store.getSchoolById(session.schoolId);
  if (!school) return jsonError("School not found", 404);
  return Response.json({ school });
}

export async function PATCH(request) {
  const session = await getSession();
  if (!session) return jsonError("Not authenticated", 401);
  if (session.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const school = await store.updateSchool(session.schoolId, {
    name: body.name,
    logoUrl: body.logoUrl,
    brandColor: body.brandColor,
    activeArms: body.activeArms,
    currentSession: body.currentSession,
    currentTerm: body.currentTerm,
  });

  if (!school) return jsonError("School not found", 404);
  return Response.json({ school });
}
