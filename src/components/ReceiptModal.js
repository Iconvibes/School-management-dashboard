"use client";

import { useRef, useState } from "react";
import { Loader2, Printer, X } from "lucide-react";
import Receipt from "@/components/Receipt";
import { warn, error } from "@/lib/log";
import useFitScale from "@/components/useFitScale";
import { buildReceipt, naira } from "@/lib/receipts";

/**
 * Receipt preview modal with A4 PDF export — the parent-facing half of the
 * confirmation loop. When the school confirms a payment, this shows the
 * official receipt and lets the parent download it.
 *
 * Props:
 *  - open, onClose
 *  - school   ({ name, brandColor, currentSession, currentTerm })
 *  - student  ({ name, assignedClass })
 *  - receipts (confirmed payment list: [{ id, receiptNo, amount, method, createdAt }])
 *  - balance  (remaining balance after the newest receipt)
 *  - fileName (optional filename override)
 */
export default function ReceiptModal({
  open,
  onClose,
  school,
  student,
  receipts = [],
  balance = 0,
  fileName,
}) {
  const [index, setIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const captureRef = useRef(null);
  // Scale the 794px A4 sheet to fit the modal at any screen width.
  const [sheetRef, sheetScale] = useFitScale(794, open);

  if (!open) return null;

  const payment = receipts[index] || receipts[0] || null;
  // Prefer the payment's own historical balance-after; the prop is a fallback
  // for older payloads that don't carry it.
  const receiptBalance = payment?.balanceAfter ?? balance;
  const receipt = buildReceipt({ payment, student, school, balance: receiptBalance });
  const safeIndex = Math.min(index, Math.max(0, receipts.length - 1));

  async function exportPDF() {
    setExporting(true);
    let generated = false;
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

      // The PDF exists now — the browser download itself is a nicety that can
      // be blocked (e.g. headless previews), so mark it generated BEFORE save.
      generated = true;

      const base =
        fileName || (student?.name || "student").toLowerCase().replace(/[^a-z]+/g, "-");
      pdf.save(`${base}-receipt-${payment?.receiptNo || "RCT"}.pdf`);
    } catch (err) {
      error("receipt", "PDF generation failed:", err);
    } finally {
      if (generated && student?.id && payment?.receiptNo) {
        // Audit the download (fire-and-forget — never blocks or fails the PDF).
        fetch("/api/fees/audit/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: student.id,
            receiptNo: payment.receiptNo,
            amount: payment.amount,
            method: payment.method,
          }),
        }).catch((e) => warn("receipt-analytics", "failed:", e?.message));
      }
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/80 p-4 backdrop-blur-sm">
      <div ref={sheetRef} className="mx-auto max-w-4xl py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-lg font-bold text-white">
            {student?.name ? `${student.name} — payment receipt` : "Fee receipt"}
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={exportPDF}
              disabled={exporting || !payment}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/40 transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {exporting ? "Generating…" : "Download PDF"}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl bg-white/10 p-2.5 text-white transition hover:bg-white/20"
              aria-label="Close receipt"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Receipt selector — a child can have several confirmed payments */}
        {receipts.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-white/70">Receipts:</span>
            {receipts.map((r, i) => (
              <button
                key={r.id}
                onClick={() => setIndex(i)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  i === safeIndex
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                {r.receiptNo} · {naira(r.amount)}
              </button>
            ))}
          </div>
        )}

        <div
          className="mx-auto w-fit origin-top"
          style={{ transform: `scale(${sheetScale})` }}
        >
          {payment ? (
            <Receipt receipt={receipt} school={school} />
          ) : (
            <div className="rounded-2xl bg-white px-10 py-14 text-center text-sm text-navy-400">
              No confirmed receipts yet.
            </div>
          )}
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
          {payment && <Receipt receipt={receipt} school={school} />}
        </div>
      </div>
    </div>
  );
}
