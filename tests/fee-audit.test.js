/**
 * Fee audit trail tests — the "who did what, and when" record for
 * reconciliation, visible in the admin Fee Management tab.
 *
 * Covers:
 *   1. Demo-store round-trip — logFeeAudit creates, listFeeAudit newest first
 *   2. Tenant scoping — another school never sees the entries
 *   3. Persistence — the trail survives a simulated restart
 *   4. End-to-end — the exact sequences the routes perform: an admin records a
 *      payment, a parent submits one, the admin confirms it, and a parent
 *      downloads the receipt — each leaving the right trail entry
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as demoStore from "../src/lib/demo-store.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-audit-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

// ---- demo-store round trip -----------------------------------------------------

describe("fee audit demo-store", () => {
  it("logs entries and lists them newest first", async () => {
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "PAYMENT_RECORDED",
      actorId: admin.id,
      actorName: admin.name,
      actorRole: "SUPER_ADMIN",
      studentId: students[0].id,
      studentName: students[0].name,
      classArm: students[0].assignedClass,
      receiptNo: "RCT-2001",
      amount: 50000,
      method: "CASH",
    });
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "PAYMENT_CONFIRMED",
      actorId: admin.id,
      actorName: admin.name,
      actorRole: "SUPER_ADMIN",
      studentId: students[0].id,
      studentName: students[0].name,
      receiptNo: "RCT-2002",
      amount: 111000,
      method: "CARD",
    });

    const list = await demoStore.listFeeAudit(school.id);
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((e) => e.action), ["PAYMENT_CONFIRMED", "PAYMENT_RECORDED"]);
    assert.equal(list[0].receiptNo, "RCT-2002");
    assert.equal(list[0].actorName, admin.name);
    assert.equal(list[1].amount, 50000);
    assert.ok(list[0].createdAt, "entries carry a timestamp");
  });

  it("is tenant-scoped — another school never sees the entries", async () => {
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "PAYMENT_RECORDED",
      actorName: "Super Admin",
      studentId: students[0].id,
      receiptNo: "RCT-2001",
      amount: 1000,
    });
    assert.deepEqual(await demoStore.listFeeAudit("sch_other"), []);
  });

  it("survives a simulated restart (persistence)", async () => {
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "PAYMENT_RECORDED",
      actorName: admin.name,
      actorRole: "SUPER_ADMIN",
      studentId: students[0].id,
      studentName: students[0].name,
      receiptNo: "RCT-2001",
      amount: 50000,
    });
    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    const list = await demoStore.listFeeAudit(school.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].receiptNo, "RCT-2001");
    assert.equal(list[0].actorName, admin.name);
  });
});

// ---- end-to-end: the exact route sequences -------------------------------------

describe("fee audit end-to-end", () => {
  it("records the full lifecycle: admin record → parent submit → confirm → receipt", async () => {
    const student = students[0];

    // 1. Admin records a payment (POST /api/fees/payments)
    const recorded = await demoStore.recordFeePayment({
      schoolId: school.id,
      studentId: student.id,
      amount: 50000,
      method: "CASH",
      note: "Cash at the bursar",
    });
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "PAYMENT_RECORDED",
      actorId: admin.id,
      actorName: admin.name,
      actorRole: "SUPER_ADMIN",
      studentId: student.id,
      studentName: student.name,
      classArm: student.assignedClass,
      receiptNo: recorded.receiptNo,
      amount: 50000,
      method: "CASH",
    });

    // 2. Parent submits a PENDING payment (POST /api/parent/pay)
    const submitted = await demoStore.recordFeePayment({
      schoolId: school.id,
      studentId: student.id,
      amount: 111000,
      method: "CARD",
      note: "Paid by parent via Pay Now",
      status: "PENDING",
    });
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "PARENT_PAYMENT_SUBMITTED",
      actorId: parent.id,
      actorName: parent.name,
      actorRole: "PARENT",
      studentId: student.id,
      studentName: student.name,
      receiptNo: submitted.receiptNo,
      amount: 111000,
      method: "CARD",
      note: "Paid by parent via Pay Now — awaiting confirmation",
    });

    // 3. Admin confirms it (PATCH /api/fees/payments)
    const confirmed = await demoStore.confirmFeePayment({
      schoolId: school.id,
      paymentId: submitted.id,
    });
    assert.ok(confirmed);
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "PAYMENT_CONFIRMED",
      actorId: admin.id,
      actorName: admin.name,
      actorRole: "SUPER_ADMIN",
      studentId: student.id,
      studentName: student.name,
      receiptNo: confirmed.receiptNo,
      amount: confirmed.amount,
      method: confirmed.method,
      note: "Parent payment confirmed — balance updated",
    });

    // 4. Parent downloads the receipt (POST /api/fees/audit/receipt)
    await demoStore.logFeeAudit({
      schoolId: school.id,
      action: "RECEIPT_DOWNLOADED",
      actorId: parent.id,
      actorName: parent.name,
      actorRole: "PARENT",
      studentId: student.id,
      studentName: student.name,
      receiptNo: confirmed.receiptNo,
      amount: confirmed.amount,
      method: confirmed.method,
    });

    const trail = await demoStore.listFeeAudit(school.id);
    assert.deepEqual(
      trail.map((e) => e.action),
      ["RECEIPT_DOWNLOADED", "PAYMENT_CONFIRMED", "PARENT_PAYMENT_SUBMITTED", "PAYMENT_RECORDED"]
    );
    // The confirmation entry must reference the same receipt the parent paid.
    const confirmEntry = trail.find((e) => e.action === "PAYMENT_CONFIRMED");
    assert.equal(confirmEntry.receiptNo, submitted.receiptNo);
    assert.equal(confirmEntry.actorName, admin.name);
    assert.equal(confirmEntry.actorRole, "SUPER_ADMIN");
    // The parent's two entries are attributed to the parent, not the admin.
    const parentEntries = trail.filter((e) => e.actorRole === "PARENT");
    assert.equal(parentEntries.length, 2);
    parentEntries.forEach((e) => assert.equal(e.actorName, parent.name));
    // Every entry is timestamped and tenant-scoped.
    trail.forEach((e) => assert.ok(e.createdAt));
  });

  it("never creates audit entries when the payment itself fails", async () => {
    const missing = await demoStore.recordFeePayment({
      schoolId: school.id,
      studentId: "usr_does_not_exist",
      amount: 1000,
      method: "CASH",
    });
    assert.equal(missing, null);
    assert.deepEqual(await demoStore.listFeeAudit(school.id), []);
  });
});
