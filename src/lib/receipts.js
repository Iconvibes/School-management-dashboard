/**
 * Fee receipt helpers — a pure, tested layer between a confirmed payment and
 * the printable receipt shown to parents.
 *
 * A receipt is generated the moment the school confirms a payment; it carries
 * the official receipt number, the amount (in figures and in words — the
 * standard on Nigerian receipts), and the payer/beneficiary details. Keeping
 * this logic in a lib module means the PDF, a future email copy and the
 * dashboard preview all render the same receipt.
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function threeDigits(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let out = "";
  if (hundreds) out += `${ONES[hundreds]} Hundred`;
  if (rest) {
    if (hundreds) out += " and ";
    // Hyphenated compounds are the standard on financial documents
    // (Twenty-Five, not Twenty Five).
    out += rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
  }
  return out;
}

/**
 * Convert an amount to English words in the "…Naira Only" format used on
 * official receipts. Rounds to whole naira (kobo are not billed).
 */
export function amountInWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (n === 0) return "Zero Naira Only";
  const parts = [];
  let scale = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) {
      const words = threeDigits(chunk);
      parts.unshift(`${words}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
    }
    n = Math.floor(n / 1000);
    scale += 1;
  }
  return `${parts.join(", ")} Naira Only`;
}

export const naira = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

/**
 * Build the printable receipt for a (confirmed) payment.
 *
 * @param {Object} input
 * @param {Object} input.payment  the payment ({ receiptNo, amount, method, note, createdAt, status })
 * @param {Object} input.student  the child ({ name, assignedClass })
 * @param {Object} input.school   the school ({ name, brandColor, currentSession, currentTerm })
 * @param {number} [input.balance]  the student's remaining balance after this payment
 */
export function buildReceipt({ payment, student, school, balance }) {
  const amount = Number(payment?.amount) || 0;
  return {
    receiptNo: payment?.receiptNo || "—",
    issuedAt: formatDate(payment?.createdAt),
    studentName: student?.name || "Student",
    classArm: student?.assignedClass || "—",
    amount,
    amountWords: amountInWords(amount),
    method: payment?.method || "—",
    note: payment?.note || "",
    status: payment?.status === "PENDING" ? "Pending" : "Confirmed",
    session: school?.currentSession || "2025/2026",
    term: school?.currentTerm || "First Term",
    schoolName: school?.name || "School",
    brandColor: school?.brandColor || "#2563EB",
    balance: Math.max(0, Number(balance) || 0),
  };
}

/**
 * Pick the confirmed receipts for a child from a fee-ledger entry, newest
 * first. Each receipt carries its own `balanceAfter` — the balance that
 * remained once that payment cleared — so an old receipt shows the state at
 * the time it was issued, not today's balance.
 *
 * @param {Object} entry    a fee-ledger row ({ payments: [...] })
 * @param {number} [billed] the child's billed amount for the term
 */
export function receiptsFromLedger(entry, billed = 0) {
  const payments = entry?.payments || [];
  const confirmed = payments.filter((p) => p.status !== "PENDING");
  // Oldest first (ties broken by receipt number — RCT numbers are sequential
  // in creation order) so the running balance accumulates in payment order.
  // The tiebreak is numeric: "RCT-99" must sort before "RCT-1001".
  const recNo = (p) => Number(String(p.receiptNo || "").replace(/\D/g, "")) || 0;
  const chronological = [...confirmed].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || recNo(a) - recNo(b)
  );
  let cumulative = 0;
  const withBalance = chronological.map((p) => {
    cumulative += Number(p.amount) || 0;
    return {
      id: p.id,
      receiptNo: p.receiptNo,
      amount: p.amount,
      method: p.method,
      note: p.note,
      createdAt: p.createdAt,
      balanceAfter: Math.max(0, (Number(billed) || 0) - cumulative),
    };
  });
  return withBalance.reverse(); // newest first for the dashboard
}


/**
 * Pick ALL payments (pending + confirmed) for a child from a fee-ledger
 * entry, newest first. Unlike receiptsFromLedger (confirmed only), this
 * includes PENDING payments so the parent can see the full payment history
 * including submissions still awaiting school confirmation.
 *
 * @param {Object} entry  a fee-ledger row ({ payments: [...] })
 */
export function paymentsFromLedger(entry) {
  const payments = entry?.payments || [];
  const recNo = (p) => Number(String(p.receiptNo || "").replace(/\D/g, "")) || 0;
  return [...payments]
    .sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt) || recNo(b) - recNo(a)
    )
    .map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      amount: p.amount,
      method: p.method,
      note: p.note,
      status: p.status || "CONFIRMED",
      createdAt: p.createdAt,
    }));
}
