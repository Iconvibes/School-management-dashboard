import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { buildFeeReminder } from "@/lib/notifications";

/**
 * Fee-reminder reconciliation ("Reconcile & forward").
 *
 * When a school sends a reminder to a student with NO linked parent, the
 * reminder is addressed to the student. If the school later links a parent
 * (or the parent record reappears), those reminders would sit unread on the
 * student's portal — the parent never learns the school was chasing them.
 *
 *   GET  /api/fees/reconcile — list students with un-reconciled, student-
 *                              addressed fee reminders who NOW have a parent.
 *   POST /api/fees/reconcile — forward each such reminder to the linked
 *                              parent (parent-addressed copy), stamp the
 *                              original reconciledAt (never re-forwarded),
 *                              and log a REMEDY_FORWARDED audit entry.
 *
 * Permission: same as send-reminder (SUPER_ADMIN + BURSAR, fees.remind).
 *
 * The balance each forward will claim is the LATEST reminder's stored amount
 * when it has one; reminders sent before amount was recorded fall back to the
 * student's current ledger balance so a parent never sees a bogus ₦0.
 */

/**
 * Shared collector: every un-reconciled, student-addressed fee reminder for
 * a student who NOW has a linked parent. Used by GET (preview) and POST
 * (forward) so the filter rules can never drift between the two.
 *
 * The school's `reconcileDeletedReminders` setting decides whether reminders
 * the admin deleted from the inbox (soft-deleted) still appear here — off by
 * default (deleted means hidden from every staff view), on keeps them
 * eligible for forwarding once the parent is linked.
 */
async function collectPending(schoolId, userId, balanceByStudentId) {
  const [school, students, parents] = await Promise.all([
    store.getSchoolById(schoolId),
    store.listUsers({ schoolId, role: "STUDENT" }),
    store.listUsers({ schoolId, role: "PARENT" }),
  ]);
  const all = await store.listNotifications(schoolId, userId, {
    includeDeleted: school?.reconcileDeletedReminders === true,
  });

  const parentById = Object.fromEntries(parents.map((p) => [p.id, p]));
  const remindersByStudent = new Map();
  all.forEach((n) => {
    if (n.kind !== "fee_reminder" || n.reconciledAt) return;
    const to = Array.isArray(n.to) ? n.to : [];
    const student = students.find((s) => to.includes(s.email));
    if (!student) return; // addressed to a parent, or an orphaned record
    if (!remindersByStudent.has(student.id)) remindersByStudent.set(student.id, []);
    remindersByStudent.get(student.id).push(n);
  });

  const pending = [];
  for (const [studentId, reminders] of remindersByStudent) {
    const student = students.find((s) => s.id === studentId);
    const parent = student?.parentId ? parentById[student.parentId] : null;
    if (!parent) continue; // still parent-less — the fallback applies for now

    // Newest first; the latest reminder is the one the parent copy is built from.
    reminders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest = reminders[0];
    pending.push({
      student,
      parent,
      reminders,
      latest,
      amount: Number.isFinite(Number(latest.amount))
        ? Number(latest.amount)
        : balanceByStudentId[studentId] || 0,
    });
  }
  pending.sort((a, b) => a.student.name.localeCompare(b.student.name));
  return pending;
}

export async function GET() {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.remind");
  if (isDenied(session)) return session;

  const ledger = await store.getFeeLedger(session.schoolId);
  const balanceByStudentId = Object.fromEntries(
    ledger.map((l) => [l.studentId, l.balance])
  );
  const pending = await collectPending(
    session.schoolId,
    session.userId,
    balanceByStudentId
  );

  return Response.json({
    pending: pending.map((p) => ({
      studentId: p.student.id,
      studentName: p.student.name,
      classArm: p.student.assignedClass || "",
      amount: p.amount,
      reminders: p.reminders.map((r) => ({ id: r.id, createdAt: r.createdAt })),
      parent: { id: p.parent.id, name: p.parent.name, email: p.parent.email },
    })),
    total: pending.length,
  });
}

/**
 * Forward the pending reminders for EVERY actionable student (the dashboard
 * confirms once, the route covers the batch). Each student's un-reconciled
 * reminders become ONE parent-addressed reminder carrying their latest
 * balance, the originals are stamped reconciledAt, and one REMEDY_FORWARDED
 * audit entry per student records the action.
 */
export async function POST() {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "fees.remind");
  if (isDenied(session)) return session;

  const [ledger, school, admin] = await Promise.all([
    store.getFeeLedger(session.schoolId),
    store.getSchoolById(session.schoolId),
    store.findUserById(session.userId),
  ]);
  const balanceByStudentId = Object.fromEntries(
    ledger.map((l) => [l.studentId, l.balance])
  );
  const pending = await collectPending(
    session.schoolId,
    session.userId,
    balanceByStudentId
  );

  const forwarded = [];
  const skipped = [];
  for (const p of pending) {
    const { student, parent, reminders, amount } = p;

    // Rebuild the reminder as a parent-addressed copy (same facts, parent
    // voice) and deliver it BEFORE stamping the originals as reconciled.
    const note = buildFeeReminder({
      student,
      parent,
      balance: amount,
      schoolName: school?.name,
      recipient: "parent",
      // The forwarded copy uses the school's saved parent wording.
      message: school?.reminderTemplates?.parent,
    });

    try {
      await store.createNotification({
        schoolId: session.schoolId,
        ...note,
        to: [parent.email],
        amount,
      });
    } catch {
      skipped.push({ studentId: student.id, reason: "Notification failed" });
      continue;
    }

    try {
      await store.markNotificationsReconciled(
        session.schoolId,
        reminders.map((r) => r.id)
      );
    } catch {
      // The parent got their copy; an unreconciled original would only be
      // forwarded again later — a duplicate. So keep it best-effort: the
      // copy already landed, which is the part that matters.
    }

    try {
      await store.logFeeAudit({
        schoolId: session.schoolId,
        action: "REMEDY_FORWARDED",
        actorId: session.userId,
        actorName: admin?.name || "Super Admin",
        actorRole: session.role,
        studentId: student.id,
        studentName: student.name,
        classArm: student.assignedClass || "",
        receiptNo: "",
        amount,
        method: "",
        note: `Forwarded ${reminders.length} unread reminder${reminders.length === 1 ? "" : "s"} to parent ${parent.name}`,
      });
    } catch {
      // The notification landed; the audit is best-effort, same as elsewhere.
    }

    forwarded.push({
      studentId: student.id,
      studentName: student.name,
      parent: { id: parent.id, name: parent.name },
      remindersForwarded: reminders.length,
    });
  }

  return Response.json({ forwarded, skipped, total: forwarded.length + skipped.length });
}
