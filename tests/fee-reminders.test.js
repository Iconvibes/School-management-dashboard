/**
 * Fee reminder tests — the admin "Send reminder" action in Fee Management.
 *
 * Covers:
 *   1. buildFeeReminder — email-style subject/preview/body for a parent AND
 *      a student-addressed variant (the no-parent fallback)
 *   2. The send sequence — the exact flow POST /api/fees/reminders performs:
 *      defaulters get a notification addressed to their parent + a
 *      REMINDER_SENT audit entry
 *   3. Fallback rules — a student without a linked parent is reminded
 *      DIRECTLY (never skipped); paid students are never reminded
 *   4. Parent + student visibility — each portal only sees reminders
 *      addressed to its own email
 *   5. Persistence — reminders and audit entries survive a restart
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFeeReminder } from "../src/lib/notifications.js";
import * as demoStore from "../src/lib/demo-store.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-reminder-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let school;
let admin;
let students;
let parent;

beforeEach(async () => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  const [match] = await demoStore.searchSchools("Greenfield");
  school = await demoStore.getSchoolById(match.id);
  admin = await demoStore.findUserById(
    (await demoStore.listUsers({ schoolId: school.id, role: "SUPER_ADMIN" }))[0].id
  );
  students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
  parent = await demoStore.findUserById(
    (await demoStore.listUsers({ schoolId: school.id, role: "PARENT" }))[0].id
  );
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

// ---- buildFeeReminder ----------------------------------------------------------

describe("buildFeeReminder", () => {
  const base = {
    student: { name: "Kunle Adebayo", assignedClass: "SS1 Science" },
    parent: { name: "Mrs. Folake Adebayo" },
    balance: 74000,
    schoolName: "Greenfield International School",
  };

  it("renders an email-style reminder with all the fee facts", () => {
    const n = buildFeeReminder(base);
    assert.equal(n.kind, "fee_reminder");
    assert.ok(n.subject.includes("Fee reminder · Kunle Adebayo"));
    assert.ok(n.preview.includes("Mrs. Folake Adebayo"));
    assert.ok(n.preview.includes("₦74,000"));
    assert.ok(n.preview.includes("Kunle Adebayo"));
    for (const line of ["Mrs. Folake Adebayo", "Kunle Adebayo — SS1 Science", "₦74,000", "Greenfield International School"]) {
      assert.ok(n.body.includes(line), `body mentions ${line}`);
    }
  });

  it("stays usable when pieces are missing (defensive copy)", () => {
    const n = buildFeeReminder({ student: {}, parent: {}, balance: 0 });
    assert.ok(n.subject.length > 0);
    assert.ok(n.body.includes("your child's school"));
  });

  it("renders a STUDENT-addressed reminder when there is no parent", () => {
    const n = buildFeeReminder({
      student: { name: "No Parent Kid", assignedClass: "SS1 Arts" },
      balance: 102000,
      schoolName: "Greenfield International School",
    });
    assert.equal(n.kind, "fee_reminder");
    assert.ok(n.subject.includes("No Parent Kid"));
    assert.ok(n.preview.includes("₦102,000"));
    assert.ok(n.preview.includes("No Parent Kid"));
    // Addressed to the student, not to a parent.
    assert.ok(n.body.includes("Hi No Parent Kid,"));
    assert.ok(n.body.includes("Outstanding balance: ₦102,000"));
    assert.ok(n.body.includes("Greenfield International School"));
    // The parent-only phrases must not leak into the student copy.
    assert.ok(!n.body.includes("your child"));
    assert.ok(!n.body.includes("parent portal (Pay Now)"));
  });

  it("explicit recipient wins over inference", () => {
    // parent present + recipient "student" → student copy; and vice versa.
    const studentCopy = buildFeeReminder({
      student: { name: "K", assignedClass: "SS1" },
      parent: { name: "Mrs. P" },
      balance: 5000,
      recipient: "student",
    });
    assert.ok(studentCopy.body.includes("Hi K,"));
    assert.ok(!studentCopy.body.includes("Mrs. P"));

    const parentCopy = buildFeeReminder({
      student: { name: "K", assignedClass: "SS1" },
      balance: 5000,
      recipient: "parent",
    });
    assert.ok(parentCopy.body.includes("Student: K — SS1"));
  });
});

// ---- the send sequence (what POST /api/fees/reminders does) ---------------------

async function sendReminders(studentIds = null) {
  const ledger = await demoStore.getFeeLedger(school.id);
  const allStudents = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
  const schoolObj = await demoStore.getSchoolById(school.id);
  const adminUser = await demoStore.findUserById(admin.id);

  const defaulters = ledger.filter((l) => l.balance > 0);
  const targets = studentIds
    ? defaulters.filter((l) => studentIds.includes(l.studentId))
    : defaulters;
  const studentById = Object.fromEntries(allStudents.map((s) => [s.id, s]));

  const sent = [];
  const skipped = [];
  for (const entry of targets) {
    const student = studentById[entry.studentId];
    if (!student) {
      skipped.push({ studentId: entry.studentId, reason: "Student account missing" });
      continue;
    }
    // Mirror the route: prefer the linked parent; fall back to the student.
    const parent = student.parentId ? await demoStore.findUserById(student.parentId) : null;
    const toStudent = !parent;
    const recipient = toStudent ? student : parent;
    const noParentReason = student.parentId ? "parent account missing" : "no parent linked";
    const note = buildFeeReminder({ student, parent: toStudent ? null : parent, balance: entry.balance, schoolName: schoolObj.name });
    await demoStore.createNotification({ schoolId: school.id, ...note, to: [recipient.email], amount: entry.balance });
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "REMINDER_SENT",
      actorId: admin.id,
      actorName: adminUser.name,
      actorRole: "SUPER_ADMIN",
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
    sent.push({
      studentId: student.id,
      studentName: student.name,
      balance: entry.balance,
      recipient: toStudent
        ? { kind: "student", id: student.id, name: student.name }
        : { kind: "parent", id: parent.id, name: parent.name },
    });
  }
  return { sent, skipped };
}

describe("fee reminder send flow", () => {
  it("defaulters with a linked parent get a notification + audit entry", async () => {
    // Seed links one parent (Folake) to Kunle + Chidinma. Both may or may not
    // be defaulters — link the parent to a guaranteed defaulter by creating one.
    const defaulter = await demoStore.createUser({
      schoolId: school.id,
      name: "Ada Obi",
      email: "ada.obi@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });
    await demoStore.updateUser(defaulter.id, { parentId: parent.id });

    const result = await sendReminders([defaulter.id]);
    assert.equal(result.sent.length, 1);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.sent[0].studentName, "Ada Obi");
    assert.deepEqual(result.sent[0].recipient, { kind: "parent", id: parent.id, name: parent.name });
    assert.ok(result.sent[0].balance > 0, "the reminder carries the balance");

    // Notification addressed to the parent's email.
    const all = await demoStore.listNotifications(school.id, admin.id);
    const reminder = all.find((n) => n.kind === "fee_reminder");
    assert.ok(reminder, "a fee_reminder notification exists");
    assert.deepEqual(reminder.to, [parent.email]);

    // Audit entry logged with the admin as actor.
    const trail = await demoStore.listFeeAudit(school.id);
    const entry = trail.find((e) => e.action === "REMINDER_SENT");
    assert.ok(entry, "a REMINDER_SENT audit entry exists");
    assert.equal(entry.actorName, admin.name);
    assert.equal(entry.actorRole, "SUPER_ADMIN");
    assert.equal(entry.studentName, "Ada Obi");
    assert.equal(entry.note, `Fee reminder sent to ${parent.name}`);
  });

  it("reminds students WITHOUT a linked parent directly (no one is skipped)", async () => {
    const orphan = await demoStore.createUser({
      schoolId: school.id,
      name: "No Parent Kid",
      email: "noparent@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS1 Arts",
    });
    // No parentId → the reminder must go to the STUDENT, not be skipped.
    const result = await sendReminders([orphan.id]);
    assert.equal(result.sent.length, 1, "the student is reminded, not skipped");
    assert.equal(result.skipped.length, 0);
    assert.equal(result.sent[0].recipient.kind, "student");
    assert.equal(result.sent[0].recipient.name, "No Parent Kid");
    assert.equal(result.sent[0].recipient.email, undefined); // email not exposed on the recipient object

    // The notification is addressed to the STUDENT's email with student copy.
    const all = await demoStore.listNotifications(school.id, admin.id);
    const reminder = all.find((n) => n.kind === "fee_reminder");
    assert.ok(reminder, "a fee_reminder notification exists");
    assert.deepEqual(reminder.to, ["noparent@edutrack.app"]);
    assert.ok(reminder.body.includes("Hi No Parent Kid,"), "student-addressed copy");

    // The audit trail records the fallback send.
    const trail = await demoStore.listFeeAudit(school.id);
    const entry = trail.find((e) => e.action === "REMINDER_SENT");
    assert.ok(entry, "a REMINDER_SENT audit entry exists");
    assert.equal(entry.note, "Fee reminder sent to student No Parent Kid (no parent linked)");
  });

  it("falls back to the student when the parent record is missing", async () => {
    const withGoneParent = await demoStore.createUser({
      schoolId: school.id,
      name: "Ghost Parent Kid",
      email: "ghost.parent.kid@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS2 Arts",
    });
    // A parentId pointing at an account that no longer exists.
    await demoStore.updateUser(withGoneParent.id, { parentId: "usr_does_not_exist" });

    const result = await sendReminders([withGoneParent.id]);
    assert.equal(result.sent.length, 1, "still reminded — to the student");
    assert.equal(result.skipped.length, 0);
    assert.deepEqual(result.sent[0].recipient, {
      kind: "student",
      id: withGoneParent.id,
      name: "Ghost Parent Kid",
    });

    const all = await demoStore.listNotifications(school.id, admin.id);
    const reminder = all.find((n) => n.kind === "fee_reminder");
    assert.deepEqual(reminder.to, ["ghost.parent.kid@edutrack.app"]);
    assert.ok(reminder.body.includes("Hi Ghost Parent Kid,"), "student-addressed copy");

    const trail = await demoStore.listFeeAudit(school.id);
    const entry = trail.find((e) => e.action === "REMINDER_SENT");
    assert.equal(entry.note, "Fee reminder sent to student Ghost Parent Kid (parent account missing)");
  });

  it("paid students are never reminded even if explicitly requested", async () => {
    // students[0] is Kunle — seed gives him a FULL payment (i % 3 !== 0 → paid).
    const ledger = await demoStore.getFeeLedger(school.id);
    const paidStudent = ledger.find((l) => l.balance === 0);
    assert.ok(paidStudent, "seed has at least one fully paid student");
    const result = await sendReminders([paidStudent.studentId]);
    assert.equal(result.sent.length, 0);
    assert.equal(result.skipped.length, 0);
  });
});

// ---- parent visibility -----------------------------------------------------------

describe("fee reminder parent visibility", () => {
  it("a parent only ever sees reminders addressed to their email", async () => {
    // Send one reminder to Folake's child (Kunle — linked in the seed).
    const kunle = students.find((s) => s.parentId === parent.id);
    assert.ok(kunle, "seed links Folake to a student");
    const result = await sendReminders([kunle.id]);

    // What GET /api/parent/reminders does: fetch all school notifications and
    // filter fee_reminders addressed to the parent's email.
    const all = await demoStore.listNotifications(school.id, parent.id);
    const mine = all
      .filter((n) => n.kind === "fee_reminder" && (n.to || []).includes(parent.email))
      .map((n) => ({ id: n.id, subject: n.subject, preview: n.preview }));

    assert.ok(result.sent.length >= 1);
    assert.equal(mine.length, result.sent.length, "the parent sees exactly what was sent to them");
    assert.ok(mine[0].subject.includes("Fee reminder"));

    // A DIFFERENT parent (a fresh account) sees nothing.
    const otherParent = await demoStore.createUser({
      schoolId: school.id,
      name: "Other Parent",
      email: "other.parent@edutrack.app",
      password: "parent123",
      role: "PARENT",
    });
    const otherAll = await demoStore.listNotifications(school.id, otherParent.id);
    const otherMine = otherAll.filter(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(otherParent.email)
    );
    assert.deepEqual(otherMine, []);
  });

  it("reminders + audit entries survive a simulated restart", async () => {
    const kunle = students.find((s) => s.parentId === parent.id);
    await sendReminders([kunle.id]);
    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    const all = await demoStore.listNotifications(school.id, parent.id);
    const mine = all.filter((n) => n.kind === "fee_reminder");
    assert.equal(mine.length, 1, "the reminder survived the restart");
    assert.deepEqual(mine[0].to, [parent.email]);

    const trail = await demoStore.listFeeAudit(school.id);
    assert.equal(trail.filter((e) => e.action === "REMINDER_SENT").length, 1);
  });

  it("a parent from another school never sees this school's reminders", async () => {
    const kunle = students.find((s) => s.parentId === parent.id);
    await sendReminders([kunle.id]);

    // A different school with its own parent account.
    const { school: other } = await demoStore.createSchoolAndAdmin({
      schoolName: "Other Academy",
      adminName: "Admin",
      email: "admin@other.academy",
      password: "admin123",
    });
    const otherParent = await demoStore.createUser({
      schoolId: other.id,
      name: "Stranger",
      email: "stranger@other.academy",
      password: "parent123",
      role: "PARENT",
    });

    // What GET /api/parent/reminders does for the OTHER parent: the school's
    // notification list is empty, so no reminder can ever leak across tenants.
    const otherAll = await demoStore.listNotifications(other.id, otherParent.id);
    assert.deepEqual(otherAll, []);
  });
});

// ---- reconcile & forward (student reminders → newly linked parent) -----------------

/**
 * Mirrors POST /api/fees/reconcile: find un-reconciled reminders addressed to
 * a student who NOW has a parent, forward a parent-addressed copy carrying
 * the latest amount, stamp the originals reconciled, and log a
 * REMEDY_FORWARDED audit entry. Reminders without a stored amount fall back
 * to the student's current ledger balance (never a bogus ₦0).
 */
async function reconcileAndForward() {
  const ledger = await demoStore.getFeeLedger(school.id);
  const balanceByStudentId = Object.fromEntries(ledger.map((l) => [l.studentId, l.balance]));
  const all = await demoStore.listNotifications(school.id, admin.id);
  const allStudents = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
  const allParents = await demoStore.listUsers({ schoolId: school.id, role: "PARENT" });
  const schoolObj = await demoStore.getSchoolById(school.id);
  const adminUser = await demoStore.findUserById(admin.id);

  const parentById = Object.fromEntries(allParents.map((p) => [p.id, p]));
  const remindersByStudent = new Map();
  all.forEach((n) => {
    if (n.kind !== "fee_reminder" || n.reconciledAt) return;
    const student = allStudents.find((s) => (n.to || []).includes(s.email));
    if (!student) return;
    if (!remindersByStudent.has(student.id)) remindersByStudent.set(student.id, []);
    remindersByStudent.get(student.id).push(n);
  });

  const pending = [];
  for (const [studentId, reminders] of remindersByStudent) {
    const student = allStudents.find((s) => s.id === studentId);
    const parent = student?.parentId ? parentById[student.parentId] : null;
    if (!parent) continue;
    reminders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    pending.push({
      student,
      parent,
      reminders,
      amount: Number.isFinite(Number(reminders[0].amount))
        ? Number(reminders[0].amount)
        : balanceByStudentId[student.id] || 0,
    });
  }

  const forwarded = [];
  for (const { student, parent, reminders, amount } of pending) {
    const note = buildFeeReminder({
      student,
      parent,
      balance: amount,
      schoolName: schoolObj.name,
      recipient: "parent",
    });
    await demoStore.createNotification({
      schoolId: school.id,
      ...note,
      to: [parent.email],
      amount,
    });
    await demoStore.markNotificationsReconciled(school.id, reminders.map((r) => r.id));
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "REMEDY_FORWARDED",
      actorId: admin.id,
      actorName: adminUser.name,
      actorRole: "SUPER_ADMIN",
      studentId: student.id,
      studentName: student.name,
      classArm: student.assignedClass || "",
      receiptNo: "",
      amount,
      method: "",
      note: `Forwarded ${reminders.length} unread reminder${reminders.length === 1 ? "" : "s"} to parent ${parent.name}`,
    });
    forwarded.push({
      studentId: student.id,
      studentName: student.name,
      parent: { id: parent.id, name: parent.name },
      remindersForwarded: reminders.length,
    });
  }
  return { forwarded };
}

describe("reconcile & forward", () => {
  it("forwards a parent-less student's unread reminders to their NEW parent", async () => {
    // A defaulter with no parent — the reminder lands on the STUDENT.
    const orphan = await demoStore.createUser({
      schoolId: school.id,
      name: "Late Link Kid",
      email: "late.link@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });
    await sendReminders([orphan.id]);

    // The school later links a parent — now the reminder can be forwarded.
    const newParent = await demoStore.createUser({
      schoolId: school.id,
      name: "Mr. Late Link",
      email: "late.parent@edutrack.app",
      password: "parent123",
      role: "PARENT",
    });
    await demoStore.updateUser(orphan.id, { parentId: newParent.id });

    const { forwarded } = await reconcileAndForward();
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].studentName, "Late Link Kid");
    assert.equal(forwarded[0].remindersForwarded, 1);
    assert.equal(forwarded[0].parent.name, "Mr. Late Link");

    // The parent now sees a parent-addressed reminder for the child.
    const parentAll = await demoStore.listNotifications(school.id, newParent.id);
    const mine = parentAll.filter(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(newParent.email)
    );
    assert.equal(mine.length, 1);
    assert.ok(mine[0].body.includes("Hi Mr. Late Link,"), "parent-addressed copy");
    assert.ok(mine[0].body.includes("Late Link Kid"), "mentions the child");

    // The student's ORIGINAL is marked reconciled — never forwarded twice.
    const all = await demoStore.listNotifications(school.id, admin.id);
    const studentOriginal = all.find(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(orphan.email)
    );
    assert.ok(studentOriginal.reconciledAt, "original stamped reconciledAt");

    // A second pass forwards nothing.
    const again = await reconcileAndForward();
    assert.equal(again.forwarded.length, 0);

    // The forward is on the audit trail.
    const trail = await demoStore.listFeeAudit(school.id);
    const entry = trail.find((e) => e.action === "REMEDY_FORWARDED");
    assert.ok(entry, "a REMEDY_FORWARDED audit entry exists");
    assert.equal(entry.studentName, "Late Link Kid");
    assert.equal(entry.note, "Forwarded 1 unread reminder to parent Mr. Late Link");
  });

  it("skips students whose parent is not yet linked, and forwards the LATEST amount", async () => {
    // Two parent-less defaulters: one gets linked, the other stays unlinked.
    const linked = await demoStore.createUser({
      schoolId: school.id,
      name: "Linkable Kid",
      email: "linkable@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS2 Arts",
    });
    const unlinked = await demoStore.createUser({
      schoolId: school.id,
      name: "Still Alone",
      email: "still.alone@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS2 Arts",
    });
    await sendReminders([linked.id, unlinked.id]);

    const newParent = await demoStore.createUser({
      schoolId: school.id,
      name: "New Mum",
      email: "new.mum@edutrack.app",
      password: "parent123",
      role: "PARENT",
    });
    await demoStore.updateUser(linked.id, { parentId: newParent.id });

    const { forwarded } = await reconcileAndForward();
    assert.equal(forwarded.length, 1, "only the linked student is forwarded");
    assert.equal(forwarded[0].studentName, "Linkable Kid");

    // The unlinked student's reminder stays untouched (still student-addressed).
    const all = await demoStore.listNotifications(school.id, admin.id);
    const stillThere = all.find(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(unlinked.email)
    );
    assert.ok(stillThere, "unlinked student's reminder remains");
    assert.ok(!stillThere.reconciledAt, "and is not marked reconciled");

    // The audit entry carries the amount the reminder was sent with.
    const ledger = await demoStore.getFeeLedger(school.id);
    const balance = ledger.find((l) => l.studentId === linked.id)?.balance;
    const audit = await demoStore.listFeeAudit(school.id);
    const entry = audit.find((e) => e.action === "REMEDY_FORWARDED");
    assert.ok(entry, "a REMEDY_FORWARDED entry exists");
    assert.equal(entry.amount, balance, "forward records the outstanding balance");
  });

  it("forwards the LATEST reminder's amount when several are outstanding", async () => {
    const kid = await demoStore.createUser({
      schoolId: school.id,
      name: "Two Reminders Kid",
      email: "two.reminders@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });
    const balance = (await demoStore.getFeeLedger(school.id)).find(
      (l) => l.studentId === kid.id
    )?.balance;

    // First reminder, then a second one LATER (lower balance — say a part
    // payment came in). Newest must win when the copy is rebuilt.
    await sendReminders([kid.id]);
    await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: [kid.email],
      subject: "Fee reminder · Two Reminders Kid",
      preview: "Two Reminders Kid — ₦50,000 still outstanding",
      body: "Latest",
      amount: 50000,
    });

    const newParent = await demoStore.createUser({
      schoolId: school.id,
      name: "Two Reminders Mum",
      email: "two.reminders.mum@edutrack.app",
      password: "parent123",
      role: "PARENT",
    });
    await demoStore.updateUser(kid.id, { parentId: newParent.id });

    const { forwarded } = await reconcileAndForward();
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].remindersForwarded, 2, "both reminders are reconciled");

    const parentAll = await demoStore.listNotifications(school.id, newParent.id);
    const mine = parentAll.filter(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(newParent.email)
    );
    assert.equal(mine.length, 1, "one consolidated parent copy");
    assert.equal(mine[0].amount, 50000, "carries the LATEST amount, not the first");

    const trail = await demoStore.listFeeAudit(school.id);
    const entry = trail.find((e) => e.action === "REMEDY_FORWARDED");
    assert.equal(entry.amount, 50000);
  });

  it("falls back to the ledger balance when a reminder predates amount tracking", async () => {
    const kid = await demoStore.createUser({
      schoolId: school.id,
      name: "Legacy Reminder Kid",
      email: "legacy.reminder@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS1 Arts",
    });
    const balance = (await demoStore.getFeeLedger(school.id)).find(
      (l) => l.studentId === kid.id
    )?.balance;
    // Simulate a pre-amount reminder (no amount field at all).
    await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: [kid.email],
      subject: "Fee reminder · Legacy Reminder Kid",
      preview: "Legacy Reminder Kid — balance",
      body: "Old copy",
    });

    const newParent = await demoStore.createUser({
      schoolId: school.id,
      name: "Legacy Mum",
      email: "legacy.mum@edutrack.app",
      password: "parent123",
      role: "PARENT",
    });
    await demoStore.updateUser(kid.id, { parentId: newParent.id });

    const { forwarded } = await reconcileAndForward();
    assert.equal(forwarded.length, 1, "still forwarded");
    const parentAll = await demoStore.listNotifications(school.id, newParent.id);
    const mine = parentAll.filter(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(newParent.email)
    );
    assert.equal(mine[0].amount, balance, "uses the current ledger balance, never ₦0");
    assert.ok(balance > 0, "the seed leaves this student owing");
  });
});

// ---- student visibility (the no-parent fallback) ----------------------------------

describe("fee reminder student visibility", () => {
  it("a parent-less student sees exactly the reminders addressed to their email", async () => {
    const orphan = await demoStore.createUser({
      schoolId: school.id,
      name: "Solo Learner",
      email: "solo.learner@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS1 Science",
    });
    const result = await sendReminders([orphan.id]);
    assert.equal(result.sent.length, 1);

    // What GET /api/student/reminders does: filter fee_reminders by the
    // student's own email.
    const all = await demoStore.listNotifications(school.id, orphan.id);
    const mine = all
      .filter((n) => n.kind === "fee_reminder" && (n.to || []).includes(orphan.email))
      .map((n) => ({ id: n.id, subject: n.subject, preview: n.preview }));

    assert.equal(mine.length, 1, "the student sees the reminder sent to them");
    assert.ok(mine[0].subject.includes("Fee reminder"));

    // A different student without a reminder sees nothing.
    const bystander = await demoStore.createUser({
      schoolId: school.id,
      name: "Bystander Kid",
      email: "bystander@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS1 Arts",
    });
    const bystanderAll = await demoStore.listNotifications(school.id, bystander.id);
    const bystanderMine = bystanderAll.filter(
      (n) => n.kind === "fee_reminder" && (n.to || []).includes(bystander.email)
    );
    assert.deepEqual(bystanderMine, []);
  });

  it("student reminders survive a simulated restart", async () => {
    const orphan = await demoStore.createUser({
      schoolId: school.id,
      name: "Persistent Kid",
      email: "persistent.kid@edutrack.app",
      password: "student123",
      role: "STUDENT",
      assignedClass: "SS2 Science",
    });
    await sendReminders([orphan.id]);
    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    const all = await demoStore.listNotifications(school.id, orphan.id);
    const mine = all.filter((n) => n.kind === "fee_reminder");
    assert.equal(mine.length, 1, "the student reminder survived the restart");
    assert.deepEqual(mine[0].to, ["persistent.kid@edutrack.app"]);
  });
});
