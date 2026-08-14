/**
 * Pure helpers for the admin console's instant status toggles (payroll, fee).
 * Extracted from the dashboard so the ±1 stats bookkeeping is testable —
 * see tests/toggles.test.js.
 */

/** Stats delta for flipping a teacher's payroll status to `next`. */
export function payrollToggleDelta(next) {
  const toPaid = next === "PAID";
  return {
    payrollPaid: toPaid ? 1 : -1,
    payrollPending: toPaid ? -1 : 1,
  };
}

/** The inverse of a delta — reverts an optimistic flip on failure. */
export function negateToggleDelta(delta) {
  return {
    payrollPaid: -delta.payrollPaid,
    payrollPending: -delta.payrollPending,
  };
}
