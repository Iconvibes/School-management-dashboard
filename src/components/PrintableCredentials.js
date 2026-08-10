"use client";

import { createPortal } from "react-dom";
import { Printer, Scissors, X } from "lucide-react";
import useFitScale from "@/components/useFitScale";

// Natural A4 landscape width at 96dpi (297mm → 1123px). The sheet is rendered
// twice with the same classes — a scaled on-screen preview and a portal'd
// .print-area node that @media print sends to paper at full size — so what
// you preview is exactly what prints. useFitScale keeps the preview from ever
// overflowing the viewport (no sideways scrolling on phones).
const SHEET_WIDTH = 1123;

/**
 * Printable credentials sheet — one slip per account (name, email, class/role
 * and password), laid out as cut-out slips you can hand straight to students
 * and parents. Each slip is outlined with a dashed cut line and a scissors
 * cue; cut down the middle of the gaps and hand each slip to its owner.
 *
 * props:
 *   open    – show the preview overlay
 *   onClose – close the preview
 *   school  – school name for the sheet header
 *   title   – sheet title (e.g. "Student Login Credentials")
 *   rows    – [{ name, email, meta, password }] — meta is the class arm or
 *             role label shown under the email
 */
export default function PrintableCredentials({ open, onClose, school = "", title = "", rows = [] }) {
  const [sheetRef, scale] = useFitScale(SHEET_WIDTH, open);
  if (!open) return null;

  const issued = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const sheet = (
    <div className="cred-sheet">
      <div className="cred-head">
        <p className="cred-school">{school}</p>
        <p className="cred-title">{title}</p>
        <p className="cred-sub">
          Issued {issued} · {rows.length} account{rows.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="cred-grid">
        {rows.map((r, i) => (
          <div className="cred-slip" key={i}>
            <Scissors className="cred-cut" aria-hidden="true" />
            <p className="cred-name">{r.name}</p>
            <p className="cred-email">{r.email}</p>
            {r.meta ? <p className="cred-meta">{r.meta}</p> : null}
            <p className="cred-label">Password</p>
            <p className="cred-pass">{r.password || "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/80 p-4 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/40 transition hover:bg-brand-500"
              >
                <Printer className="h-4 w-4" /> Print / Save as PDF
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
          <div ref={sheetRef} className="overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
            <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>{sheet}</div>
          </div>
        </div>
      </div>

      {/* The print node — portaled straight onto <body> so no transformed or
          fixed ancestor can break @media print positioning. */}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="print-area">{sheet}</div>,
          document.body
        )}
    </>
  );
}
