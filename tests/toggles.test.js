/**
 * Pure helpers behind the admin console's instant status toggles.
 *
 * The payroll toggle updates BOTH the teacher row and the Overview stats
 * cards optimistically (flip now, revert on failure). The ±1 bookkeeping is
 * exactly the kind of arithmetic that silently drifts when it lives inline
 * in a 6,700-line component — these tests pin it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { payrollToggleDelta, negateToggleDelta } from "../src/lib/toggles.js";

describe("payrollToggleDelta", () => {
  it("flipping a pending teacher to PAID: +1 paid, -1 pending", () => {
    assert.deepEqual(payrollToggleDelta("PAID"), { payrollPaid: 1, payrollPending: -1 });
  });

  it("flipping a paid teacher to PENDING: -1 paid, +1 pending", () => {
    assert.deepEqual(payrollToggleDelta("PENDING"), { payrollPaid: -1, payrollPending: 1 });
  });
});

describe("negateToggleDelta", () => {
  it("exactly undoes a PAID flip (the revert path)", () => {
    assert.deepEqual(negateToggleDelta(payrollToggleDelta("PAID")), { payrollPaid: -1, payrollPending: 1 });
  });

  it("exactly undoes a PENDING flip (the revert path)", () => {
    assert.deepEqual(negateToggleDelta(payrollToggleDelta("PENDING")), { payrollPaid: 1, payrollPending: -1 });
  });
});
