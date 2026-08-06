import { store } from "@/lib/store";
import { isDenied, requireAuth } from "@/lib/policy";

/**
 * GET /api/parent/reminders
 * The signed-in parent's fee reminders from the school. The school sends one
 * per child with an outstanding balance; reminders are addressed to the
 * parent's email so no other parent ever sees them.
 *
 * Returns newest-first: { reminders: [{ id, subject, preview, body, createdAt }] }
 */
export async function GET() {
  const session = await requireAuth(["PARENT"]);
  if (isDenied(session)) return session;

  const [parent, all] = await Promise.all([
    store.findUserById(session.userId),
    store.listNotifications(session.schoolId, session.userId),
  ]);
  if (!parent) return Response.json({ reminders: [] });

  const reminders = all
    .filter(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(parent.email)
    )
    .map((n) => ({
      id: n.id,
      subject: n.subject,
      preview: n.preview,
      body: n.body,
      createdAt: n.createdAt,
    }));

  return Response.json({ reminders });
}
