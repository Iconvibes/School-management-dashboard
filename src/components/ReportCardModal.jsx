"use client";

import { useRef, useState } from "react";
import { Loader2, Printer, X } from "lucide-react";
import ReportCard from "@/components/ReportCard";
import { error } from "@/lib/log";
import useFitScale from "@/components/useFitScale";

/**
 * Reusable report-card preview modal with A4 PDF export.
 * Used by the student portal (self) and by teachers/admins (any student).
 *
 * Props:
 *  - open, onClose
 *  - school, student, scores, summary, attendance   (report payload)
 *  - fileName                           (optional filename override)
 */
export default function ReportCardModal({
  open,
  onClose,
  school,
  student,
  scores,
  summary,
  attendance,
  fileName,
}) {
  const [exporting, setExporting] = useState(false);
  // Off-screen node is always mounted so html2canvas captures at natural size
  // without clipping from the scrollable / scaled modal context.
  const captureRef = useRef(null);
  // Scale the 794px A4 sheet to fit the modal at any screen width — a phone
  // sees the whole card without horizontal sliding.
  const [sheetRef, sheetScale] = useFitScale(794, open);

  if (!open) return null;

  async function exportPDF() {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const html2canvas = (await import("html2canvas")).default;

      const node = captureRef.current;
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: Math.max(node.scrollWidth + 80, window.innerWidth),
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const base = fileName || (student?.name || "student").toLowerCase().replace(/[^a-z]+/g, "-");
      const sessionSlug = (school?.currentSession || "").replace(/\//g, "-");
      pdf.save(`${base}-report-card-${sessionSlug}.pdf`);
    } catch (err) {
      error("report-card", "PDF generation failed:", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/80 p-4 backdrop-blur-sm">
      <div ref={sheetRef} className="mx-auto max-w-4xl py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-lg font-bold text-white">
            {student?.name ? `${student.name} — report card` : "Report card preview"}
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={exportPDF}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/40 transition hover:bg-brand-500 disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {exporting ? "Generating…" : "Download PDF"}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl bg-white/10 p-2.5 text-white transition hover:bg-white/20"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div
          className="mx-auto w-fit origin-top"
          style={{ transform: `scale(${sheetScale})` }}
        >
          <ReportCard school={school} user={student} scores={scores} summary={summary} attendance={attendance} />
        </div>
      </div>

      {/* Off-screen capture node for clean PDF export */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          zIndex: -1,
          pointerEvents: "none",
        }}
      >
        <div ref={captureRef}>
          <ReportCard school={school} user={student} scores={scores} summary={summary} attendance={attendance} />
        </div>
      </div>
    </div>
  );
}
