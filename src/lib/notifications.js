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
 * Default reminder wording shown in the Send reminder modal (and used as the
 * school's saved template when the admin sends without customizing). The
 * placeholders ({name}, {student}, {class}, {balance}, {school}) are filled
 * per recipient when the reminder is built — see renderReminderMessage.
 */
export const DEFAULT_REMINDER_MESSAGE = `Hi {name},

This is a friendly reminder from {school}: the outstanding balance for {student} is {balance}.

Kindly complete this term's fee payment at your earliest convenience. You can pay securely online, or visit the school office to settle the balance.

Thank you,
{school}`;

/**
 * Default wording for students with no linked parent — mirrors the built-in
 * student copy (pay at the office / ask a guardian, never the parent-portal
 * guidance). Separate from the parent message so schools can tailor it.
 */
export const DEFAULT_STUDENT_REMINDER_MESSAGE = `Hi {name},

This is a friendly reminder from {school}:

  Class: {class}
  Outstanding balance: {balance}

Kindly complete this term's fee payment at your earliest convenience. You can pay at the school office, or ask a parent or guardian to complete the payment for you.

Thank you,
{school}`;

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
 * Render a reminder message template, substituting per-recipient placeholders:
 *
 *   {name}    — the recipient's name (the parent, or the student when no
 *               parent is linked)
 *   {student} — the student's name, with class arm (e.g. "Kunle — SS1 Science")
 *   {class}   — the student's class arm only
 *   {balance} — the outstanding balance, formatted in naira
 *   {school}  — the school name
 *
 * Unknown tokens are left untouched. Used when an admin customizes the
 * reminder message before sending; the built-in copy does not use templates.
 */
export function renderReminderMessage(template, { student, parent, balance, schoolName, recipient }) {
  const toStudent = recipient === "student" || (!parent && recipient !== "parent");
  const studentName = student?.name || (toStudent ? "there" : "your child");
  const className = student?.assignedClass || "";
  const name = toStudent ? studentName : parent?.name || "there";

  const map = {
    "{name}": name,
    "{student}": studentName,
    "{class}": className,
    "{balance}": naira(balance),
    "{school}": schoolName || (toStudent ? "Your school" : "Your child's school"),
  };

  let out = String(template);
  for (const [token, value] of Object.entries(map)) {
    out = out.split(token).join(value);
  }
  return out;
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
 * Pass `message` to override the parent copy with a custom template (see
 * `renderReminderMessage` for the placeholders) and `messageStudent` for the
 * no-parent student copy. `messageStudent` falls back to `message` (legacy
 * behavior), which falls back to the built-in copy matching the recipient.
 *
 * @param {Object} input
 * @param {Object} input.student  the child ({ name, assignedClass })
 * @param {Object} [input.parent] the parent ({ name })
 * @param {number} input.balance  outstanding balance at send time
 * @param {string} [input.schoolName] for the greeting line
 * @param {"parent"|"student"} [input.recipient] who this copy is written for
 * @param {string} [input.message] custom parent template (placeholders OK)
 * @param {string} [input.messageStudent] custom student template (placeholders OK)
 * @returns {{ kind: string, subject: string, preview: string, body: string }}
 */
export function buildFeeReminder({ student, parent, balance, schoolName, recipient, message, messageStudent }) {
  const toStudent = recipient === "student" || (!parent && recipient !== "parent");
  const studentName = student?.name || (toStudent ? "there" : "your child");
  const studentLine = `${studentName}${student?.assignedClass ? ` — ${student.assignedClass}` : ""}`;
  const amount = naira(balance);

  if (toStudent) {
    const built = {
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
    // The student variant wins for student-addressed copies; `message` is the
    // legacy fallback so older callers that only pass one message keep working.
    const custom = String(messageStudent || "").trim() || String(message || "").trim();
    if (custom) {
      built.body = renderReminderMessage(custom, { student, parent, balance, schoolName, recipient });
    }
    return built;
  }

  const built = {
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
  if (message && String(message).trim()) {
    built.body = renderReminderMessage(message, { student, parent, balance, schoolName, recipient });
  }
  return built;
}
