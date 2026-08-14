import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { buildFeeReminder } from "@/lib/notifications";

/**
 * POST /api/school/rollover — move the school to a new term.
 *
 * SUPER_ADMIN only (school.edit). One atomic operation that:
 *   • ARCHIVES the old term's scores + attendance (snapshotted per arm into
 *     the term archive, then cleared from the live tables),
 *   • CLONES each arm's fee structure and the weekly timetable into the new
 *     term,
 *   • resets every student's feePaid and moves the school's
 *     currentSession/currentTerm, so all term-scoped reads switch over,
 *   • CARRIES each student's unpaid balance into the new term (added to the
 *     new term's fee) and sends an automatic fee reminder to every carried
 *     student's parent (or the student directly when no parent is linked).
 *
 * Body: { newTerm, newSession?, dryRun? }. `dryRun: true` returns the exact
 * counts WITHOUT mutating anything — the UI shows the preview before the
 * SUPER_ADMIN confirms. Same-term rolls are rejected (400).
 *
 * Deliberately a dedicated endpoint (like rename-arm): switching terms is a
 * migration with an archive, never a bare school PATCH.
 */
export async function POST(request) {
  const session = await requirePermission(["SUPER_ADMIN"], "school.edit");
  if (isDenied(session)) return session;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body");
  }

  const result = await store.rolloverTerm(session.schoolId, {
    newTerm: body?.newTerm,
    newSession: body?.newSession,
    dryRun: body?.dryRun === true,
  });
  if (!result) return jsonError("School not found", 404);
  if (result.error) return jsonError(result.error, 400);

  // Automatic reminders at the start of the new term: every student whose
  // unpaid balance was carried gets one, addressed to the parent (or the
  // student when no parent is linked). Best-effort — a reminder failure must
  // never fail or roll back the term move itself.
  let remindersSent = 0;
  const carried = result.carryovers || [];
  if (carried.length) {
    // Idempotency gate: the batch key is deterministic from the NEW session +
    // term, so a double rollover (or any re-run of the same rollover) can
    // NEVER notify the same parent twice — the second run replays the stored
    // count and sends nothing.
    const batchKey = `rollover:${session.schoolId}:${result.school?.currentSession || ""}:${result.school?.currentTerm || ""}`;
    const existing = await store
      .getReminderBatchByKey(session.schoolId, "rollover", batchKey)
      .catch(() => null);
    if (existing) {
      remindersSent =
        existing.result?.sent?.length ?? existing.studentIds?.length ?? 0;
    } else {
      try {
        const [students, parents, school, ledger, admin] = await Promise.all([
          store.listUsers({ schoolId: session.schoolId, role: "STUDENT" }),
          store.listUsers({ schoolId: session.schoolId, role: "PARENT" }),
          store.getSchoolById(session.schoolId),
          store.getFeeLedger(session.schoolId),
          store.findUserById(session.userId),
        ]);
        const studentById = Object.fromEntries(students.map((s) => [s.id, s]));
        const parentById = Object.fromEntries(parents.map((p) => [p.id, p]));
        const balanceByStudent = Object.fromEntries(ledger.map((l) => [l.studentId, l.balance]));

        const sentList = [];
        const skippedList = [];
        for (const { studentId } of carried) {
          const student = studentById[studentId];
          if (!student) {
            skippedList.push({ studentId, reason: "Student account missing" });
            continue;
          }
          const parent = student.parentId ? parentById[student.parentId] : null;
          const toStudent = !parent;
          const recipient = toStudent ? student : parent;
          // The carried student's CURRENT outstanding — new term fee + carried
          // debt — so the reminder matches what the parent sees on the portal.
          // Wording comes from the school's saved reminderTemplates (blank →
          // the built-in copy), so automatic reminders use the school's voice.
          const balance = Number(balanceByStudent[studentId]) || 0;
          const templates = school?.reminderTemplates || {};
          const note = buildFeeReminder({
            student,
            parent: toStudent ? null : parent,
            balance,
            schoolName: school?.name,
            message: templates.parent,
            messageStudent: templates.student,
          });
          try {
            await store.createNotification({
              schoolId: session.schoolId,
              ...note,
              to: [recipient.email],
              amount: balance,
            });
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
              amount: balance,
              method: "",
              note: toStudent
                ? `Automatic reminder at term rollover — unpaid balance carried, sent to student ${student.name}`
                : `Automatic reminder at term rollover — unpaid balance carried, sent to ${parent.name}`,
            });
            sentList.push({
              studentId: student.id,
              studentName: student.name,
              balance,
              recipient: toStudent
                ? { kind: "student", id: student.id, name: student.name }
                : { kind: "parent", id: parent.id, name: parent.name },
            });
            remindersSent += 1;
          } catch {
            skippedList.push({ studentId: student.id, reason: "Notification failed" });
            // Best-effort per recipient — one failure never aborts the batch.
          }
        }

      // Record the send as a batch under the deterministic key so any future
      // re-run of this same rollover replays instead of re-notifying. The
      // atomic record makes a concurrent duplicate impossible; if one did win
      // the race, its stored count is the authoritative one.
      const recorded = await store
        .saveReminderBatch({
          schoolId: session.schoolId,
          kind: "rollover",
          key: batchKey,
          context: `${result.school?.currentSession || ""} · ${result.school?.currentTerm || ""}`,
          studentIds: carried.map((c) => c.studentId),
          result: { sent: sentList, skipped: skippedList },
        })
        .catch(() => null);
        if (recorded && !recorded.created) {
          remindersSent =
            recorded.batch?.result?.sent?.length ?? remindersSent;
        }
      } catch {
        // Best-effort overall — the rollover itself already succeeded.
      }
    }
  }

  // In a dry-run, no reminders are actually sent — report the expected count
  // (one per carried student) so the preview is honest.
  const counts = {
    ...result.counts,
    remindersSent: body?.dryRun === true ? result.counts?.carryovers || 0 : remindersSent,
  };

  return Response.json({ school: result.school, counts });
}
