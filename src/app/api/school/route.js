import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requireAuth } from "@/lib/policy";

export async function GET() {
  const session = await requireAuth();
  if (isDenied(session)) return session;
  const school = await store.getSchoolById(session.schoolId);
  if (!school) return jsonError("School not found", 404);
  return Response.json({ school });
}

export async function PATCH(request) {
  const session = await requireAuth(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

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
