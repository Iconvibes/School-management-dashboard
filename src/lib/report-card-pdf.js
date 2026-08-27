/**
 * Server-side report card PDF generation using pdfkit.
 *
 * Builds a branded A4 report card for one student, matching the layout of
 * the client-side ReportCard React component. Used by the bulk export
 * endpoint to generate PDFs for an entire class arm in one request.
 *
 * Usage:
 *   import { buildReportCardPDF } from "@/lib/report-card-pdf";
 *   const buffer = await buildReportCardPDF({ school, student, scores, summary, attendance });
 */

import PDFDocument from "pdfkit";

const GRADE_COLORS = { A: "#059669", B: "#2563eb", C: "#d97706", D: "#ea580c", F: "#e11d48" };
const GRADE_BG = { A: "#ecfdf5", B: "#eff6ff", C: "#fffbeb", D: "#fff7ed", F: "#fff1f2" };

/**
 * Build a single report card PDF buffer.
 *
 * @param {Object} opts
 * @param {Object} opts.school     school branding ({ name, brandColor, currentSession, currentTerm, logoUrl })
 * @param {Object} opts.student    student record ({ name, assignedClass })
 * @param {Array}  opts.scores     subject scores [{ subject, ca1, ca2, ca3, ca4, caScore, examScore, totalScore, grade, remark }]
 * @param {Object} opts.summary    calculated summary ({ average, position, outOf, standing, subjects })
 * @param {Object} opts.attendance attendance data ({ total, present, absent })
 * @returns {Promise<Buffer>} PDF buffer
 */
export function buildReportCardPDF({ school, student, scores, summary, attendance }) {
  return new Promise((resolve, reject) => {
    const brand = school?.brandColor || "#2563EB";
    const rows = scores || [];
    const avg = summary?.average || 0;
    const position = summary?.position || null;
    const outOf = summary?.outOf || null;
    const att = attendance || { total: 0, present: 0, absent: 0 };
    const initials = (school?.name || "ES")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, bottom: 40, left: 52, right: 52 },
      info: {
        Title: `Report Card — ${student?.name || "Student"}`,
        Author: school?.name || "EduTrack",
        Subject: `${school?.currentTerm || "Term"} ${school?.currentSession || ""} Report Card`,
        CreationDate: new Date(),
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - 104; // usable width (52 margin each side)
    let y = 48;

    // ── Header ────────────────────────────────────────────────────────
    // Brand color bar
    doc.rect(0, 0, doc.page.width, 6).fill(brand);

    // School name
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#0f172a");
    doc.text(school?.name || "School Name", 52, 24, { width: pageW - 120 });
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    doc.text(
      `Student Academic Report · ${school?.currentSession || "2025/2026"}`,
      52,
      doc.y + 2,
      { width: pageW - 120 }
    );

    // Term badge (right side)
    const badgeW = 90;
    const badgeX = doc.page.width - 52 - badgeW;
    doc.roundedRect(badgeX, 22, badgeW, 36, 6).fill(brand);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffffff");
    doc.text(school?.currentTerm || "First Term", badgeX, 30, {
      width: badgeW,
      align: "center",
    });
    doc.font("Helvetica").fontSize(7).fillColor("#ffffff");
    doc.text("TERM REPORT", badgeX, 44, { width: badgeW, align: "center" });

    // Divider
    y = 64;
    doc.moveTo(52, y).lineTo(doc.page.width - 52, y).lineWidth(2).strokeColor(brand).stroke();
    y += 16;

    // ── Student Info ──────────────────────────────────────────────────
    const infoBoxes = [
      { label: "Student Name", value: student?.name || "—" },
      { label: "Class Arm", value: student?.assignedClass || "—" },
      { label: "Position", value: position ? `${ordinal(position)} of ${outOf}` : "—" },
      { label: "Standing", value: summary?.standing?.label || "—" },
    ];
    const boxW = (pageW - 18) / 4; // 3 gaps of 6px
    infoBoxes.forEach((box, i) => {
      const bx = 52 + i * (boxW + 6);
      doc.roundedRect(bx, y, boxW, 36, 4).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#94a3b8");
      doc.text(box.label.toUpperCase(), bx + 8, y + 6, { width: boxW - 16 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(box.color || "#0f172a");
      doc.text(box.value, bx + 8, y + 18, { width: boxW - 16 });
    });
    y += 50;

    // ── Scores Table ──────────────────────────────────────────────────
    const cols = [
      { label: "Subject", w: 100, align: "left" },
      { label: "CA1", w: 32, align: "center" },
      { label: "CA2", w: 32, align: "center" },
      { label: "CA3", w: 32, align: "center" },
      { label: "CA4", w: 32, align: "center" },
      { label: "CA Tot", w: 38, align: "center" },
      { label: "Exam", w: 38, align: "center" },
      { label: "Total", w: 42, align: "center" },
      { label: "Grade", w: 36, align: "center" },
      { label: "Remark", w: pageW - 100 - 32 * 4 - 38 - 38 - 42 - 36, align: "left" },
    ];

    // Header row
    doc.roundedRect(52, y, pageW, 18, 0).fill(brand);
    let cx = 52;
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff");
    cols.forEach((col) => {
      doc.text(col.label, cx + 4, y + 5, { width: col.w - 8, align: col.align });
      cx += col.w;
    });
    y += 18;

    // Data rows
    rows.forEach((s, i) => {
      const rowH = 18;
      if (y + rowH > doc.page.height - 80) {
        doc.addPage();
        y = 48;
      }
      const bg = i % 2 === 0 ? "#f8fafc" : "#ffffff";
      doc.rect(52, y, pageW, rowH).fill(bg);
      doc.moveTo(52, y + rowH).lineTo(doc.page.width - 52, y + rowH).lineWidth(0.3).strokeColor("#e2e8f0").stroke();

      const vals = [
        s.subject,
        s.ca1 ?? "—",
        s.ca2 ?? "—",
        s.ca3 ?? "—",
        s.ca4 ?? "—",
        s.caScore,
        s.examScore,
        s.totalScore,
        s.grade,
        s.remark || "—",
      ];
      cx = 52;
      cols.forEach((col, ci) => {
        const val = String(vals[ci] ?? "—");
        const isBold = ci === 0 || ci === 5 || ci === 7;
        doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor("#334155");
        doc.text(val, cx + 4, y + 5, { width: col.w - 8, align: col.align });
        cx += col.w;
      });
      y += rowH;
    });

    // Empty state
    if (rows.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor("#94a3b8");
      doc.text("No results recorded for this term yet.", 52, y + 12, {
        width: pageW,
        align: "center",
      });
      y += 36;
    }

    // Total row
    if (rows.length > 0) {
      if (y + 22 > doc.page.height - 80) {
        doc.addPage();
        y = 48;
      }
      doc.rect(52, y, pageW, 22).fill("#f8fafc");
      doc.moveTo(52, y).lineTo(doc.page.width - 52, y).lineWidth(1.5).strokeColor(brand).stroke();
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
      doc.text(`TOTAL · ${summary?.subjects || rows.length} subjects`, 56, y + 6, {
        width: pageW - 80,
      });
      doc.font("Helvetica-Bold").fontSize(14).fillColor(brand);
      doc.text(avg > 0 ? `${avg.toFixed(1)}%` : "—", 52, y + 4, {
        width: pageW - 8,
        align: "right",
      });
      y += 28;
    }

    // ── Attendance + Remark ───────────────────────────────────────────
    if (y + 60 > doc.page.height - 80) {
      doc.addPage();
      y = 48;
    }
    const leftW = pageW * 0.33;
    const rightW = pageW * 0.67 - 14;

    // Attendance box
    doc.roundedRect(52, y, leftW, 52, 4).fillAndStroke("#f8fafc", "#e2e8f0");
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#94a3b8");
    doc.text("ATTENDANCE", 60, y + 6, { width: leftW - 16 });
    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    doc.text(`Days present: ${att.present} of ${att.total || 0}`, 60, y + 20, {
      width: leftW - 16,
    });
    doc.text(`Days absent: ${att.absent}`, 60, y + 32, { width: leftW - 16 });

    // Attendance rate bar
    if (att.total > 0) {
      const rate = att.present / att.total;
      const barW = leftW - 16;
      const barY = y + 44;
      doc.roundedRect(60, barY, barW, 3, 1.5).fill("#e2e8f0");
      const barColor = rate >= 0.9 ? "#059669" : rate >= 0.75 ? "#d97706" : "#e11d48";
      if (barW * rate > 0) {
        doc.roundedRect(60, barY, barW * rate, 3, 1.5).fill(barColor);
      }
    }

    // Remark box
    doc.roundedRect(52 + leftW + 14, y, rightW, 52, 4).fill("#f1f5f9");
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
    doc.text("Class Teacher's Remark: ", 60 + leftW + 14, y + 10, { continued: true });
    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    doc.text(summary?.standing?.remark || "Keep working hard - every effort counts!", {
      width: rightW - 20,
    });

    y += 66;

    // Signatures
    if (y + 60 > doc.page.height - 80) {
      doc.addPage();
      y = 48;
    }
    const sigY = y + 20;
    const sigW = 140;
    doc.moveTo(52, sigY).lineTo(52 + sigW, sigY).lineWidth(0.8).strokeColor("#94a3b8").stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#0f172a");
    doc.text("Class Teacher", 52, sigY + 4, { width: sigW, align: "center" });
    doc.font("Helvetica").fontSize(6).fillColor("#94a3b8");
    doc.text("Signature & Date", 52, sigY + 14, { width: sigW, align: "center" });

    const princX = doc.page.width - 52 - sigW;
    doc.moveTo(princX, sigY).lineTo(princX + sigW, sigY).lineWidth(0.8).strokeColor("#94a3b8").stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#0f172a");
    doc.text("Principal", princX, sigY + 4, { width: sigW, align: "center" });
    doc.font("Helvetica").fontSize(6).fillColor("#94a3b8");
    doc.text("Signature & Date", princX, sigY + 14, { width: sigW, align: "center" });

    y = sigY + 36;

    // Footer
    doc.moveTo(52, y).lineTo(doc.page.width - 52, y).lineWidth(0.3).strokeColor("#e2e8f0").stroke();
    y += 8;
    doc.font("Helvetica").fontSize(7).fillColor("#94a3b8");
    doc.text(
      "Generated by EduTrack - This report is computer-generated and is valid without a physical stamp.",
      52,
      y,
      { width: pageW - 80 }
    );
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#64748b");
    doc.text(school?.name || "", 52, y, { width: pageW, align: "right" });

    doc.end();
  });
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
