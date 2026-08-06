/**
 * Digest builder for the admin inbox.
 *
 * A digest is an email-style summary of everything an admin has NOT yet read —
 * per-admin read state decides the content, so Admin A's digest never shows
 * items Admin B already cleared (and vice versa). The same record shape is
 * what a real SMTP transport would send; for now the bell renders it in-app.
 */

/**
 * Build the digest email record for one admin.
 *
 * @param {Object} input
 * @param {string} input.frequency    "daily" | "weekly" (drives the subject)
 * @param {string} [input.adminName]  recipient name, e.g. "Super Admin"
 * @param {string} [input.schoolName] school name for the greeting line
 * @param {Array}  input.unread       the admin's UNREAD notifications
 *                                    ({ subject, preview, createdAt } each)
 * @returns {{ subject: string, preview: string, body: string, itemCount: number }}
 */
export function buildDigestEmail({ frequency, adminName, schoolName, unread = [] }) {
  const freq = frequency === "weekly" ? "weekly" : "daily";
  const count = unread.length;
  const subject =
    count === 0
      ? `Your ${freq} digest — all caught up`
      : `Your ${freq} digest — ${count} item${count === 1 ? "" : "s"} ${count === 1 ? "needs" : "need"} your attention`;

  const preview =
    count === 0
      ? "Nothing new since your last digest."
      : `${count} unread notification${count === 1 ? "" : "s"} from the school.`;

  const lines = [
    `Hi ${adminName || "there"},`,
    "",
    `Here is your ${freq} digest for ${schoolName || "your school"}:`,
    "",
  ];
  if (count === 0) {
    lines.push("Nothing needs your attention right now. 🎉");
  } else {
    unread.forEach((n, i) => {
      const when = n.createdAt ? ` (${timeAgo(n.createdAt)})` : "";
      lines.push(`${i + 1}. ${n.subject}${when}`);
      if (n.preview) lines.push(`   ${n.preview}`);
    });
  }
  lines.push("", "Sign in to Edutrack to review and clear your inbox.");

  return { subject, preview, body: lines.join("\n"), itemCount: count };
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
