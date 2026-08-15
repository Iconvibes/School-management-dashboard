import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { digestSchema, firstValidationMessage } from "@/lib/validation";

/**
 * GET /api/admin/digest
 * The calling admin's digest schedule + their digest history (newest first).
 * digest.manage (SUPER_ADMIN). Read state is per admin, so prefs and history
 * are scoped to the caller.
 */
export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN"], "digest.manage");
  if (isDenied(session)) return session;

  const [pref, digests] = await Promise.all([
    store.getDigestPref(session.schoolId, session.userId),
    store.listDigests(session.schoolId, session.userId),
  ]);

  return Response.json({ pref, digests });
}

/**
 * PUT /api/admin/digest
 * Body: { frequency: "off" | "daily" | "weekly" } — the calling admin's
 * digest schedule. Never affects other admins.
 */
export async function PUT(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "digest.manage");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const invalid = firstValidationMessage(digestSchema, body);
  if (invalid) return jsonError(invalid);

  const pref = await store.setDigestPref(session.schoolId, session.userId, body.frequency);
  return Response.json({ pref });
}
