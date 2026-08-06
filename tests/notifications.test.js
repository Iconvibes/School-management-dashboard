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
