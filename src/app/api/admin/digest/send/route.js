import { store } from "@/lib/store";
import { buildDigestEmail } from "@/lib/digest";
import { isDenied, requireAuth } from "@/lib/policy";

/**
 * POST /api/admin/digest/send
 * Compose and record the CALLING admin's digest right now, from their OWN
 * unread notifications (per-admin read state decides the content — an item
 * the admin already read is excluded even if a colleague hasn't seen it).
 *
 * Body: { frequency?: "daily" | "weekly" } — optional; when omitted the
 * admin's saved schedule is used (or "daily" if they have none yet).
 *
 * Returns the digest record so the UI can render the email immediately.
 */
export async function POST(request) {
  const session = await requireAuth(["SUPER_ADMIN"]);
  if (isDenied(session)) return session;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — fall back to the saved schedule.
  }

  const saved = await store.getDigestPref(session.schoolId, session.userId);
  const requested = ["daily", "weekly"].includes(body?.frequency) ? body.frequency : null;
  const frequency = requested || (saved.frequency !== "off" ? saved.frequency : "daily");

  const [all, admin, school] = await Promise.all([
    store.listNotifications(session.schoolId, session.userId),
    store.findUserById(session.userId),
    store.getSchoolById(session.schoolId),
  ]);
  const unread = all.filter((n) => !n.read);

  const email = buildDigestEmail({
    frequency,
    adminName: admin?.name,
    schoolName: school?.name,
    unread,
  });

  const digest = await store.sendDigest({
    schoolId: session.schoolId,
    userId: session.userId,
    frequency,
    ...email,
  });

  return Response.json({ digest, unread: unread.length });
}
