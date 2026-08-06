import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { buildFeeReminder } from "@/lib/notifications";

/**
 * POST /api/fees/reminders
 * Send a fee reminder to the parents of students with unpaid balances.
 *
 * Body: { studentIds?: string[] } — when omitted, EVERY student with an
 * outstanding balance is reminded. When supplied, only those students are
 * targeted (still only if they have a balance).
 *
 * For each targeted student:
 *   - the linked parent gets an email-style fee_reminder notification, OR
 *   - when the student has no linked parent (or the parent record is gone),
 *     the reminder is sent to the STUDENT directly — no one is left out
 *   - a REMINDER_SENT audit entry records who sent it, to whom, and how much
 * Only a missing student account is skipped (defensive — shouldn't happen).
 *
 * Returns { sent: [...], skipped: [{ studentId, reason }] } where each sent
 * entry carries `recipient: { kind: "parent"|"student", name }`.
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.remind");
  if (isDenied(session)) return session;

  // Read the raw text so an ABSENT body means "remind everyone" but a
  // malformed one errors instead of silently mass-sending to every defaulter.
  const text = await request.text();
  let body = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return jsonError("Invalid request body");
    }
  }

  const requested = Array.isArray(body?.studentIds)
    ? body.studentIds.filter(Boolean)
    : null;

  const [ledger, students, parents, school, admin] = await Promise.all([
    store.getFeeLedger(session.schoolId),
    store.listUsers({ schoolId: session.schoolId, role: "STUDENT" }),
    store.listUsers({ schoolId: session.schoolId, role: "PARENT" }),
    store.getSchoolById(session.schoolId),
    store.findUserById(session.userId),
  ]);

  // Target students with a balance; if specific ids were given, honour them
  // (still only defaulters — a paid student is never reminded).
  const defaulters = ledger.filter((l) => l.balance > 0);
  const targets = requested
    ? defaulters.filter((l) => requested.includes(l.studentId))
    : defaulters;

  const studentById = Object.fromEntries(students.map((s) => [s.id, s]));
  const parentById = Object.fromEntries(parents.map((p) => [p.id, p]));

  const sent = [];
  const skipped = [];
  for (const entry of targets) {
    const student = studentById[entry.studentId];
    if (!student) {
      skipped.push({ studentId: entry.studentId, reason: "Student account missing" });
      continue;
    }

    // Prefer the linked parent; fall back to the student when there is none
    // (or the parent account no longer exists). The reminder still lands in
    // the notification system, addressed to whoever can act on it.
    const parent = student.parentId ? parentById[student.parentId] : null;
    const toStudent = !parent;
    const recipient = toStudent ? student : parent;
    const noParentReason = student.parentId
      ? "parent account missing"
      : "no parent linked";

    const note = buildFeeReminder({
      student,
      parent: toStudent ? null : parent,
      balance: entry.balance,
      schoolName: school?.name,
    });

    // Deliver first; only on success do we record the send. A single
    // notification failure must never abort the batch — but it also must
    // never produce an audit entry claiming a send that didn't land.
    try {
      await store.createNotification({
        schoolId: session.schoolId,
        ...note,
        to: [recipient.email],
        amount: entry.balance,
      });
    } catch {
      skipped.push({ studentId: entry.studentId, reason: "Notification failed" });
      continue;
    }

    try {
      await store.logFeeAudit({
        schoolId: session.schoolId,
        action: "REMINDER_SENT",
        actorId: session.userId,
        actorName: admin?.name || "Super Admin",
        actorRole: session.role,
        studentId: student.id,
        studentName: student.name,
        classArm: student.assignedClass || "",
        receiptNo: "",
        amount: entry.balance,
        method: "",
        note: toStudent
          ? `Fee reminder sent to student ${student.name} (${noParentReason})`
          : `Fee reminder sent to ${parent.name}`,
      });
    } catch {
      // The notification landed; the audit is best-effort, same as the app.
    }

    sent.push({
      studentId: student.id,
      studentName: student.name,
      balance: entry.balance,
      recipient: toStudent
        ? { kind: "student", id: student.id, name: student.name }
        : { kind: "parent", id: parent.id, name: parent.name },
    });
  }

  return Response.json({ sent, skipped, total: sent.length + skipped.length });
}
