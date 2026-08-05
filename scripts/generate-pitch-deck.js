/**
 * Edutrack pitch deck generator (pptxgenjs).
 * 14 slides, 16:9 (13.333" x 7.5"), dark navy theme matching the brand.
 * Usage: node scripts/generate-pitch-deck.js
 */
const pptxgen = require("pptxgenjs");

const pptx = new pptxgen();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Ferdinard Ashonibare";
pptx.title = "EduTrack — School Management Platform";

// ---- Palette (content-informed: dark navy + brand blue/violet/emerald/amber) ----
const C = {
  BG: "0F172A",
  BG_DARK: "020617",
  CARD: "1E293B",
  CARD_LINE: "334155",
  BRAND: "2563EB",
  BRAND_LT: "60A5FA",
  VIOLET: "A78BFA",
  EMERALD: "10B981",
  EMERALD_LT: "34D399",
  AMBER: "F59E0B",
  WHITE: "FFFFFF",
  MUTED: "94A3B8",
  FAINT: "64748B",
};
const HEAD = "Cambria"; // safe-list serif header
const BODY = "Calibri"; // safe-list sans body

const warnings = [];
function fitWarn(tag, text, wIn, sizePt, hIn, lines) {
  // Rough Calibri/Cambria average char width ~ 0.55 * size (points) -> inches
  const avgCharW = (sizePt * 0.55) / 72;
  const charsPerLine = Math.max(1, Math.floor(wIn / avgCharW));
  const textLen = String(text).length;
  const needLines = Math.ceil(textLen / charsPerLine);
  const lineH = (sizePt * 1.22) / 72;
  const needH = (needLines * lineH * (lines || 1)) / (lines || 1);
  const availH = hIn;
  if (needH > availH + 0.02) {
    warnings.push(
      `[${tag}] "${String(text).slice(0, 38)}…" needs ~${needH.toFixed(2)}" but box is ${availH.toFixed(2)}" (${needLines} lines @ ${sizePt}pt)`
    );
  }
}

function slide(bg = C.BG) {
  const s = pptx.addSlide();
  s.background = { color: bg };
  return s;
}

function footer(s, n, dark = false) {
  const col = dark ? C.FAINT : C.FAINT;
  s.addText("EduTrack — School Management Platform", {
    x: 0.55, y: 7.05, w: 6.5, h: 0.28, fontSize: 9, fontFace: BODY, color: col, margin: 0,
  });
  s.addText(String(n).padStart(2, "0"), {
    x: 12.28, y: 7.05, w: 0.5, h: 0.28, fontSize: 9, fontFace: BODY, bold: true,
    color: C.MUTED, align: "right", margin: 0,
  });
}

function orb(s, x, y, size, color, t = 92) {
  s.addShape("ellipse", {
    x, y, w: size, h: size,
    fill: { color, transparency: t },
    line: { type: "none" },
  });
}

function kicker(s, text, { x = 0.55, y = 0.5, color = C.BRAND_LT, align = "left" } = {}) {
  s.addText(String(text).toUpperCase(), {
    x, y, w: align === "left" ? 10 : 10.7, h: 0.3,
    fontSize: 11, fontFace: BODY, bold: true, color, charSpacing: 3,
    align, margin: 0,
  });
}

function title(s, runs, { x = 0.55, y = 0.85, size = 29, align = "left" } = {}) {
  const w = align === "center" ? 10.7 : 12.2;
  const h = 1.15;
  const plain = runs.map((r) => (typeof r === "string" ? r : r.text)).join("");
  fitWarn("title", plain.replace(/\n/g, " "), w, size, h, 2);
  s.addText(
    runs.map((r) =>
      typeof r === "string"
        ? { text: r, options: { bold: true, color: C.WHITE, fontFace: HEAD } }
        : { text: r.text, options: { bold: true, color: r.color || C.WHITE, fontFace: HEAD } }
    ),
    { x, y, w, h, fontSize: size, align, valign: "top", lineSpacingMultiple: 1.06, margin: 0 }
  );
}

function card(s, x, y, w, h, chip, chipColor, head, body, { chipTxt = 15, bodySize = 11.5, headSize = 14.5 } = {}) {
  s.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: C.CARD }, line: { color: C.CARD_LINE, width: 0.75 },
  });
  s.addShape("roundRect", {
    x: x + 0.2, y: y + 0.2, w: 0.44, h: 0.44, rectRadius: 0.11,
    fill: { color: chipColor }, line: { type: "none" },
  });
  s.addText(chip, {
    x: x + 0.2, y: y + 0.2, w: 0.44, h: 0.44, fontSize: chipTxt, fontFace: BODY,
    bold: true, color: C.WHITE, align: "center", valign: "middle", margin: 0,
  });
  // Adaptive: if the heading wraps to 2 lines, push the body down so they never collide.
  const headW = w - 0.92;
  const cpl = Math.max(1, Math.floor(headW / ((headSize * 0.55) / 72)));
  const headLines = Math.max(1, Math.ceil(head.length / cpl));
  const headH = (headLines * headSize * 1.2) / 72;
  s.addText(head, {
    x: x + 0.76, y: y + 0.16, w: headW, h: headH + 0.04, fontSize: headSize, fontFace: BODY,
    bold: true, color: C.WHITE, valign: "top", lineSpacingMultiple: 1.0, margin: 0,
  });
  fitWarn("card-head", head, headW, headSize, headH + 0.04, headLines);
  const bodyY = y + 0.52 + (headLines > 1 ? headH - 0.24 : 0);
  s.addText(body, {
    x: x + 0.76, y: bodyY, w: headW, h: y + h - bodyY - 0.12, fontSize: bodySize, fontFace: BODY,
    color: C.MUTED, valign: "top", lineSpacingMultiple: 1.12, margin: 0,
  });
  fitWarn("card-body", body, headW, bodySize, y + h - bodyY - 0.12, 3);
}

function bullet(s, x, y, w, bold, rest, { size = 13, lineH = 0.6 } = {}) {
  s.addShape("ellipse", {
    x, y: y + 0.03, w: 0.26, h: 0.26,
    fill: { color: C.EMERALD, transparency: 82 }, line: { color: C.EMERALD_LT, width: 1 },
  });
  s.addText("✓", {
    x, y: y + 0.03, w: 0.26, h: 0.26, fontSize: 10.5, fontFace: BODY, bold: true,
    color: C.EMERALD, align: "center", valign: "middle", margin: 0,
  });
  s.addText(
    [
      { text: bold, options: { bold: true, color: C.WHITE } },
      { text: rest, options: { color: C.MUTED } },
    ],
    { x: x + 0.42, y, w: w - 0.42, h: lineH, fontSize: size, fontFace: BODY, valign: "top", lineSpacingMultiple: 1.1, margin: 0 }
  );
  fitWarn("bullet", bold + " " + rest, w - 0.42, size, lineH, 2);
}

function stat(s, x, y, w, h, num, label, color = C.BRAND_LT) {
  s.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.1,
    fill: { color: C.CARD }, line: { color: C.CARD_LINE, width: 0.75 },
  });
  s.addText(num, {
    x, y: y + 0.12, w, h: 0.42, fontSize: 22, fontFace: HEAD, bold: true, color,
    align: "center", margin: 0,
  });
  s.addText(String(label).toUpperCase(), {
    x, y: y + 0.56, w, h: 0.26, fontSize: 8.5, fontFace: BODY, bold: true,
    color: C.MUTED, align: "center", charSpacing: 1, margin: 0,
  });
}

function metric(s, x, y, w, h, big, sub, color = C.EMERALD) {
  s.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.1,
    fill: { color: C.CARD }, line: { color: "3B4A63", width: 1 },
  });
  s.addText(big, {
    x: x + 0.3, y: y + 0.2, w: w - 0.6, h: 0.46, fontSize: 23, fontFace: HEAD,
    bold: true, color, align: "center", margin: 0,
  });
  fitWarn("metric-big", big, w - 0.6, 23, 0.46, 1);
  s.addText(sub, {
    x: x + 0.3, y: y + 0.72, w: w - 0.6, h: h - 0.86, fontSize: 11, fontFace: BODY,
    color: C.MUTED, align: "center", valign: "top", lineSpacingMultiple: 1.12, margin: 0,
  });
  fitWarn("metric-sub", sub, w - 0.6, 11, h - 0.86, 3);
}

function pill(s, x, y, w, h, runs, { line = { color: "FFFFFF", transparency: 45, width: 1 }, fill = { color: "FFFFFF", transparency: 94 } } = {}) {
  s.addShape("roundRect", { x, y, w, h, rectRadius: h / 2, fill, line });
  s.addText(runs, {
    x, y, w, h, fontSize: 12, fontFace: BODY, color: C.MUTED, align: "center",
    valign: "middle", margin: 0,
  });
}

function step(s, x, y, w, h, n, head, body) {
  s.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: C.CARD }, line: { color: C.CARD_LINE, width: 0.75 },
  });
  s.addText(n, {
    x: x + 0.25, y: y + 0.22, w: 1.4, h: 0.62, fontSize: 38, fontFace: HEAD, bold: true,
    color: C.BRAND_LT, align: "left", margin: 0,
  });
  s.addText(head, {
    x: x + 0.25, y: y + 0.95, w: w - 0.5, h: 0.36, fontSize: 15, fontFace: BODY,
    bold: true, color: C.WHITE, margin: 0,
  });
  fitWarn("step-head", head, w - 0.5, 15, 0.36, 1);
  s.addText(body, {
    x: x + 0.25, y: y + 1.36, w: w - 0.5, h: h - 1.5, fontSize: 11.5, fontFace: BODY,
    color: C.MUTED, valign: "top", lineSpacingMultiple: 1.14, margin: 0,
  });
  fitWarn("step-body", body, w - 0.5, 11.5, h - 1.5, 3);
}

function lead(s, runs, { x = 0.55, y = 6.1, w = 12.2, size = 13, align = "left" } = {}) {
  s.addText(
    runs.map((r) =>
      typeof r === "string"
        ? { text: r, options: { color: C.MUTED } }
        : { text: r.text, options: { color: r.color || C.WHITE, bold: true } }
    ),
    { x, y, w, h: 0.7, fontSize: size, fontFace: BODY, align, valign: "top", lineSpacingMultiple: 1.15, margin: 0 }
  );
  const plain = runs.map((r) => (typeof r === "string" ? r : r.text)).join("");
  fitWarn("lead", plain, w, size, 0.7, 2);
}

// ============================================================================
// 1 · COVER
// ============================================================================
{
  const s = slide(C.BG_DARK);
  orb(s, -1.2, -1.4, 5.2, C.BRAND);
  orb(s, 9.8, 5.2, 4.4, C.VIOLET);

  s.addShape("roundRect", {
    x: 4.62, y: 0.62, w: 1.3, h: 1.3, rectRadius: 0.26,
    fill: { color: C.BRAND }, line: { type: "none" },
  });
  s.addText("E", {
    x: 4.62, y: 0.62, w: 1.3, h: 1.3, fontSize: 52, fontFace: HEAD, bold: true,
    color: C.WHITE, align: "center", valign: "middle", margin: 0,
  });
  s.addText(
    [
      { text: "Edu", options: { color: C.WHITE } },
      { text: "Track", options: { color: C.BRAND_LT } },
    ],
    { x: 6.0, y: 0.62, w: 4.6, h: 1.3, fontSize: 44, fontFace: HEAD, bold: true, valign: "middle", margin: 0 }
  );

  kicker(s, "The all-in-one cloud platform for modern schools", { x: 1.32, y: 2.3, align: "center", color: C.BRAND_LT });
  s.addText(
    [
      { text: "Run your entire school from\n", options: {} },
      { text: "one cloud platform", options: { color: C.BRAND_LT } },
    ],
    { x: 1.32, y: 2.72, w: 10.7, h: 1.5, fontSize: 38, fontFace: HEAD, bold: true, color: C.WHITE, align: "center", lineSpacingMultiple: 1.08, margin: 0 }
  );
  s.addText(
    "Automated report cards · Live grading · Daily attendance · Fee management · Teacher payroll · A parent portal — built for Nigerian schools, from JSS to SSS.",
    { x: 1.82, y: 4.42, w: 9.7, h: 0.75, fontSize: 13.5, fontFace: BODY, color: C.MUTED, align: "center", lineSpacingMultiple: 1.2, margin: 0 }
  );
  fitWarn("cover-lead", "Automated report cards · Live grading · Daily attendance · Fee management · Teacher payroll · A parent portal — built for Nigerian schools, from JSS to SSS.", 9.7, 13.5, 0.75, 2);

  const chips = [
    { t: [{ text: "8", options: { color: C.BRAND_LT, bold: true } }, { text: "  modules", options: {} }], w: 1.5 },
    { t: [{ text: "4", options: { color: C.EMERALD, bold: true } }, { text: "  portals · one login", options: {} }], w: 2.3 },
    { t: [{ text: "Works on ", options: {} }, { text: "any device", options: { color: C.VIOLET, bold: true } }], w: 2.1 },
    { t: [{ text: "Installable as an ", options: {} }, { text: "app", options: { color: C.AMBER, bold: true } }], w: 2.2 },
    { t: [{ text: "0", options: { color: C.EMERALD, bold: true } }, { text: "  paper", options: {} }], w: 1.1 },
  ];
  const gap = 0.16;
  const totalW = chips.reduce((a, c) => a + c.w, 0) + gap * (chips.length - 1);
  let cx = (13.333 - totalW) / 2;
  for (const ch of chips) {
    pill(s, cx, 5.32, ch.w, 0.46, ch.t);
    cx += ch.w + gap;
  }

  s.addShape("ellipse", { x: 5.57, y: 6.06, w: 0.14, h: 0.14, fill: { color: C.EMERALD }, line: { type: "none" } });
  s.addText("Free pilot term for your school — no card required", {
    x: 3.17, y: 5.98, w: 7, h: 0.3, fontSize: 13, fontFace: BODY, bold: true,
    color: C.EMERALD, align: "center", margin: 0,
  });
  s.addText("Presented by Ferdinard Ashonibare", {
    x: 4.17, y: 6.62, w: 5, h: 0.3, fontSize: 11.5, fontFace: BODY, color: C.FAINT,
    align: "center", margin: 0,
  });
}

// ============================================================================
// 2 · PROBLEM
// ============================================================================
{
  const s = slide();
  orb(s, 10.6, -1.5, 4.6, "F43F5E", 90);
  kicker(s, "The problem");
  title(s, [
    { text: "Running a school today is paper,\n", options: {} },
    { text: "notebooks & ", options: {} },
    { text: "2-week report cards", options: { color: C.BRAND_LT } },
  ]);
  const cards = [
    ["✓", C.EMERALD, "Report cards take weeks", "Handwritten or Excel report cards mean a term-end crunch — teachers burn out and parents wait weeks for results."],
    ["★", C.AMBER, "Fees live in notebooks", "Balances tracked in jotter books and spreadsheets — collections leak and nobody knows who truly hasn't paid."],
    ["◔", C.VIOLET, "Attendance is guesswork", "No single record of who's in class day to day — and nothing connects attendance to results or reports."],
    ["✉", C.BRAND, "Parents are in the dark", "Parents only hear about results, attendance and fees when they ask — or when it's too late."],
  ];
  const pos = [
    [0.55, 2.02], [6.85, 2.02], [0.55, 4.08], [6.85, 4.08],
  ];
  cards.forEach(([ch, col, h, b], i) => card(s, pos[i][0], pos[i][1], 5.93, 1.86, ch, col, h, b));
  lead(s, [
    { text: "The result: ", options: {} },
    { text: "a painful term-end crunch, uncertain cash flow,", options: {} },
    { text: " and no single dashboard where the school owner can see everything.", options: {} },
  ], { y: 6.18 });
  footer(s, 2);
}

// ============================================================================
// 3 · SOLUTION
// ============================================================================
{
  const s = slide();
  orb(s, 10.4, 5.1, 4.4, C.BRAND);
  kicker(s, "The solution");
  title(s, [
    { text: "Edutrack puts your whole school\n", options: {} },
    { text: "in one cloud platform", options: { color: C.BRAND_LT } },
  ]);
  const bullets = [
    ["One login, four portals", " — Super Admin, Teacher, Student and Parent each see exactly what they should."],
    ["Works in any browser", " — phones, tablets, laptops and shared school computers. No software to install on school machines."],
    ["Installable as an app", " — teachers and admins can pin Edutrack to their Android or Windows device like a native app."],
    ["Private & secure", " — every school gets a fully isolated space; your data can never mix with another school's."],
  ];
  bullets.forEach(([b, r], i) => bullet(s, 0.55, 2.02 + i * 0.82, 11.6, b, r));
  const stats = [
    ["8", "modules", C.BRAND_LT],
    ["4", "role portals", C.EMERALD],
    ["1", "login", C.VIOLET],
    ["0", "paper needed", C.AMBER],
  ];
  stats.forEach(([n, l, col], i) => stat(s, 0.55 + i * 2.1, 5.55, 1.95, 1.05, n, l, col));
  footer(s, 3);
}

// ============================================================================
// 4 · EIGHT MODULES
// ============================================================================
{
  const s = slide();
  kicker(s, "What you get");
  title(s, [
    { text: "Eight", options: { color: C.BRAND_LT } },
    { text: " modules. One platform.", options: {} },
  ], { size: 30 });
  const mods = [
    ["✓", C.EMERALD, "Report Cards", "A4 PDF, one click."],
    ["✎", C.BRAND, "Grading Matrix", "Grades compute live."],
    ["◔", C.AMBER, "Attendance", "One-tap registers."],
    ["★", C.VIOLET, "Fee Management", "Live balances & receipts."],
    ["⚙", C.BRAND, "Teacher Payroll", "Paid / pending at a glance."],
    ["✉", C.EMERALD, "Parent Portal", "Results, fees & Pay Now."],
    ["●", C.VIOLET, "Multi-Tenant", "Schools fully isolated."],
    ["☁", C.AMBER, "Installable App", "Android & Windows."],
  ];
  mods.forEach(([ch, col, h, b], i) => {
    const colIdx = i % 4;
    const rowIdx = Math.floor(i / 4);
    card(s, 0.55 + colIdx * 3.17, 1.95 + rowIdx * 2.15, 2.95, 1.92, ch, col, h, b, { bodySize: 11, headSize: 13 });
  });
  footer(s, 4);
}

// ============================================================================
// 5 · REPORT CARDS
// ============================================================================
{
  const s = slide();
  orb(s, -1.1, 5.4, 4.2, C.EMERALD);
  kicker(s, "Feature spotlight");
  title(s, [
    { text: "Report cards in ", options: {} },
    { text: "minutes", options: { color: C.BRAND_LT } },
    { text: ", not weeks", options: {} },
  ]);
  const bullets = [
    ["Branded A4 PDF", " with your school's logo and colors — printed or shared as-is."],
    ["Class positions, subject remarks, attendance and signature blocks", " — all on one card."],
    ["Generated in one click", " by teachers, admins — and viewed instantly by students and parents."],
    ["Auto-ranked", " — the best students surface automatically, by average, per class arm."],
  ];
  bullets.forEach(([b, r], i) => bullet(s, 0.55, 1.98 + i * 0.84, 6.9, b, r, { size: 12.5, lineH: 0.66 }));
  metric(s, 7.85, 2.05, 4.9, 1.5, "2 weeks → 3 minutes", "from handwriting to printed branded report cards", C.EMERALD);
  metric(s, 7.85, 3.75, 4.9, 1.5, "100%", "consistent format — no more uneven handwriting or layout errors", C.BRAND_LT);
  footer(s, 5);
}

// ============================================================================
// 6 · GRADING MATRIX
// ============================================================================
{
  const s = slide();
  kicker(s, "For teachers");
  title(s, [
    { text: "An instant ", options: {} },
    { text: "grading matrix", options: { color: C.BRAND_LT } },
  ]);
  const cards = [
    ["✎", C.BRAND, "Type scores, watch grades appear", "Enter CA (out of 40) and Exam (out of 60) — totals and letter grades (A–F) compute live as teachers type. No calculators, no look-up tables."],
    ["✓", C.EMERALD, "Per class arm, per subject", "Each stream — SS1 Science, SS1 Arts, JSS — keeps its own matrix and its own roster. Teachers only ever see their own classes."],
    ["⚙", C.AMBER, "Batch save with safety", "Unsaved changes are flagged, and one click saves the whole class. Scores feed straight into report cards and rankings."],
    ["★", C.VIOLET, "Best students, auto-ranked", "Every dashboard surfaces the top performers by average — perfect for prizes, assembly and records."],
  ];
  const pos = [[0.55, 2.02], [6.85, 2.02], [0.55, 4.18], [6.85, 4.18]];
  cards.forEach(([ch, col, h, b], i) => card(s, pos[i][0], pos[i][1], 5.93, 1.98, ch, col, h, b));
  footer(s, 6);
}

// ============================================================================
// 7 · ATTENDANCE
// ============================================================================
{
  const s = slide();
  orb(s, 10.4, -1.3, 4.0, C.AMBER, 90);
  kicker(s, "Every day");
  title(s, [
    { text: "Attendance in ", options: {} },
    { text: "one tap", options: { color: C.BRAND_LT } },
    { text: " per student", options: {} },
  ]);
  const cards = [
    ["◔", C.AMBER, "Daily registers per class arm", "Teachers open their class, tap Present / Absent for each student, and save. Done in under a minute."],
    ["✓", C.EMERALD, "Flows onto report cards", "Days present are summarized per student per term — automatically included on every report card."],
    ["☁", C.BRAND, "Spot problems early", "Admins see trends across classes — who's slipping, which class has the lowest turnout, and when to call a parent."],
  ];
  cards.forEach(([ch, col, h, b], i) => card(s, 0.55 + i * 4.2, 2.0, 3.95, 2.25, ch, col, h, b, { headSize: 13 }));
  lead(s, [
    { text: "Attendance is no longer guesswork — it's ", options: {} },
    { text: "a record that works for you", options: {} },
    { text: " every single day.", options: {} },
  ], { y: 4.72, size: 16 });
  footer(s, 7);
}

// ============================================================================
// 8 · FEES + PARENT PORTAL
// ============================================================================
{
  const s = slide();
  kicker(s, "Revenue & parents");
  title(s, [
    { text: "Fees that ", options: {} },
    { text: "collect themselves", options: { color: C.BRAND_LT } },
  ]);
  const bullets = [
    ["Fee structures per class arm & term", " — set once, billed automatically."],
    ["Live balances & auto receipts", " — every student's paid / owing at a glance, plus a defaulter list."],
    ["Parents log in, see balances, tap Pay Now", " — from their phone, anytime."],
    ["Anti-fraud by design", " — online payments wait for your confirmation before balances move. You're always in control."],
  ];
  bullets.forEach(([b, r], i) => bullet(s, 0.55, 2.0 + i * 0.84, 6.9, b, r, { size: 12.5, lineH: 0.66 }));
  metric(s, 7.85, 2.05, 4.9, 1.5, "60%", "faster fee collection when parents can pay online", C.EMERALD);
  metric(s, 7.85, 3.75, 4.9, 1.5, "1 tap", "for a parent to pay — and 1 tap for you to confirm", C.AMBER);
  footer(s, 8);
}

// ============================================================================
// 9 · PAYROLL
// ============================================================================
{
  const s = slide();
  orb(s, 9.9, 5.2, 3.8, C.VIOLET);
  kicker(s, "Staff");
  title(s, [
    { text: "Teacher payroll, ", options: {} },
    { text: "always up to date", options: { color: C.BRAND_LT } },
  ]);
  const cards = [
    ["⚙", C.BRAND, "Paid / pending in one click", "Mark salaries as paid or pending as you disburse — the record updates instantly."],
    ["◔", C.EMERALD, "Payroll metrics", "See paid counts, pending counts and staff totals at a glance — no spreadsheet reconciliation."],
    ["✉", C.VIOLET, "Complete staff directory", "Every teacher, their class arm and their payroll status — one list, always current."],
  ];
  cards.forEach(([ch, col, h, b], i) => card(s, 0.55 + i * 4.2, 2.0, 3.95, 2.2, ch, col, h, b, { headSize: 13 }));
  lead(s, [
    { text: "Payroll questions disappear — the answer is ", options: {} },
    { text: "always one click away", options: {} },
    { text: ".", options: {} },
  ], { y: 4.7, size: 16 });
  footer(s, 9);
}

// ============================================================================
// 10 · SECURITY
// ============================================================================
{
  const s = slide();
  kicker(s, "Security & trust");
  title(s, [
    { text: "Secure by design, ", options: {} },
    { text: "private by default", options: { color: C.BRAND_LT } },
  ]);
  const cards = [
    ["●", C.VIOLET, "Multi-tenant isolation", "Your school's students, scores and finances are completely walled off from every other school — enforced at the data layer, not just the screen."],
    ["✓", C.EMERALD, "Role-based portals", "Super Admin, Teacher, Student and Parent each see exactly their own world — nothing more, nothing less."],
    ["☁", C.BRAND, "Strong auth", "Passwords are hashed, sessions use secure cookies, and every request is verified server-side."],
    ["✉", C.AMBER, "Cloud-hosted & backed up", "Works from anywhere, on any device — with your data safe in the cloud, not in a filing cabinet."],
  ];
  const pos = [[0.55, 2.02], [6.85, 2.02], [0.55, 4.15], [6.85, 4.15]];
  cards.forEach(([ch, col, h, b], i) => card(s, pos[i][0], pos[i][1], 5.93, 1.93, ch, col, h, b));
  footer(s, 10);
}

// ============================================================================
// 11 · HOW IT WORKS
// ============================================================================
{
  const s = slide();
  orb(s, -1.2, -1.4, 4.4, C.BRAND);
  kicker(s, "Getting started");
  title(s, [
    { text: "Live in ", options: {} },
    { text: "four simple steps", options: { color: C.BRAND_LT } },
  ]);
  const steps = [
    ["01", "Register your school", "Create your account in under a minute. No card, no contract."],
    ["02", "Onboard your school", "Set class arms (SS1 Science, JSS…), the term calendar and your branding."],
    ["03", "Add your people", "Teachers, students and parents in minutes. Set fee structures per class."],
    ["04", "Grade, mark & collect", "Teachers grade and mark daily. Parents see everything and pay online. Print report cards."],
  ];
  steps.forEach(([n, h, b], i) => step(s, 0.55 + i * 3.17, 2.0, 2.95, 2.6, n, h, b));
  lead(s, [
    { text: "Start with ", options: {} },
    { text: "one class arm this week", options: {} },
    { text: " — you'll be live before the next staff meeting.", options: {} },
  ], { y: 5.05, size: 16 });
  footer(s, 11);
}

// ============================================================================
// 12 · WHO LOGS IN
// ============================================================================
{
  const s = slide();
  kicker(s, "One platform, four portals");
  title(s, [
    { text: "Everyone gets ", options: {} },
    { text: "their own view", options: { color: C.BRAND_LT } },
  ]);
  const roles = [
    ["Super Admin", "Owner / Proprietor", C.BRAND_LT, "Everything: students, teachers, fees, payroll, report cards, and school settings."],
    ["Teacher", "Classroom", C.EMERALD, "Their classes only: grade, mark attendance, add students, generate report cards."],
    ["Student", "Learner", C.VIOLET, "Sees their own results, position, attendance and fee status — nothing else."],
    ["Parent", "Guardian", C.AMBER, "Their children's report cards, attendance and fee balances — and Pay Now."],
  ];
  roles.forEach(([h, tag, col, b], i) => {
    const x = 0.55 + i * 3.17;
    const y = 1.95, w = 2.95, hh = 2.6;
    s.addShape("roundRect", { x, y, w, h: hh, rectRadius: 0.09, fill: { color: C.CARD }, line: { color: C.CARD_LINE, width: 0.75 } });
    s.addText(h, { x: x + 0.25, y: y + 0.24, w: w - 0.5, h: 0.36, fontSize: 17, fontFace: HEAD, bold: true, color: C.WHITE, margin: 0 });
    s.addShape("roundRect", { x: x + 0.25, y: y + 0.68, w: 1.55, h: 0.3, rectRadius: 0.15, fill: { color: col, transparency: 88 }, line: { color: col, transparency: 35, width: 1 } });
    s.addText(tag.toUpperCase(), { x: x + 0.25, y: y + 0.68, w: 1.55, h: 0.3, fontSize: 7.5, fontFace: BODY, bold: true, color: col, align: "center", valign: "middle", charSpacing: 1, margin: 0 });
    fitWarn("role-tag", tag, 1.55, 7.5, 0.3, 1);
    s.addText(b, { x: x + 0.25, y: y + 1.14, w: w - 0.5, h: hh - 1.3, fontSize: 11, fontFace: BODY, color: C.MUTED, valign: "top", lineSpacingMultiple: 1.14, margin: 0 });
    fitWarn("role-body", b, w - 0.5, 11, hh - 1.3, 3);
  });
  const chips = [
    ["Any browser", "phone · tablet · laptop · shared PC"],
    ["Installable app", "Android & Windows, like native"],
    ["Zero training", "teachers pick it up in minutes"],
  ];
  chips.forEach(([h, b], i) => {
    const x = 0.55 + i * 4.2;
    s.addShape("roundRect", { x, y: 4.85, w: 3.95, h: 1.0, rectRadius: 0.1, fill: { color: C.CARD }, line: { color: C.CARD_LINE, width: 0.75 } });
    s.addText(h, { x: x + 0.25, y: 5.0, w: 3.45, h: 0.32, fontSize: 14, fontFace: BODY, bold: true, color: C.WHITE, margin: 0 });
    fitWarn("chip-head", h, 3.45, 14, 0.32, 1);
    s.addText(b, { x: x + 0.25, y: 5.36, w: 3.45, h: 0.34, fontSize: 10, fontFace: BODY, color: C.MUTED, margin: 0 });
    fitWarn("chip-body", b, 3.45, 10, 0.34, 1);
  });
  footer(s, 12);
}

// ============================================================================
// 13 · PILOT OFFER
// ============================================================================
{
  const s = slide(C.BG_DARK);
  orb(s, 10.6, -1.6, 4.8, C.EMERALD, 88);
  kicker(s, "For your school", { x: 1.32, y: 0.55, align: "center" });
  title(s, [
    { text: "A free pilot term. ", options: {} },
    { text: "Nothing to lose.", options: { color: C.BRAND_LT } },
  ], { x: 1.32, y: 0.95, size: 32, align: "center" });
  const cards = [
    ["✓", C.EMERALD, "Full platform, free", "Every module active for the pilot term — report cards, grading, attendance, fees, payroll and the parent portal."],
    ["✉", C.BRAND, "Onboarding help included", "We help you set up class arms, staff and fee structures — and migrate from your current files if needed."],
    ["★", C.AMBER, "No card, no contract", "Try a real term with real data. If you love it, we move you to a simple plan. If not, walk away."],
  ];
  cards.forEach(([ch, col, h, b], i) => card(s, 0.55 + i * 4.2, 2.35, 3.95, 2.25, ch, col, h, b, { headSize: 13 }));
  lead(s, [
    { text: "Most schools go live in ", options: {} },
    { text: "under a week", options: {} },
    { text: " — start with one class arm and grow from there.", options: {} },
  ], { x: 1.32, y: 5.05, w: 10.7, size: 16, align: "center" });
  footer(s, 13, true);
}

// ============================================================================
// 14 · LIVE DEMO / CONTACT
// ============================================================================
{
  const s = slide(C.BG_DARK);
  orb(s, -1.1, 5.3, 4.2, C.BRAND);
  orb(s, 10.8, -1.2, 3.4, C.VIOLET);
  kicker(s, "Next step", { x: 1.32, y: 0.5, align: "center" });
  title(s, [
    { text: "See it ", options: {} },
    { text: "live", options: { color: C.BRAND_LT } },
    { text: " — a 3-minute demo", options: {} },
  ], { x: 1.32, y: 0.9, size: 31, align: "center" });
  const cards = [
    ["✓", C.EMERALD, "A report card generated in one click", "Watch a branded A4 PDF appear from a grading matrix."],
    ["✎", C.BRAND, "Grading as you type", "See totals and grades compute live in the matrix."],
    ["☁", C.AMBER, "A parent payment, start to finish", "Parent pays online → school confirms → balances update."],
  ];
  cards.forEach(([ch, col, h, b], i) => card(s, 0.55 + i * 4.2, 1.95, 3.95, 1.85, ch, col, h, b, { bodySize: 11, headSize: 13 }));
  s.addShape("roundRect", { x: 2.67, y: 4.2, w: 8, h: 1.35, rectRadius: 0.12, fill: { color: C.CARD }, line: { color: C.CARD_LINE, width: 0.75 } });
  s.addText("Ferdinard Ashonibare", { x: 2.67, y: 4.4, w: 8, h: 0.36, fontSize: 16, fontFace: HEAD, bold: true, color: C.WHITE, align: "center", margin: 0 });
  s.addText(
    "ferdinardoluwajuwonlo@gmail.com   ·   +234 913 736 0986   ·   WhatsApp / call",
    { x: 2.67, y: 4.82, w: 8, h: 0.3, fontSize: 11.5, fontFace: BODY, color: C.MUTED, align: "center", margin: 0 }
  );
  fitWarn("contact-1", "ferdinardoluwajuwonlo@gmail.com · +234 913 736 0986 · WhatsApp / call", 8, 11.5, 0.3, 1);
  s.addText(
    "ferdinardashonibare.com   ·   Lagos, Nigeria — serving schools nationwide",
    { x: 2.67, y: 5.14, w: 8, h: 0.3, fontSize: 11.5, fontFace: BODY, color: C.MUTED, align: "center", margin: 0 }
  );
  s.addShape("ellipse", { x: 5.77, y: 5.83, w: 0.14, h: 0.14, fill: { color: C.EMERALD }, line: { type: "none" } });
  s.addText("Free pilot term — register today, no card required", {
    x: 3.17, y: 5.75, w: 7, h: 0.3, fontSize: 13.5, fontFace: BODY, bold: true,
    color: C.EMERALD, align: "center", margin: 0,
  });
  footer(s, 14, true);
}

// ============================================================================
pptx.writeFile({ fileName: "edutrack-pitch-deck.pptx" }).then(() => {
  console.log("Wrote edutrack-pitch-deck.pptx");
  if (warnings.length) {
    console.log("\n--- text-fit warnings ---");
    warnings.forEach((w) => console.log(w));
  } else {
    console.log("No text-fit warnings.");
  }
}).catch((err) => {
  console.error("Failed to write deck:", err);
  process.exit(1);
});
