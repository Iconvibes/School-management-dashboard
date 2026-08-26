import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import PDFDocument from "pdfkit";
import JSZip from "jszip";

/**
 * GET /api/platform/audit/export
 * Export audit log entries as CSV, PDF, or a ZIP containing both.
 * Query params: action, schoolId, search, from, to, format (csv|pdf|zip)
 */
export async function GET(req) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || undefined;
  const schoolId = searchParams.get("schoolId") || undefined;
  const search = searchParams.get("search") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const format = searchParams.get("format") || "csv";

  // Build date range label for PDF header
  let dateRangeLabel = "All time";
  if (from || to) {
    const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    dateRangeLabel = from && to ? `${fmt(from)} – ${fmt(to)}` : from ? `From ${fmt(from)}` : `Until ${fmt(to)}`;
  }

  // Fetch ALL matching logs (no pagination for export)
  const { logs } = await store.listAuditLogs({
    action,
    schoolId,
    search,
    from,
    to,
    limit: 10000,
    offset: 0,
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  const rangeSuffix = from || to ? `-${from || "start"}-to-${to || "now"}` : "";

  if (format === "zip") {
    return generateZIP(logs, timestamp, dateRangeLabel, rangeSuffix);
  }
  if (format === "pdf") {
    return generatePDF(logs, timestamp, dateRangeLabel, rangeSuffix);
  }

  return generateCSV(logs, timestamp, rangeSuffix);
}

// ── CSV ───────────────────────────────────────────────────────────

/**
 * Build CSV string from audit logs.
 */
function buildCSV(logs) {
  const headers = ["Date", "Action", "Actor", "School", "Description", "IP Address", "Metadata"];

  const escapeCSV = (val) => {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = logs.map((entry) => [
    new Date(entry.createdAt).toISOString(),
    entry.action,
    entry.actor,
    entry.schoolName || "",
    entry.description || "",
    entry.ip || "",
    entry.meta ? JSON.stringify(entry.meta) : "",
  ]);

  return [headers.join(","), ...rows.map((r) => r.map(escapeCSV).join(","))].join("\n");
}

/**
 * Generate CSV response.
 */
function generateCSV(logs, timestamp, rangeSuffix) {
  const csv = buildCSV(logs);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="edutrack-audit-log-${timestamp}${rangeSuffix}.csv"`,
    },
  });
}

// ── PDF ───────────────────────────────────────────────────────────

/**
 * Build PDF buffer from audit logs.
 */
function buildPDF(logs, dateRangeLabel) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 50, bottom: 40, left: 40, right: 40 },
      info: {
        Title: "EduTrack Audit Log",
        Author: "EduTrack Platform Admin",
        Subject: "Audit trail export",
        CreationDate: new Date(),
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    // ── Header ──
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#0e7490")
      .text("EduTrack Platform Audit Log", 40, 50);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#71717a")
      .text(`Exported on ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}`, 40, 75)
      .text(`Date range: ${dateRangeLabel}`, 40, 90)
      .text(`${logs.length} event${logs.length !== 1 ? "s" : ""}`, 40, 105);

    // Divider
    doc.moveTo(40, 120).lineTo(810, 120).strokeColor("#27272a").lineWidth(0.5).stroke();

    // ── Table Header ──
    const tableTop = 130;
    const colWidths = [110, 100, 100, 120, 220, 80, 80];
    const colLabels = ["Timestamp", "Action", "Actor", "School", "Description", "IP Address", "Metadata"];

    const drawRow = (y, values, isHeader = false) => {
      let x = 40;
      values.forEach((val, i) => {
        const w = colWidths[i];
        if (isHeader) {
          doc.rect(x, y, w, 18).fill("#1e293b");
          doc
            .font("Helvetica-Bold")
            .fontSize(8)
            .fillColor("#a1a1aa")
            .text(String(val), x + 4, y + 5, { width: w - 8 });
        } else {
          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor("#d4d4d8")
            .text(String(val), x + 4, y + 3, { width: w - 8, lineGap: 1 });
        }
        x += w;
      });
    };

    drawRow(tableTop, colLabels, true);

    // ── Table Rows ──
    const ACTION_COLORS = {
      impersonate: "#8b5cf6",
      plan_change: "#3b82f6",
      subscription_activate: "#22c55e",
      subscription_cancel: "#ef4444",
      school_status_change: "#f59e0b",
      school_created: "#22d3ee",
    };

    let y = tableTop + 20;
    const pageHeight = doc.page.height - 40;
    const lineHeight = 14;

    for (let idx = 0; idx < logs.length; idx++) {
      const entry = logs[idx];
      if (y + lineHeight > pageHeight) {
        doc.addPage();
        y = 50;
        drawRow(y, colLabels, true);
        y += 20;
      }

      // Alternating row background
      if (idx % 2 === 0) {
        doc.rect(40, y - 1, 790, lineHeight).fill("#0f0f11");
      }

      const row = [
        new Date(entry.createdAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        entry.action?.replace(/_/g, " ") || "",
        entry.actor || "",
        entry.schoolName || "",
        (entry.description || "").slice(0, 80),
        entry.ip || "",
        entry.meta ? JSON.stringify(entry.meta).slice(0, 40) : "",
      ];

      let x = 40;
      row.forEach((val, i) => {
        const w = colWidths[i];
        if (i === 1) {
          const color = ACTION_COLORS[entry.action] || "#a1a1aa";
          doc.font("Helvetica-Bold").fontSize(7).fillColor(color);
        } else {
          doc.font("Helvetica").fontSize(7).fillColor("#d4d4d8");
        }
        doc.text(String(val), x + 4, y + 2, { width: w - 8, lineGap: 1 });
        x += w;
      });

      y += lineHeight;
    }

    // ── Footer ──
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#52525b")
      .text(
        "EduTrack Platform — Confidential audit trail. Do not distribute.",
        40,
        doc.page.height - 30,
        { align: "center" }
      );

    doc.end();
  });
}

/**
 * Generate PDF response.
 */
function generatePDF(logs, timestamp, dateRangeLabel, rangeSuffix) {
  return buildPDF(logs, dateRangeLabel).then((buffer) =>
    new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="edutrack-audit-log-${timestamp}${rangeSuffix}.pdf"`,
      },
    })
  );
}

// ── ZIP (CSV + PDF) ───────────────────────────────────────────────

/**
 * Generate ZIP response containing both CSV and PDF files.
 */
async function generateZIP(logs, timestamp, dateRangeLabel, rangeSuffix) {
  const zip = new JSZip();
  const folderName = `edutrack-audit-log-${timestamp}${rangeSuffix}`;

  // Add CSV
  const csvContent = buildCSV(logs);
  zip.file(`${folderName}/audit-log.csv`, csvContent);

  // Add PDF
  const pdfBuffer = await buildPDF(logs, dateRangeLabel);
  zip.file(`${folderName}/audit-log.pdf`, pdfBuffer);

  // Add a README summary
  const readme = [
    "EduTrack Platform Audit Log Export",
    "===================================",
    "",
    `Exported: ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}`,
    `Date range: ${dateRangeLabel}`,
    `Total events: ${logs.length}`,
    "",
    "Files included:",
    "  - audit-log.csv   — Spreadsheet format (open in Excel, Google Sheets)",
    "  - audit-log.pdf   — Formatted PDF for printing or archival",
    "",
    "Confidential — Do not distribute.",
  ].join("\n");
  zip.file(`${folderName}/README.txt`, readme);

  // Generate ZIP buffer
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folderName}.zip"`,
    },
  });
}
