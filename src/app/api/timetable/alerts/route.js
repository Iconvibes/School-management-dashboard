import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requireAuth } from "@/lib/policy";
import { classAlertSchema, firstValidationMessage } from "@/lib/validation";

// The lead times the scheduler offers ("ring X minutes before the period").
const LEAD_OPTIONS = Object.freeze([0, 5, 10, 15, 30]);

/**
 * GET /api/timetable/alerts — the CALLER's own class-alert preferences
 * (enabled, leadMinutes, soundOn). Any authenticated user may read their own;
 * the store keys the row by (schoolId, userId) so it can never leak another
 * user's setting. Returns the defaults when never set.
 */
export async function GET() {
  const session = await requireAuth();
  if (isDenied(session)) return session;
  const prefs = await store.getClassAlertPref(session.schoolId, session.userId);
  return Response.json({ prefs });
}

/** PUT /api/timetable/alerts — update any subset of the caller's prefs. */
export async function PUT(request) {
  const session = await requireAuth();
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  // Coerce form/JSON booleans liberally (true/"true"/1 → true) so the admin
  // UI's string payloads land the same way as the pure JSON ones.
  const toBool = (v) => v === true || v === "true" || v === 1 || v === "1";
  const patch = {};
  if (body.enabled !== undefined) patch.enabled = toBool(body.enabled);
  if (body.soundOn !== undefined) patch.soundOn = toBool(body.soundOn);
  if (body.leadMinutes !== undefined) {
    const invalid = firstValidationMessage(classAlertSchema, body);
    if (invalid) return jsonError(invalid, 400);
    patch.leadMinutes = Number(body.leadMinutes);
  }

  const prefs = await store.setClassAlertPref(session.schoolId, session.userId, patch);
  return Response.json({ prefs });
}
