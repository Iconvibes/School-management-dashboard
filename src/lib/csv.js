/**
 * Minimal, dependency-free CSV helpers for the import wizard.
 *
 * - parseCSV  : RFC-4180-ish parser. Handles quoted fields, escaped quotes
 *               (""), embedded commas/newlines inside quotes, CRLF line
 *               endings, a leading UTF-8 BOM, and `;` as an alternate
 *               delimiter (common when Excel is set to a European locale).
 * - toCSV     : serializes an array of string arrays with proper quoting.
 *
 * Both functions are pure and use no Node APIs, so they can run in the
 * browser (client-side template/credentials downloads) and under node --test.
 */

/**
 * Parse CSV text into an array of rows (arrays of strings).
 * @param {string} text
 * @param {{ delimiter?: string }} [opts]
 * @returns {string[][]}
 */
export function parseCSV(text, { delimiter } = {}) {
  if (typeof text !== "string") return [];
  let str = text.replace(/^\uFEFF/, ""); // strip UTF-8 BOM
  str = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const delim = delimiter || detectDelimiter(str);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inQuotes) {
      if (c === '"') {
        if (str[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  // Trailing content without a final newline (or an all-empty last row from a
  // trailing newline is already excluded because field/row stay empty).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Pick the delimiter from the first line: `;` wins when it outnumbers `,`.
 * Counts outside quotes only.
 */
function detectDelimiter(str) {
  const firstLine = str.split("\n")[0] || "";
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (const c of firstLine) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (c === ",") commas++;
      else if (c === ";") semicolons++;
    }
  }
  return semicolons > commas ? ";" : ",";
}

/** Quote a single field when it needs it. */
function quote(field) {
  const s = String(field ?? "");
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize rows (arrays of strings) to CSV text.
 * @param {string[][]} rows
 * @returns {string}
 */
export function toCSV(rows) {
  return rows.map((row) => row.map(quote).join(",")).join("\n");
}

/** Wrap CSV text with a UTF-8 BOM so Excel renders it correctly. */
export function withBOM(csv) {
  return `\uFEFF${csv}`;
}
