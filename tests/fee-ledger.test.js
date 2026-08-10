/**
 * Fee ledger tests through the in-memory demo adapter.
 *
 * These run against the SAME adapter the store switchboard resolves to in demo
 * mode (`src/lib/store.js`: `store = isDemoMode() ? demoStore : mongoStore`),
 * so they pin the ledger contract the routes (`/api/fees`, `/api/fees/payments`,
 * `/api/parent/pay`) rely on. The mongo adapter must satisfy the same contract;
 * its suite swaps this import for `mongo-store` behind a test database.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as demoStore from "../src/lib/demo-store.js";

// Seeded school (see demo-store.js `seed()`): Greenfield International School,
// 10 students, fee structures per arm, and one part-payment profile per index.
let schoolId;

beforeEach(async () => {
  demoStore.__resetDemoStore();
  const schools = await demoStore.searchSchools("Greenfield");
  schoolId = schools[0].id;
});

async function ledgerFor(email) {
  const ledger = await demoStore.getFeeLedger(schoolId);
  return ledger.find((l) => l.email === email);
}

describe("fee ledger (seeded state)", () => {
  it("has one row per student with the structure amount for their arm", async () => {
    const ledger = await demoStore.getFeeLedger(schoolId);
    assert.equal(ledger.length, 16);

    // SS1 Science bills 185,000; the seed paid Kunle 40% and Chidinma in full.
    assert.equal((await ledgerFor("k.adebayo@edutrack.app")).amount, 185000);
    assert.equal((await ledgerFor("c.obi@edutrack.app")).amount, 185000);
    // SS1 Arts bills 170,000; Tobi (index 6) was paid 40%.
    assert.equal((await ledgerFor("t.alade@edutrack.app")).amount, 170000);
  });

  it("only CONFIRMED payments count toward paid; balance = amount - paid", async () => {
    const kunle = await ledgerFor("k.adebayo@edutrack.app");
    assert.equal(kunle.paid, 74000); // 40% of 185,000
    assert.equal(kunle.balance, 111000);
    assert.equal(kunle.feePaid, false);

    const chidinma = await ledgerFor("c.obi@edutrack.app");
    assert.equal(chidinma.paid, 185000);
    assert.equal(chidinma.balance, 0);
    assert.equal(chidinma.feePaid, true);

    const hannah = await ledgerFor("h.kalu@edutrack.app"); // SS3 Arts, 175,000
    assert.equal(hannah.paid, 70000);
    assert.equal(hannah.balance, 105000);
  });
});

describe("fee payments", () => {
  it("a PENDING payment never reduces the balance until confirmed", async () => {
    const kunle = await ledgerFor("k.adebayo@edutrack.app");
    const payment = await demoStore.recordFeePayment({
      schoolId,
      studentId: kunle.studentId,
      amount: 50000,
      method: "CARD",
      status: "PENDING",
    });
    assert.match(payment.receiptNo, /^RCT-/);
    assert.equal(payment.status, "PENDING");

    let entry = await ledgerFor("k.adebayo@edutrack.app");
    assert.equal(entry.pending, 50000);
    assert.equal(entry.balance, 111000); // unchanged by the pending payment
    assert.equal(entry.feePaid, false);

    const confirmed = await demoStore.confirmFeePayment({
      schoolId,
      paymentId: payment.id,
    });
    assert.equal(confirmed.status, "CONFIRMED");

    entry = await ledgerFor("k.adebayo@edutrack.app");
    assert.equal(entry.paid, 124000);
    assert.equal(entry.pending, 0);
    assert.equal(entry.balance, 61000);
    assert.equal(entry.feePaid, false);
  });

  it("feePaid flips true once the balance reaches zero", async () => {
    const kunle = await ledgerFor("k.adebayo@edutrack.app");
    await demoStore.recordFeePayment({ schoolId, studentId: kunle.studentId, amount: 111000 });
    const entry = await ledgerFor("k.adebayo@edutrack.app");
    assert.equal(entry.balance, 0);
    assert.equal(entry.feePaid, true);
  });

  it("confirming an unknown or already-confirmed payment returns null", async () => {
    assert.equal(
      await demoStore.confirmFeePayment({ schoolId, paymentId: "does-not-exist" }),
      null
    );

    const kunle = await ledgerFor("k.adebayo@edutrack.app");
    const payment = await demoStore.recordFeePayment({
      schoolId,
      studentId: kunle.studentId,
      amount: 10000,
      status: "PENDING",
    });
    await demoStore.confirmFeePayment({ schoolId, paymentId: payment.id });
    assert.equal(
      await demoStore.confirmFeePayment({ schoolId, paymentId: payment.id }),
      null
    );
  });

  it("coerces invalid amounts to 0 instead of corrupting the ledger", async () => {
    const kunle = await ledgerFor("k.adebayo@edutrack.app");
    const negative = await demoStore.recordFeePayment({
      schoolId,
      studentId: kunle.studentId,
      amount: -50,
    });
    assert.equal(negative.amount, 0);

    const garbage = await demoStore.recordFeePayment({
      schoolId,
      studentId: kunle.studentId,
      amount: "not-a-number",
    });
    assert.equal(garbage.amount, 0);
  });
});

describe("tenant isolation", () => {
  it("a second school gets its own empty ledger; cross-school payments fail", async () => {
    const { school: other } = await demoStore.createSchoolAndAdmin({
      schoolName: "Second Academy",
      adminName: "Admin Two",
      email: "admin2@second.app",
      password: "secret1",
    });

    assert.deepEqual(await demoStore.getFeeLedger(other.id), []);
    assert.equal((await demoStore.listUsers({ schoolId: other.id })).length, 1);

    const kunle = await ledgerFor("k.adebayo@edutrack.app");
    assert.equal(
      await demoStore.recordFeePayment({
        schoolId: other.id, // attacker's school
        studentId: kunle.studentId, // …paying for Greenfield's student
        amount: 5000,
      }),
      null
    );
  });

  it("fee structures are scoped to the school and sorted by arm", async () => {
    const structures = await demoStore.getFeeStructures(schoolId);
    assert.equal(structures.length, 12);
    assert.deepEqual(
      structures.map((s) => s.classArm),
      [
        "JSS1", "JSS2", "JSS3",
        "SS1 Arts", "SS1 Commercial", "SS1 Science",
        "SS2 Arts", "SS2 Commercial", "SS2 Science",
        "SS3 Arts", "SS3 Commercial", "SS3 Science",
      ]
    );
  });
});
