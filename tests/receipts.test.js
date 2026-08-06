/**
 * Fee receipt tests.
 *
 * Covers:
 *   1. amountInWords — the "…Naira Only" wording used on official receipts
 *   2. buildReceipt — every field, the balance-after figure, and defensive
 *      fallbacks when pieces are missing
 *   3. receiptsFromLedger — only CONFIRMED payments become receipts, newest
 *      first, with the exact shape the parent dashboard consumes
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  amountInWords,
  buildReceipt,
  naira,
  receiptsFromLedger,
} from "../src/lib/receipts.js";

// ---- amountInWords ----------------------------------------------------------

describe("amountInWords", () => {
  it("handles small amounts", () => {
    assert.equal(amountInWords(1), "One Naira Only");
    assert.equal(amountInWords(12), "Twelve Naira Only");
    assert.equal(amountInWords(45), "Forty-Five Naira Only");
  });

  it("handles hundreds with the 'and' connector", () => {
    assert.equal(amountInWords(185), "One Hundred and Eighty-Five Naira Only");
    assert.equal(amountInWords(100), "One Hundred Naira Only");
    assert.equal(amountInWords(101), "One Hundred and One Naira Only");
  });

  it("handles thousands, millions and full-scale numbers", () => {
    assert.equal(amountInWords(1000), "One Thousand Naira Only");
    assert.equal(amountInWords(185000), "One Hundred and Eighty-Five Thousand Naira Only");
    assert.equal(
      amountInWords(111000),
      "One Hundred and Eleven Thousand Naira Only"
    );
    assert.equal(amountInWords(1000000), "One Million Naira Only");
    assert.equal(
      amountInWords(1850000),
      "One Million, Eight Hundred and Fifty Thousand Naira Only"
    );
  });

  it("treats zero and junk input as 'Zero Naira Only'", () => {
    assert.equal(amountInWords(0), "Zero Naira Only");
    assert.equal(amountInWords(""), "Zero Naira Only");
    assert.equal(amountInWords("abc"), "Zero Naira Only");
  });

  it("rounds fractional amounts to whole naira", () => {
    assert.equal(amountInWords(185000.6), "One Hundred and Eighty-Five Thousand, One Naira Only");
  });
});

// ---- buildReceipt -----------------------------------------------------------

describe("buildReceipt", () => {
  const base = {
    payment: {
      receiptNo: "RCT-1011",
      amount: 185000,
      method: "CARD",
      note: "Paid by parent via Pay Now",
      createdAt: "2026-08-06T10:00:00.000Z",
      status: "CONFIRMED",
    },
    student: { name: "Kunle Adebayo", assignedClass: "SS1 Science" },
    school: {
      name: "Greenfield International School",
      brandColor: "#2563EB",
      currentSession: "2025/2026",
      currentTerm: "First Term",
    },
    balance: 0,
  };

  it("renders all the receipt fields", () => {
    const r = buildReceipt(base);
    assert.equal(r.receiptNo, "RCT-1011");
    assert.equal(r.studentName, "Kunle Adebayo");
    assert.equal(r.classArm, "SS1 Science");
    assert.equal(r.amount, 185000);
    assert.equal(r.amountWords, "One Hundred and Eighty-Five Thousand Naira Only");
    assert.equal(r.method, "CARD");
    assert.equal(r.note, "Paid by parent via Pay Now");
    assert.equal(r.session, "2025/2026");
    assert.equal(r.term, "First Term");
    assert.equal(r.schoolName, "Greenfield International School");
    assert.equal(r.brandColor, "#2563EB");
    assert.equal(r.status, "Confirmed");
    assert.equal(r.balance, 0);
  });

  it("formats the issued date for display", () => {
    const r = buildReceipt(base);
    assert.match(r.issuedAt, /^\d{2} \w{3} \d{4}$/, "en-GB style date");
  });

  it("keeps the balance-after figure (clamped at zero)", () => {
    const partial = buildReceipt({ ...base, balance: 25000 });
    assert.equal(partial.balance, 25000);
    const negative = buildReceipt({ ...base, balance: -5 });
    assert.equal(negative.balance, 0);
  });

  it("marks PENDING payments as pending (should never appear, but safe)", () => {
    const r = buildReceipt({ ...base, payment: { ...base.payment, status: "PENDING" } });
    assert.equal(r.status, "Pending");
  });

  it("stays usable when pieces are missing (defensive copy)", () => {
    const r = buildReceipt({ payment: {}, student: {}, school: {} });
    assert.ok(r.receiptNo.length > 0);
    assert.ok(r.amountWords.length > 0);
    assert.ok(r.studentName.length > 0);
    assert.ok(r.schoolName.length > 0);
    assert.equal(r.amount, 0);
  });
});

// ---- receiptsFromLedger ------------------------------------------------------

describe("receiptsFromLedger", () => {
  it("keeps only CONFIRMED payments, newest first", () => {
    const entry = {
      payments: [
        { id: "p1", receiptNo: "RCT-1", amount: 50000, method: "CASH", note: "", createdAt: "2026-08-01T09:00:00.000Z", status: "CONFIRMED" },
        { id: "p2", receiptNo: "RCT-2", amount: 135000, method: "CARD", note: "", createdAt: "2026-08-06T10:00:00.000Z", status: "PENDING" },
        { id: "p3", receiptNo: "RCT-3", amount: 70000, method: "TRANSFER", note: "", createdAt: "2026-08-03T09:00:00.000Z", status: "CONFIRMED" },
      ],
    };
    const receipts = receiptsFromLedger(entry);
    assert.equal(receipts.length, 2);
    assert.deepEqual(
      receipts.map((r) => r.receiptNo),
      ["RCT-3", "RCT-1"],
      "newest confirmed first, pending excluded"
    );
    assert.deepEqual(Object.keys(receipts[0]).sort(), [
      "amount",
      "balanceAfter",
      "createdAt",
      "id",
      "method",
      "note",
      "receiptNo",
    ]);
  });

  it("computes each receipt's historical balance-after", () => {
    const entry = {
      payments: [
        { id: "p1", receiptNo: "RCT-1001", amount: 74000, createdAt: "2026-08-01T09:00:00.000Z", status: "CONFIRMED" },
        { id: "p2", receiptNo: "RCT-1011", amount: 111000, createdAt: "2026-08-06T10:00:00.000Z", status: "CONFIRMED" },
      ],
    };
    const receipts = receiptsFromLedger(entry, 185000);
    // Newest first: RCT-1011 cleared the balance, RCT-1001 left ₦111,000.
    assert.deepEqual(receipts.map((r) => [r.receiptNo, r.balanceAfter]), [
      ["RCT-1011", 0],
      ["RCT-1001", 111000],
    ]);
    // Pending payments never count toward the running balance.
    const withPending = receiptsFromLedger(
      {
        payments: [
          { id: "p1", receiptNo: "RCT-1001", amount: 74000, createdAt: "2026-08-01T09:00:00.000Z", status: "CONFIRMED" },
          { id: "p2", receiptNo: "RCT-1011", amount: 111000, createdAt: "2026-08-06T10:00:00.000Z", status: "PENDING" },
        ],
      },
      185000
    );
    assert.deepEqual(withPending[0].balanceAfter, 111000, "pending excluded from the running balance");
  });

  it("clamps balance-after at zero and stays usable with no billed amount", () => {
    const entry = {
      payments: [
        { id: "p1", receiptNo: "RCT-1", amount: 90000, createdAt: "2026-08-01T09:00:00.000Z", status: "CONFIRMED" },
      ],
    };
    assert.equal(receiptsFromLedger(entry, 50000)[0].balanceAfter, 0, "clamped");
    assert.equal(receiptsFromLedger(entry)[0].balanceAfter, 0, "no billed amount → 0");
  });

  it("returns an empty list for no ledger entry or no payments", () => {
    assert.deepEqual(receiptsFromLedger(null), []);
    assert.deepEqual(receiptsFromLedger({}), []);
    assert.deepEqual(receiptsFromLedger({ payments: [{ status: "PENDING" }] }), []);
  });
});

// ---- naira -------------------------------------------------------------------

describe("naira formatting", () => {
  it("formats with the ₦ symbol and thousands separators", () => {
    assert.equal(naira(185000), "₦185,000");
    assert.equal(naira(0), "₦0");
  });
});
