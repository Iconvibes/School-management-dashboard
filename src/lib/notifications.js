/**
 * Notification builders for the admin inbox.
 *
 * Notifications are stored and surfaced as email-style messages — subject,
 * preview (list line) and a plain-text body — so the admin sees what happened
 * without digging into the fee tab. The same record shape is what a real SMTP
 * transport would send later; for now it's an in-app inbox.
 */

const naira = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

/**
 * Build the notification fired when a parent submits a Pay Now payment.
 *
 * @param {Object} input
 * @param {Object} input.payment  the created payment ({ receiptNo, amount, method })
 * @param {Object} input.student  the child ({ name, assignedClass })
 * @param {Object} input.parent   the paying parent ({ name })
 * @returns {{ kind: string, subject: string, preview: string, body: string }}
 */
export function buildPaymentNotification({ payment, student, parent }) {
  const studentName = student?.name || "a student";
  const studentLine = `${studentName}${student?.assignedClass ? ` — ${student.assignedClass}` : ""}`;
  const receipt = payment?.receiptNo || "—";

  return {
    kind: "fee_payment",
    subject: `New fee payment awaiting confirmation · ${receipt}`,
    preview: `${parent?.name || "A parent"} paid ${naira(payment?.amount)} for ${studentName} (${receipt})`,
    body: [
      "You have a new fee payment waiting for confirmation.",
      "",
      `  From:    ${parent?.name || "Parent portal"}`,
      `  Student: ${studentLine}`,
      `  Amount:  ${naira(payment?.amount)}`,
      `  Method:  ${payment?.method || "—"}`,
      `  Receipt: ${receipt}`,
      "",
      "This payment was submitted through the parent portal and only counts",
      "toward the student's balance once you confirm it in Fee Management.",
    ].join("\n"),
  };
}

/**
 * Build the notification fired when the school sends a fee reminder.
 *
 * When the student HAS a linked parent the reminder is addressed to the
 * parent (their email lands in `to`); when there is no parent — or the parent
 * record is gone — it falls back to the STUDENT, who receives a copy of the
 * reminder on their own portal. Pass `recipient: "parent" | "student"` (or
 * let the absence of `parent` imply the student).
 *
 * @param {Object} input
 * @param {Object} input.student  the child ({ name, assignedClass })
 * @param {Object} [input.parent] the parent ({ name })
 * @param {number} input.balance  outstanding balance at send time
 * @param {string} [input.schoolName] for the greeting line
 * @param {"parent"|"student"} [input.recipient] who this copy is written for
 * @returns {{ kind: string, subject: string, preview: string, body: string }}
 */
export function buildFeeReminder({ student, parent, balance, schoolName, recipient }) {
  const toStudent = recipient === "student" || (!parent && recipient !== "parent");
  const studentName = student?.name || (toStudent ? "there" : "your child");
  const studentLine = `${studentName}${student?.assignedClass ? ` — ${student.assignedClass}` : ""}`;
  const amount = naira(balance);

  if (toStudent) {
    return {
      kind: "fee_reminder",
      subject: `Fee reminder · ${studentName}`,
      preview: `${studentName} — ${amount} still outstanding`,
      body: [
        `Hi ${studentName},`,
        "",
        `This is a friendly reminder from ${schoolName || "your school"}:`,
        "",
        `  Class: ${student?.assignedClass || "—"}`,
        `  Outstanding balance: ${amount}`,
        "",
        "Kindly complete this term's fee payment at your earliest convenience.",
        "You can pay at the school office, or ask a parent or guardian to",
        "complete the payment for you.",
        "",
        "Thank you,",
        schoolName || "The School Office",
      ].join("\n"),
    };
  }

  return {
    kind: "fee_reminder",
    subject: `Fee reminder · ${studentName}`,
    preview: `${parent?.name || "A parent"} — ${amount} still outstanding for ${studentName}`,
    body: [
      `Hi ${parent?.name || "there"},`,
      "",
      `This is a friendly reminder from ${schoolName || "your child's school"}:`,
      "",
      `  Student: ${studentLine}`,
      `  Outstanding balance: ${amount}`,
      "",
      "Kindly complete this term's fee payment at your earliest convenience.",
      "You can pay securely through the parent portal (Pay Now), or visit the",
      "school office to settle the balance.",
      "",
      "Thank you,",
      schoolName || "The School Office",
    ].join("\n"),
  };
}
