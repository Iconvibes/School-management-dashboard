import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * In-memory digest preferences for the platform admin.
 * Tracks frequency, lastSentAt, and nextSendAt for scheduling.
 */
const platformDigestPrefs = new Map();

// ── Expose prefs for the cron endpoint ──
export { platformDigestPrefs };

/**
 * Compute the next send time based on frequency and current time.
 * Daily → tomorrow at 08:00 UTC.  Weekly → next Monday at 08:00 UTC.
 */
function computeNextSendAt(frequency) {
  if (frequency === "off" || !frequency) return null;
  const now = new Date();
  const next = new Date(now);

  if (frequency === "daily") {
    // Tomorrow at 08:00 UTC
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(8, 0, 0, 0);
  } else if (frequency === "weekly") {
    // Next Monday at 08:00 UTC
    const day = next.getUTCDay(); // 0=Sun … 6=Sat
    const daysUntilMon = day === 0 ? 1 : 8 - day;
    next.setUTCDate(next.getUTCDate() + daysUntilMon);
    next.setUTCHours(8, 0, 0, 0);
  }

  return next.toISOString();
}

/**
 * GET /api/platform/digest
 * Get the platform admin's digest preferences and history.
 */
export async function GET() {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  const pref = platformDigestPrefs.get(session.userId) || {
    frequency: "daily",
    lastSentAt: null,
    nextSendAt: null,
  };

  // Compute nextSendAt if not set
  if (!pref.nextSendAt && pref.frequency !== "off") {
    pref.nextSendAt = computeNextSendAt(pref.frequency);
  }

  const history = [];
  try {
    const digests = await store.listDigests?.("platform", session.userId);
    if (digests) history.push(...digests);
  } catch {
    // Digest history may not be available
  }

  return Response.json({ pref, history });
}

/**
 * PUT /api/platform/digest
 * Update the platform admin's digest preferences.
 * Body: { frequency: "off" | "daily" | "weekly" }
 */
export async function PUT(request) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const valid = ["off", "daily", "weekly"];
  if (!valid.includes(body.frequency)) {
    return Response.json(
      { error: "frequency must be one of: off, daily, weekly" },
      { status: 400 }
    );
  }

  const existing = platformDigestPrefs.get(session.userId) || {
    frequency: "daily",
    lastSentAt: null,
  };
  const pref = {
    ...existing,
    frequency: body.frequency,
    nextSendAt: computeNextSendAt(body.frequency),
    updatedAt: new Date().toISOString(),
  };
  platformDigestPrefs.set(session.userId, pref);

  return Response.json({ pref });
}
