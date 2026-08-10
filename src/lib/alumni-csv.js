/**
 * Pure CSV builder for the alumni export (student name, last class arm, last
 * session, last term).
 *
 * Kept OUT of the component so the escaping rules are unit-testable:
 *   - fields containing commas, quotes or newlines are double-quoted, with
 *     embedded quotes doubled (RFC 4180);
 *   - rows are joined with CRLF line endings (Excel-safe);
 *   - the string carries a leading UTF-8 BOM (\uFEFF) so Excel opens Nigerian
 *     names (and any accented characters) correctly instead of mojibake.
 *
 * @param {Array} alumni  rows of { studentName, classArm, lastSession, lastTerm }
 * @returns {string} the CSV payload (BOM included), ready for a Blob.
 */
export function buildAlumniCsv(alumni) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Student name", "Last class arm", "Last session", "Last term"];
  const rows = (alumni || []).map((a) =>
    [a.studentName, a.classArm, a.lastSession, a.lastTerm].map(esc)
  );
  return "\uFEFF" + [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}
