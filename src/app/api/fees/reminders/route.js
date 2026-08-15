import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { reminderMessageSchema, firstValidationMessage } from "@/lib/validation";
import { buildFeeReminder } from "@/lib/notifications";

/**
 * POST /api/fees/reminders
 * Send a fee reminder to the parents of students with unpaid balances.
 *
 * Body: { studentIds?: string[], message?: string, messageStudent?: string,
 * batchId?: string } — when studentIds is omitted, EVERY student who owes is
 * reminded. When supplied, only those students are targeted (still only if
 * they owe). A student owes when they have an outstanding balance, OR when
 * they have no fee structure yet (unbilled) — so a brand-new school's
 * students are remindable immediately, before the admin keys in fee
 * structures. Fully paid students are never reminded. `message` is an
 * optional custom parent template and `messageStudent` the no-parent student
 * template (see buildFeeReminder / renderReminderMessage for placeholders);
 * when absent or blank, the built-in copy for that recipient is used.
 * Non-blank messages are ALSO persisted as the school's reminderTemplates —
 * so whatever the admin last sent is what the modal prefills and rollover
 * reminders reuse.
 *
 * IDEMPOTENCY: pass `batchId` (a UUID generated per send attempt) and the
 * send is recorded as a ReminderBatch. Replaying the same batchId — a retry,
 * a double click, a network replay — returns the STORED result (replayed:
 * true) instead of notifying anyone again. The UI always sends one; a fresh
 * key is a legitimately new send. Without a batchId the route sends as
 * before, with no dedup record.
 *
 * For each targeted student:
 *   - the linked parent gets an email-style fee_reminder notification, OR
 *   - when the student has no linked parent (or the parent record is gone),
 *     the reminder is sent to the STUDENT directly — no one is left out
 *   - a REMINDER_SENT audit entry records who sent it, to whom, and how much
 * Only a missing student account is skipped (defensive — shouldn't happen).
 *
 * Returns { sent: [...], skipped: [{ studentId, reason }], total, batchId?,
 * replayed? } where each sent entry carries `recipient: { kind:
 * "parent"|"student", name }`.
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

  // Optional idempotency key — a UUID the client generates per send attempt.
  // When a batch with this key is already on record, this request is a RETRY:
  // replay the stored result verbatim, touching nothing (no notifications, no
  // audit entries, no template re-save).
  const batchId = typeof body?.batchId === "string" ? body.batchId.trim() : "";
  if (batchId) {
    const existing = await store.getReminderBatchByKey(session.schoolId, "manual", batchId);
    if (existing) {
      return Response.json({
        ...(existing.result || { sent: [], skipped: [], total: 0 }),
        batchId,
        replayed: true,
      });
    }
  }

  // Optional custom messages — parent variant + student variant. Blank →
  // built-in copy; too long → reject before we mass-send a payload that
  // could never have come from the UI.
  const invalid = firstValidationMessage(reminderMessageSchema, body);
  if (invalid) return jsonError(invalid);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const messageStudent =
    typeof body?.messageStudent === "string" ? body.messageStudent.trim() : "";

  const [ledger, students, parents, school, admin] = await Promise.all([
    store.getFeeLedger(session.schoolId),
    store.listUsers({ schoolId: session.schoolId, role: "STUDENT" }),
    store.listUsers({ schoolId: session.schoolId, role: "PARENT" }),
    store.getSchoolById(session.schoolId),
    store.findUserById(session.userId),
  ]);

  // Target students who OWE: defaulters (balance > 0) plus students with no
  // fee structure for their class yet (unbilled, never paid). If specific ids
  // were given, honour them — still only within the owing set, so a paid
  // student is never reminded.
  const owing = ledger.filter((l) => l.balance > 0 || (l.amount === 0 && !l.feePaid));
  const targets = requested
    ? owing.filter((l) => requested.includes(l.studentId))
    : owing;

  // Persist whatever non-blank wording was sent as the school's templates —
  // the modal prefills from these and term-rollover reminders reuse them, so
  // the admin never retypes. Best-effort: a template-save failure must never
  // block the sends themselves. Blank fields keep the existing saved value
  // (blank means "use the built-in copy", not "erase my template").
  if (message || messageStudent) {
    const existing = school?.reminderTemplates || {};
    await store
      .updateSchool(session.schoolId, {
        reminderTemplates: {
          parent: message || existing.parent || "",
          student: messageStudent || existing.student || "",
        },
      })
      .catch(() => {});
  }

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
      message,
      messageStudent,
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

  const result = { sent, skipped, total: sent.length + skipped.length };

  // Record the send as a batch so a retry with the same batchId replays this
  // result instead of notifying anyone twice. The unique (schoolId, kind,
  // key) index makes the record atomic; if a CONCURRENT duplicate won the
  // race (created: false), serve ITS stored result — never this request's.
  if (batchId) {
    const recorded = await store
      .saveReminderBatch({
        schoolId: session.schoolId,
        kind: "manual",
        key: batchId,
        studentIds: targets.map((t) => t.studentId),
        result,
      })
      .catch(() => null);
    if (recorded && !recorded.created) {
      return Response.json({
        ...(recorded.batch?.result || result),
        batchId,
        replayed: true,
      });
    }
  }

  return Response.json({ ...result, batchId: batchId || undefined });
}
