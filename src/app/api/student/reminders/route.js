import { store } from "@/lib/store";
import { isDenied, requireAuth } from "@/lib/policy";

/**
 * GET /api/student/reminders
 * The signed-in student's fee reminders from the school. When a student has
 * no linked parent, the school's reminder is addressed to the student's own
 * email so it surfaces here — the parent portal can't show what it was never
 * given. Filtering by email keeps every student scoped to their own mail.
 *
 * Returns newest-first: { reminders: [{ id, subject, preview, body, createdAt }] }
 */
export async function GET() {
  const session = await requireAuth(["STUDENT"]);
  if (isDenied(session)) return session;

  const [student, all] = await Promise.all([
    store.findUserById(session.userId),
    store.listNotifications(session.schoolId, session.userId),
  ]);
  if (!student) return Response.json({ reminders: [] });

  const reminders = all
    .filter(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(student.email)
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
