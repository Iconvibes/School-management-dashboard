/**
 * buildAlumniCsv behavior tests — the exact bytes the Export button produces.
 *
 * These assert the REAL output string (BOM, header, CRLF endings, quoting)
 * so a regression in escaping — a name with a comma or quote corrupting the
 * file — fails in CI, not on an admin's spreadsheet.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAlumniCsv } from "../src/lib/alumni-csv.js";

describe("buildAlumniCsv", () => {
  it("emits a UTF-8 BOM, header and one row with CRLF endings", () => {
    const csv = buildAlumniCsv([
      { studentName: "Adebisi Ajayi", classArm: "JSS1", lastSession: "2025/2026", lastTerm: "First Term" },
    ]);
    assert.ok(csv.startsWith("\uFEFF"), "must start with the UTF-8 BOM");
    const lines = csv.slice(1).split("\r\n");
    assert.equal(lines[0], "Student name,Last class arm,Last session,Last term");
    assert.equal(lines[1], "Adebisi Ajayi,JSS1,2025/2026,First Term");
    assert.ok(!csv.includes("\n") || csv.includes("\r\n"), "rows joined with CRLF");
  });

  it("quotes fields containing commas, quotes or newlines (RFC 4180)", () => {
    const csv = buildAlumniCsv([
      {
        studentName: 'Ajayi, "Queen" Adebisi',
        classArm: "JSS1, A",
        lastSession: "2025/2026",
        lastTerm: "First Term",
      },
      {
        studentName: "Multi\nLine",
        classArm: "JSS2",
        lastSession: "2025/2026",
        lastTerm: "Second Term",
      },
    ]);
    const lines = csv.slice(1).split("\r\n");
    // Comma and quote both force quoting; embedded quotes are doubled.
    assert.equal(lines[1], '"Ajayi, ""Queen"" Adebisi","JSS1, A",2025/2026,First Term');
    // A literal newline inside the value stays inside the quoted cell.
    assert.equal(lines[2], '"Multi\nLine",JSS2,2025/2026,Second Term');
  });

  it("emits just the header for an empty list", () => {
    assert.equal(
      buildAlumniCsv([]).slice(1),
      "Student name,Last class arm,Last session,Last term"
    );
  });

  it("renders missing fields as empty cells", () => {
    const csv = buildAlumniCsv([
      { studentName: "X", classArm: undefined, lastSession: "", lastTerm: null },
    ]);
    assert.equal(csv.slice(1).split("\r\n")[1], "X,,,");
  });

  it("round-trips through a CSV parse (no unescaped commas or quotes)", () => {
    // A minimal tolerant CSV splitter: quoted cells are atomic.
    const parse = (row) => {
      const cells = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') {
          if (inQ && row[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (ch === "," && !inQ) {
          cells.push(cur);
          cur = "";
        } else cur += ch;
      }
      cells.push(cur);
      return cells;
    };
    const tricky = {
      studentName: 'Olu, "Chief" Okafor',
      classArm: 'SS1, "A"',
      lastSession: "2025/2026",
      lastTerm: "First Term",
    };
    const csv = buildAlumniCsv([tricky]);
    const cells = parse(csv.slice(1).split("\r\n")[1]);
    assert.deepEqual(cells, [
      'Olu, "Chief" Okafor',
      'SS1, "A"',
      "2025/2026",
      "First Term",
    ]);
  });
});
