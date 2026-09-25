/**
 * A4-styled official fee receipt for PDF export.
 * Uses ONLY inline hex styles — Tailwind v4 outputs oklch() colors which
 * html2canvas cannot parse. Inline hex keeps the capture 100% reliable
 * (same contract as ReportCard.js).
 */

import { amountInWords, naira } from "@/lib/receipts";

export default function Receipt({ receipt, school }) {
  if (!receipt) return null;

  const brand = receipt.brandColor || school?.brandColor || "#2563EB";
  const initials = (receipt.schoolName || "ES")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      id="fee-receipt"
      style={{
        position: "relative",
        width: "794px", // 210mm @ 96dpi
        minHeight: "540px",
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        padding: "40px 48px",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
          borderBottom: `3px solid ${brand}`,
          paddingBottom: "18px",
        }}
      >
        <div
          style={{
            width: "58px",
            height: "58px",
            borderRadius: "14px",
            background: brand,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px",
            fontWeight: "800",
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", letterSpacing: "-0.5px" }}>
            {receipt.schoolName}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "#64748b",
              marginTop: "3px",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            Official Fee Receipt · {receipt.session} · {receipt.term}
          </div>
        </div>
        <div
          style={{
            background: brand,
            color: "#ffffff",
            padding: "10px 18px",
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: "700",
            letterSpacing: "0.5px",
            textAlign: "center",
          }}
        >
          {receipt.receiptNo}
          <div style={{ fontSize: "9px", fontWeight: "500", opacity: 0.85, marginTop: "2px" }}>
            {receipt.status.toUpperCase()} RECEIPT
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "18px", fontSize: "12px", color: "#64748b" }}>
        <span>
          Date issued: <strong style={{ color: "#0f172a" }}>{receipt.issuedAt}</strong>
        </span>
        <span>
          Payment method: <strong style={{ color: "#0f172a" }}>{receipt.method}</strong>
        </span>
      </div>

      {/* Payee details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "14px" }}>
        <InfoBox label="Received from (Student)" value={receipt.studentName} />
        <InfoBox label="Class Arm" value={receipt.classArm} />
      </div>

      {/* Amount */}
      <div
        style={{
          marginTop: "16px",
          border: `2px solid ${brand}`,
          borderRadius: "12px",
          padding: "16px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", color: "#94a3b8" }}>
            Amount received
          </div>
          <div style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", marginTop: "4px", lineHeight: "1.5" }}>
            {receipt.amountWords}
          </div>
        </div>
        <div style={{ fontSize: "30px", fontWeight: "800", color: brand, whiteSpace: "nowrap" }}>
          {naira(receipt.amount)}
        </div>
      </div>

      {/* Note + balance */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginTop: "14px" }}>
        <div style={{ padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", color: "#94a3b8" }}>
            Note
          </div>
          <div style={{ marginTop: "4px", fontSize: "12.5px", color: "#475569", lineHeight: "1.5" }}>
            {receipt.note || "School fees payment"}
          </div>
        </div>
        <div style={{ padding: "12px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", color: "#16a34a" }}>
            Balance after
          </div>
          <div style={{ marginTop: "4px", fontSize: "18px", fontWeight: "800", color: "#166534" }}>
            {receipt.balance > 0 ? naira(receipt.balance) : "Fully paid ✓"}
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", marginTop: "44px" }}>
        <Signature label="Bursar" />
        <Signature label="School Stamp" />
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: "34px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          borderTop: "1px solid #e2e8f0",
          paddingTop: "12px",
        }}
      >
        <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>
          Generated by Edutrack · This receipt is computer-generated and valid without a physical stamp.
        </span>
        <span style={{ fontSize: "10.5px", fontWeight: "700", color: "#64748b" }}>
          {receipt.schoolName}
        </span>
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px" }}>
      <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", color: "#94a3b8" }}>
        {label}
      </div>
      <div style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", marginTop: "4px" }}>{value}</div>
    </div>
  );
}

function Signature({ label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ height: "42px", margin: "0 auto 6px", borderBottom: "1.5px solid #94a3b8", width: "200px" }} />
      <div style={{ fontSize: "12px", fontWeight: "700", color: "#0f172a" }}>{label}</div>
      <div style={{ fontSize: "10px", color: "#94a3b8" }}>Signature & Date</div>
    </div>
  );
}
