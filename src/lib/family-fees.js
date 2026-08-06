/**
 * Combined fee summary across a parent's linked children.
 *
 * Pure aggregation over the per-child `fee` objects returned by
 * GET /api/parent/children (each child: { fee: { amount, paid, pending,
 * balance, feePaid } }). Kept as a pure lib function so the family-balance
 * card on the parent dashboard and any future consumers (e.g. an API totals
 * field) share one tested source of truth.
 *
 * Returns:
 *   children      — number of linked children
 *   billed        — sum of termly fee amounts
 *   paid          — sum of CONFIRMED payments
 *   pending       — sum of payments awaiting school confirmation
 *   balance       — sum of outstanding balances
 *   withBalance   — how many children still owe (balance > 0)
 */
export function summarizeFamilyFees(children = []) {
  return children.reduce(
    (acc, c) => {
      const fee = c.fee || {};
      acc.children += 1;
      acc.billed += Number(fee.amount) || 0;
      acc.paid += Number(fee.paid) || 0;
      acc.pending += Number(fee.pending) || 0;
      acc.balance += Number(fee.balance) || 0;
      if ((Number(fee.balance) || 0) > 0) acc.withBalance += 1;
      return acc;
    },
    { children: 0, billed: 0, paid: 0, pending: 0, balance: 0, withBalance: 0 }
  );
}
