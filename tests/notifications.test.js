/**
 * Payment notification tests (admin inbox — "email-style" notices).
 *
 * Covers:
 *   1. buildPaymentNotification — subject/preview/body content and resilience
 *   2. Demo-store round-trip — create/list (newest first) / mark read
 *   3. Persistence — notifications survive a simulated restart
 *   4. End-to-end — a parent payment creates its notification (the exact
 *      sequence POST /api/parent/pay performs)
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPaymentNotification } from "../src/lib/notifications.js";
import * as demoStore from "../src/lib/demo-store.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-notif-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

let file;
let school;
let admin;
let admin2;

beforeEach(async () => {
  file = tmpFile();
  demoStore.__setDemoStoreFile(file);
  demoStore.__resetDemoStore();
  const [match] = await demoStore.searchSchools("Greenfield");
  school = await demoStore.getSchoolById(match.id);
  admin = await demoStore.findUserById(
    (await demoStore.listUsers({ schoolId: school.id, role: "SUPER_ADMIN" }))[0].id
  );
  admin2 = await demoStore.createUser({
    schoolId: school.id,
    name: "Admin Two",
    email: "admin2@edutrack.app",
    password: "admin123",
    role: "SUPER_ADMIN",
  });
});

afterEach(() => {
  try {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
  } catch {}
});

// ---- buildPaymentNotification --------------------------------------------------

describe("buildPaymentNotification", () => {
  const base = {
    payment: { receiptNo: "RCT-1012", amount: 185000, method: "CARD" },
    student: { name: "Tolu Bakare", assignedClass: "SS1 Science" },
    parent: { name: "Mrs. Folake Adebayo" },
  };

  it("renders subject, preview and body with all the payment facts", () => {
    const n = buildPaymentNotification(base);
    assert.equal(n.kind, "fee_payment");
    assert.ok(n.subject.includes("RCT-1012"), "subject carries the receipt");
    assert.ok(n.subject.includes("awaiting confirmation"));
    assert.ok(n.preview.includes("Mrs. Folake Adebayo"));
    assert.ok(n.preview.includes("₦185,000"));
    assert.ok(n.preview.includes("Tolu Bakare"));
    assert.ok(n.preview.includes("RCT-1012"));
    for (const line of ["Mrs. Folake Adebayo", "Tolu Bakare — SS1 Science", "₦185,000", "CARD", "RCT-1012"]) {
      assert.ok(n.body.includes(line), `body mentions ${line}`);
    }
  });

  it("stays usable when pieces are missing (defensive copy)", () => {
    const n = buildPaymentNotification({
      payment: { receiptNo: "RCT-1", amount: 0 },
      student: {},
      parent: {},
    });
    assert.ok(n.preview.length > 0);
    assert.ok(n.body.includes("Parent portal"));
  });
});

// ---- demo-store round trip -----------------------------------------------------

describe("notifications demo-store", () => {
  it("creates, lists newest-first, and marks read for the calling admin", async () => {
    const a = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "First",
      preview: "oldest",
      body: "body-1",
    });
    const b = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "Second",
      preview: "newest",
      body: "body-2",
    });

    const list = await demoStore.listNotifications(school.id, admin.id);
    assert.deepEqual(list.map((n) => n.subject), ["Second", "First"]);
    assert.equal(list[0].read, false);
    // readBy (other admins' ids) is stripped from the payload
    assert.equal(list[0].readBy, undefined);

    const unread = await demoStore.markNotificationsRead(school.id, admin.id, [a.id]);
    assert.equal(unread, 1);
    const after = await demoStore.listNotifications(school.id, admin.id);
    assert.equal(after.find((n) => n.id === a.id).read, true);
    assert.equal(after.find((n) => n.id === b.id).read, false);
  });

  it("legacy school-wide read:true migrates to read-by-everyone", async () => {
    // Write a snapshot in the OLD format (pre-readBy): one notification read
    // school-wide, one unread. Restoring must migrate read:true → "*" so BOTH
    // admins see the first as read and the second as unread.
    await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "Legacy read",
      preview: "p",
      body: "b",
    });
    await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "Legacy unread",
      preview: "p",
      body: "b",
    });
    demoStore.__persistNow();
    const before = JSON.parse(fs.readFileSync(file, "utf8"));
    before.notifications = before.notifications.map((n, i) => {
      delete n.readBy;
      return { ...n, read: i === 0 };
    });
    fs.writeFileSync(file, JSON.stringify(before));

    demoStore.__reloadDemoStore();

    const forA = await demoStore.listNotifications(school.id, admin.id);
    assert.equal(forA.find((n) => n.subject === "Legacy read").read, true, "legacy read stays read");
    assert.equal(forA.find((n) => n.subject === "Legacy unread").read, false);
    const forB = await demoStore.listNotifications(school.id, admin2.id);
    assert.equal(forB.find((n) => n.subject === "Legacy read").read, true, "legacy read applies to every admin");
    assert.equal(forB.find((n) => n.subject === "Legacy unread").read, false);
  });

  it("read state is PER ADMIN — one admin marking read leaves the other unread", async () => {
    const n = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "Shared inbox",
      preview: "p",
      body: "b",
    });

    // Admin One reads it → their count drops to zero…
    const unreadA = await demoStore.markNotificationsRead(school.id, admin.id, [n.id]);
    assert.equal(unreadA, 0);
    assert.equal(
      (await demoStore.listNotifications(school.id, admin.id))[0].read,
      true
    );
    // …but Admin Two still sees it unread (their own count is 1).
    const unreadB = await demoStore.listNotifications(school.id, admin2.id);
    assert.equal(unreadB[0].read, false);

    // Admin Two reads it too — now everyone has seen it.
    assert.equal(await demoStore.markNotificationsRead(school.id, admin2.id, [n.id]), 0);
    assert.equal(
      (await demoStore.listNotifications(school.id, admin2.id))[0].read,
      true
    );
  });

  it("is tenant-scoped — another school never sees them", async () => {
    await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: [],
      subject: "Private",
      preview: "x",
      body: "y",
    });
    const others = await demoStore.listNotifications("sch_other", admin.id);
    assert.deepEqual(others, []);
  });

  it("deletes specific notifications and keeps the rest (tenant-scoped)", async () => {
    const a = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "Keep me",
      preview: "p",
      body: "b",
    });
    const b = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: ["admin@edutrack.app"],
      subject: "Delete me",
      preview: "p",
      body: "b",
    });

    const removed = await demoStore.deleteNotifications(school.id, [b.id]);
    assert.equal(removed, 1);
    const list = await demoStore.listNotifications(school.id, admin.id);
    assert.deepEqual(list.map((n) => n.subject), ["Keep me"]);

    // Tenant scope: deleting ids that belong to another school is a no-op.
    const other = await demoStore.createNotification({
      schoolId: "sch_other",
      kind: "info",
      to: [],
      subject: "Stranger",
      preview: "p",
      body: "b",
    });
    assert.equal(await demoStore.deleteNotifications(school.id, [other.id]), 0);
    assert.equal(
      (await demoStore.listNotifications("sch_other", admin.id)).length,
      1,
      "another school's notification is untouched"
    );

    // An empty or unknown id list is a no-op.
    assert.equal(await demoStore.deleteNotifications(school.id, []), 0);
    assert.equal(await demoStore.deleteNotifications(school.id, ["not_nope"]), 0);
  });

  it("soft delete hides from staff but parent/student reminder copies survive", async () => {
    const parent = await demoStore.findUserById(
      (await demoStore.listUsers({ schoolId: school.id, role: "PARENT" }))[0].id
    );
    const student = await demoStore.findUserById(
      (await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" }))[0].id
    );
    const toParent = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: [parent.email],
      subject: "Parent copy",
      preview: "p",
      body: "b",
    });
    const toStudent = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: [student.email],
      subject: "Student copy",
      preview: "p",
      body: "b",
    });

    // Admin deletes BOTH from the inbox…
    assert.equal(await demoStore.deleteNotifications(school.id, [toParent.id, toStudent.id]), 2);
    assert.deepEqual(
      (await demoStore.listNotifications(school.id, admin.id)).map((n) => n.subject),
      [],
      "hidden from the admin inbox"
    );
    assert.deepEqual(
      (await demoStore.listNotifications(school.id, admin2.id)).map((n) => n.subject),
      [],
      "hidden from every staff view"
    );
    // …but the parent and student views (which the portal routes filter by
    // recipient email) still contain the soft-deleted reminders.
    const parentSubjects = (await demoStore.listNotifications(school.id, parent.id)).map((n) => n.subject);
    assert.ok(parentSubjects.includes("Parent copy"), "parent keeps their reminder");
    const studentSubjects = (await demoStore.listNotifications(school.id, student.id)).map((n) => n.subject);
    assert.ok(studentSubjects.includes("Student copy"), "student keeps their reminder");

    // Soft delete is idempotent — re-deleting already-hidden ids is a no-op.
    assert.equal(await demoStore.deleteNotifications(school.id, [toParent.id]), 0);

    // The reconcile flow can OPT IN to seeing deleted rows (the school's
    // "keep deleted reminders forwardable" setting): includeDeleted restores
    // them for staff without touching the default inbox view.
    const withDeleted = await demoStore.listNotifications(school.id, admin.id, {
      includeDeleted: true,
    });
    assert.deepEqual(
      withDeleted.map((n) => n.subject).sort(),
      ["Parent copy", "Student copy"],
      "includeDeleted shows soft-deleted rows to staff"
    );
    assert.deepEqual(
      (await demoStore.listNotifications(school.id, admin.id)).map((n) => n.subject),
      [],
      "the default staff view still hides them"
    );
  });

  it("auto-archives notifications older than the school's retention window", async () => {
    const fresh = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "Fresh",
      preview: "p",
      body: "b",
    });
    const old = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: ["admin@edutrack.app"],
      subject: "Old",
      preview: "p",
      body: "b",
    });
    demoStore.__persistNow();
    // Age the second one beyond the 90-day default by rewriting the snapshot
    // (the same technique the legacy-read test uses) — createNotification
    // always stamps "now".
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.notifications.find((n) => n.id === old.id).createdAt = new Date(
      Date.now() - 200 * 24 * 60 * 60 * 1000
    ).toISOString();
    fs.writeFileSync(file, JSON.stringify(data));
    demoStore.__reloadDemoStore();

    // Staff inbox hides the old one, keeps the fresh one…
    const inbox = await demoStore.listNotifications(school.id, admin.id);
    assert.deepEqual(inbox.map((n) => n.subject), ["Fresh"], "inbox stays lean");
    // …the archived view is the history (old only)…
    const archived = await demoStore.listNotifications(school.id, admin.id, { view: "archived" });
    assert.deepEqual(archived.map((n) => n.subject), ["Old"], "history is not lost");
    // …and a parent's view is untouched by archiving.
    const parent = await demoStore.findUserById(
      (await demoStore.listUsers({ schoolId: school.id, role: "PARENT" }))[0].id
    );
    const parentList = await demoStore.listNotifications(school.id, parent.id);
    assert.deepEqual(parentList.map((n) => n.subject).sort(), ["Fresh", "Old"]);

    // Archived rows don't count toward the admin's unread total.
    assert.equal(
      await demoStore.markNotificationsRead(school.id, admin.id, []),
      1,
      "only the fresh (in-inbox) row is unread"
    );

    // The retention window is per-school and configurable: tighten it to 1
    // day, then age the "Fresh" row to 2 days old — the same data now falls
    // into the archive, proving the cutoff follows the school's setting.
    await demoStore.updateSchool(school.id, { notificationRetentionDays: 1 });
    demoStore.__persistNow();
    const tightened = JSON.parse(fs.readFileSync(file, "utf8"));
    tightened.notifications.find((n) => n.id === fresh.id).createdAt = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000
    ).toISOString();
    fs.writeFileSync(file, JSON.stringify(tightened));
    demoStore.__reloadDemoStore();
    assert.deepEqual(
      (await demoStore.listNotifications(school.id, admin.id)).map((n) => n.subject),
      [],
      "1-day retention archives everything now"
    );
    assert.deepEqual(
      (await demoStore.listNotifications(school.id, admin.id, { view: "archived" }))
        .map((n) => n.subject)
        .sort(),
      ["Fresh", "Old"],
      "tightened retention grows the archive"
    );

    // An admin-explicitly-deleted row never resurfaces in the archived view.
    await demoStore.deleteNotifications(school.id, [old.id]);
    assert.deepEqual(
      (await demoStore.listNotifications(school.id, admin.id, { view: "archived" })).map((n) => n.subject),
      ["Fresh"],
      "soft-deleted rows stay hidden even from history"
    );
  });

  it("deletions survive a simulated restart", async () => {
    await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "Survivor",
      preview: "p",
      body: "b",
    });
    const doomed = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_reminder",
      to: ["admin@edutrack.app"],
      subject: "Doomed",
      preview: "p",
      body: "b",
    });
    await demoStore.deleteNotifications(school.id, [doomed.id]);

    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    const list = await demoStore.listNotifications(school.id, admin.id);
    assert.deepEqual(list.map((n) => n.subject), ["Survivor"], "deleted stays deleted across a restart");
  });

  it("notifications survive a simulated restart (persistence)", async () => {
    await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app"],
      subject: "Survivor",
      preview: "p",
      body: "b",
    });
    // Mark it read for Admin One BEFORE the restart — the per-admin state must
    // survive too.
    await demoStore.markNotificationsRead(school.id, admin.id, [
      (await demoStore.listNotifications(school.id, admin.id))[0].id,
    ]);
    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    const list = await demoStore.listNotifications(school.id, admin.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].subject, "Survivor");
    assert.equal(list[0].read, true, "per-admin read state survives the restart");
    // Admin Two never read it → still unread after the restart.
    assert.equal(
      (await demoStore.listNotifications(school.id, admin2.id))[0].read,
      false,
      "other admin keeps their own unread state"
    );
  });
});

// ---- end-to-end: payment → notification -----------------------------------------

describe("payment → notification end-to-end", () => {
  it("a parent-style PENDING payment creates the admin notification", async () => {
    const students = await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" });
    const student = students[0];

    // Exactly what POST /api/parent/pay does (minus the HTTP/auth layer).
    const payment = await demoStore.recordFeePayment({
      schoolId: school.id,
      studentId: student.id,
      amount: 111000,
      method: "CARD",
      note: "Paid by parent via Pay Now",
      status: "PENDING",
    });
    assert.ok(payment.receiptNo.startsWith("RCT-"));

    const parent = await demoStore.findUserById(
      (await demoStore.listUsers({ schoolId: school.id, role: "PARENT" }))[0].id
    );
    const note = buildPaymentNotification({ payment, student, parent });
    await demoStore.createNotification({
      schoolId: school.id,
      ...note,
      to: ["admin@edutrack.app"],
    });

    const inbox = await demoStore.listNotifications(school.id, admin.id);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].kind, "fee_payment");
    assert.ok(inbox[0].preview.includes(student.name));
    assert.ok(inbox[0].preview.includes(payment.receiptNo));

    // Reading it clears the caller's unread count.
    const unread = await demoStore.markNotificationsRead(school.id, admin.id, [inbox[0].id]);
    assert.equal(unread, 0);
  });
});
