/**
 * Family fee summary tests (parent portal — combined balance across children).
 *
 * summarizeFamilyFees aggregates the per-child `fee` objects returned by
 * GET /api/parent/children into family-level totals for the family-balance
 * card on the parent dashboard.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeFamilyFees } from "../src/lib/family-fees.js";

const child = (name, fee) => ({ id: name, name, fee });

describe("summarizeFamilyFees", () => {
  it("returns zeros for an empty family", () => {
    assert.deepEqual(summarizeFamilyFees([]), {
      children: 0,
      billed: 0,
      paid: 0,
      pending: 0,
      balance: 0,
      withBalance: 0,
    });
  });

  it("aggregates a single child with a partial payment", () => {
    const s = summarizeFamilyFees([
      child("Kunle", { amount: 185000, paid: 74000, pending: 0, balance: 111000, feePaid: false }),
    ]);
    assert.deepEqual(s, {
      children: 1,
      billed: 185000,
      paid: 74000,
      pending: 0,
      balance: 111000,
      withBalance: 1,
    });
  });

  it("sums across children: one paid, one owing, one with a pending payment", () => {
    const s = summarizeFamilyFees([
      child("Kunle", { amount: 185000, paid: 185000, pending: 0, balance: 0, feePaid: true }),
      child("Chidinma", { amount: 185000, paid: 74000, pending: 111000, balance: 0, feePaid: false }),
      child("Ada", { amount: 170000, paid: 68000, pending: 0, balance: 102000, feePaid: false }),
    ]);
    assert.deepEqual(s, {
      children: 3,
      billed: 540000,
      paid: 327000,
      pending: 111000,
      balance: 102000,
      withBalance: 1, // only Ada actually owes — Chidinma's pending isn't a balance yet
    });
  });

  it("treats children without a fee object as zero", () => {
    const s = summarizeFamilyFees([
      child("NoStructure", null),
      child("Normal", { amount: 100000, paid: 0, pending: 0, balance: 100000, feePaid: false }),
    ]);
    assert.deepEqual(s, {
      children: 2,
      billed: 100000,
      paid: 0,
      pending: 0,
      balance: 100000,
      withBalance: 1,
    });
  });

  it("handles string amounts defensively (API may return numbers, keep both safe)", () => {
    const s = summarizeFamilyFees([
      child("A", { amount: "185000", paid: "74000", pending: 0, balance: "111000" }),
    ]);
    assert.equal(s.billed, 185000);
    assert.equal(s.paid, 74000);
    assert.equal(s.balance, 111000);
  });
});
