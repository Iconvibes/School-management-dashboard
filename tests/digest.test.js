/**
 * Per-admin digest tests.
 *
 * Covers:
 *   1. buildDigestEmail — email-style subject/preview/body, empty vs unread
 *   2. Demo-store round-trip — get/set prefs, sendDigest records + bumps
 *      lastSentAt, listDigests newest-first
 *   3. Per-admin isolation — each admin's digest content comes from THEIR OWN
 *      unread notifications
 *   4. Persistence — prefs and sent digests survive a simulated restart
 *   5. End-to-end — parent payment → notification → digest composition
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDigestEmail } from "../src/lib/digest.js";
import { buildPaymentNotification } from "../src/lib/notifications.js";
import * as demoStore from "../src/lib/demo-store.js";

const tmpFile = () =>
  path.join(os.tmpdir(), `edutrack-digest-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

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

// ---- buildDigestEmail ---------------------------------------------------------

describe("buildDigestEmail", () => {
  const unread = [
    { subject: "New fee payment awaiting confirmation · RCT-1015", preview: "Mrs. Folake paid ₦190,000", createdAt: new Date().toISOString() },
    { subject: "New fee payment awaiting confirmation · RCT-1014", preview: "Mrs. Folake paid ₦170,000", createdAt: new Date().toISOString() },
  ];

  it("daily: subject carries the unread count and the body lists each item", () => {
    const d = buildDigestEmail({ frequency: "daily", adminName: "Super Admin", schoolName: "Greenfield International School", unread });
    assert.ok(d.subject.includes("daily digest"));
    assert.ok(d.subject.includes("2 items"));
    assert.equal(d.preview, "2 unread notifications from the school.");
    assert.ok(d.body.includes("Hi Super Admin,"));
    assert.ok(d.body.includes("Greenfield International School"));
    assert.ok(d.body.includes("1. New fee payment awaiting confirmation · RCT-1015"));
    assert.ok(d.body.includes("2. New fee payment awaiting confirmation · RCT-1014"));
    assert.equal(d.itemCount, 2);
  });

  it("weekly: labels the frequency and handles a single item's plural", () => {
    const d = buildDigestEmail({ frequency: "weekly", adminName: "A", schoolName: "S", unread: [unread[0]] });
    assert.ok(d.subject.includes("weekly digest"));
    assert.ok(d.subject.includes("1 item needs your attention"));
    assert.equal(d.itemCount, 1);
  });

  it("empty unread → all-caught-up subject and preview", () => {
    const d = buildDigestEmail({ frequency: "daily", adminName: "A", schoolName: "S", unread: [] });
    assert.ok(d.subject.includes("all caught up"));
    assert.equal(d.preview, "Nothing new since your last digest.");
    assert.equal(d.itemCount, 0);
  });

  it("is defensive about missing admin/school names", () => {
    const d = buildDigestEmail({ frequency: "daily", unread: [] });
    assert.ok(d.body.length > 0);
  });
});

// ---- demo-store round trip -----------------------------------------------------

describe("digest demo-store", () => {
  it("getDigestPref defaults to off and setDigestPref upserts", async () => {
    const initial = await demoStore.getDigestPref(school.id, admin.id);
    assert.equal(initial.frequency, "off");
    assert.equal(initial.lastSentAt, null);

    const daily = await demoStore.setDigestPref(school.id, admin.id, "daily");
    assert.equal(daily.frequency, "daily");

    const reread = await demoStore.getDigestPref(school.id, admin.id);
    assert.equal(reread.frequency, "daily");
  });

  it("invalid frequencies fall back to off; prefs are per admin", async () => {
    await demoStore.setDigestPref(school.id, admin.id, "monthly");
    assert.equal((await demoStore.getDigestPref(school.id, admin.id)).frequency, "off");

    await demoStore.setDigestPref(school.id, admin.id, "weekly");
    await demoStore.setDigestPref(school.id, admin2.id, "daily");
    assert.equal((await demoStore.getDigestPref(school.id, admin.id)).frequency, "weekly");
    assert.equal((await demoStore.getDigestPref(school.id, admin2.id)).frequency, "daily");
  });

  it("sendDigest records the email and bumps lastSentAt", async () => {
    await demoStore.setDigestPref(school.id, admin.id, "daily");
    const sent = await demoStore.sendDigest({
      schoolId: school.id,
      userId: admin.id,
      frequency: "daily",
      subject: "Your daily digest — all caught up",
      preview: "Nothing new.",
      body: "Hi there,\n\nNothing needs your attention.",
      itemCount: 0,
    });
    assert.ok(sent.id.startsWith("dgs_"));

    const pref = await demoStore.getDigestPref(school.id, admin.id);
    assert.ok(pref.lastSentAt, "lastSentAt was bumped");
    assert.equal(pref.lastSentAt, sent.createdAt);

    const history = await demoStore.listDigests(school.id, admin.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].subject, sent.subject);
  });

  it("digest history is newest-first and scoped to the admin", async () => {
    for (let i = 0; i < 3; i++) {
      await demoStore.sendDigest({
        schoolId: school.id,
        userId: admin.id,
        frequency: "daily",
        subject: `Digest ${i}`,
        preview: "p",
        body: "b",
        itemCount: i,
      });
    }
    await demoStore.sendDigest({
      schoolId: school.id,
      userId: admin2.id,
      frequency: "weekly",
      subject: "Admin Two's digest",
      preview: "p",
      body: "b",
      itemCount: 1,
    });

    const mine = await demoStore.listDigests(school.id, admin.id);
    assert.deepEqual(mine.map((d) => d.subject), ["Digest 2", "Digest 1", "Digest 0"]);

    const theirs = await demoStore.listDigests(school.id, admin2.id);
    assert.equal(theirs.length, 1);
    assert.equal(theirs[0].subject, "Admin Two's digest");
  });

  it("digest prefs + history survive a simulated restart", async () => {
    await demoStore.setDigestPref(school.id, admin.id, "weekly");
    await demoStore.sendDigest({
      schoolId: school.id,
      userId: admin.id,
      frequency: "weekly",
      subject: "Survivor digest",
      preview: "p",
      body: "b",
      itemCount: 2,
    });
    demoStore.__persistNow();
    demoStore.__reloadDemoStore();

    const pref = await demoStore.getDigestPref(school.id, admin.id);
    assert.equal(pref.frequency, "weekly");
    assert.ok(pref.lastSentAt, "lastSentAt survived");

    const history = await demoStore.listDigests(school.id, admin.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].subject, "Survivor digest");
  });
});

// ---- per-admin isolation --------------------------------------------------------

describe("digest per-admin isolation", () => {
  it("each admin's digest content is driven by THEIR OWN unread notifications", async () => {
    // One notification the whole school got.
    const n = await demoStore.createNotification({
      schoolId: school.id,
      kind: "fee_payment",
      to: ["admin@edutrack.app", "admin2@edutrack.app"],
      subject: "New fee payment awaiting confirmation · RCT-1016",
      preview: "Mrs. Folake paid ₦200,000",
      body: "Details",
    });

    // Admin One reads it; Admin Two hasn't.
    await demoStore.markNotificationsRead(school.id, admin.id, [n.id]);

    const forA = (await demoStore.listNotifications(school.id, admin.id)).filter((x) => !x.read);
    const forB = (await demoStore.listNotifications(school.id, admin2.id)).filter((x) => !x.read);

    assert.equal(forA.length, 0, "Admin One cleared it");
    assert.equal(forB.length, 1, "Admin Two still has it unread");

    const digestA = buildDigestEmail({ frequency: "daily", adminName: admin.name, unread: forA });
    const digestB = buildDigestEmail({ frequency: "daily", adminName: admin2.name, unread: forB });

    assert.ok(digestA.subject.includes("all caught up"));
    assert.ok(digestB.subject.includes("1 item needs your attention"));
    assert.ok(digestB.body.includes("RCT-1016"));
  });
});

// ---- end-to-end: payment → notification → digest ---------------------------------

describe("payment → notification → digest end-to-end", () => {
  it("a parent payment lands in the admin's digest until they read it", async () => {
    const student = (await demoStore.listUsers({ schoolId: school.id, role: "STUDENT" }))[0];
    const payment = await demoStore.recordFeePayment({
      schoolId: school.id,
      studentId: student.id,
      amount: 111000,
      method: "CARD",
      note: "Paid by parent via Pay Now",
      status: "PENDING",
    });
    const parent = await demoStore.findUserById(
      (await demoStore.listUsers({ schoolId: school.id, role: "PARENT" }))[0].id
    );
    const note = buildPaymentNotification({ payment, student, parent });
    await demoStore.createNotification({
      schoolId: school.id,
      ...note,
      to: ["admin@edutrack.app"],
    });

    // Admin Two sends a digest — the unread payment must be in it.
    const all = await demoStore.listNotifications(school.id, admin2.id);
    const unread = all.filter((n) => !n.read);
    const digest = buildDigestEmail({ frequency: "daily", adminName: admin2.name, unread });
    assert.equal(digest.itemCount, 1);
    assert.ok(digest.body.includes(payment.receiptNo));

    // The full store-level send flow also persists the record.
    const sent = await demoStore.sendDigest({
      schoolId: school.id,
      userId: admin2.id,
      frequency: "daily",
      ...digest,
    });
    assert.equal(sent.itemCount, 1);
    assert.equal((await demoStore.listDigests(school.id, admin2.id)).length, 1);
  });
});
