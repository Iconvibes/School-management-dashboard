/**
 * A4-styled report card for PDF export.
 * Uses ONLY inline hex styles — Tailwind v4 outputs oklch() colors which
 * html2canvas cannot parse. Inline hex keeps the capture 100% reliable.
 */

import { ordinal } from "@/lib/grading";

const GRADE_COLORS = {
  A: "#059669",
  B: "#2563eb",
  C: "#d97706",
  D: "#ea580c",
  F: "#e11d48",
};

const GRADE_BG = {
  A: "#ecfdf5",
  B: "#eff6ff",
  C: "#fffbeb",
  D: "#fff7ed",
  F: "#fff1f2",
};

export default function ReportCard({ school, user, scores, summary, attendance }) {
  if (!school || !user) return null;

  const brand = school.brandColor || "#2563EB";
  const rows = scores || [];
  const avg = summary?.average || 0;
  const position = summary?.position || null;
  const outOf = summary?.outOf || null;
  const att = attendance || { total: 0, present: 0, absent: 0 };
  const initials = (school.name || "ES").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div
      id="report-card"
      style={{
        position: "relative",
        width: "794px", // 210mm @ 96dpi
        minHeight: "1123px", // 297mm
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        padding: "48px 52px",
        boxSizing: "border-box",
      }}
    >
      {/* Header — school logo (or initials) left, seal right beside the term
          box, the classic school-report layout. The seal reads as the
          official stamp when the card is printed. */}
      <div style={{ display: "flex", alignItems: "center", gap: "20px", borderBottom: `4px solid ${brand}`, paddingBottom: "22px" }}>
        {school.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- plain <img> required for html2canvas CORS capture in the off-screen PDF node
          <img
            src={school.logoUrl}
            alt={school.name || "School logo"}
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "14px",
              background: "#ffffff",
              border: `1px solid ${brand}`,
              objectFit: "contain",
              flexShrink: 0,
            }}
            crossOrigin="anonymous"
          />
        ) : (
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "14px",
              background: brand,
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              fontWeight: "800",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "26px", fontWeight: "800", color: "#0f172a", letterSpacing: "-0.5px" }}>
            {school.name || "School Name"}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", letterSpacing: "1px", textTransform: "uppercase" }}>
            Student Academic Report · {school.currentSession || "2025/2026"}
          </div>
        </div>
        {school.sealUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- plain <img> required for html2canvas CORS capture in the off-screen PDF node
          <img
            src={school.sealUrl}
            alt={`${school.name || "School"} seal`}
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "#ffffff",
              border: `1px solid ${brand}`,
              objectFit: "contain",
              flexShrink: 0,
            }}
            crossOrigin="anonymous"
          />
        ) : null}
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
          {school.currentTerm || "First Term"}
          <div style={{ fontSize: "10px", fontWeight: "500", opacity: 0.85, marginTop: "2px" }}>
            TERM REPORT
          </div>
        </div>
      </div>

      {/* Student info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginTop: "24px" }}>
        <InfoBox label="Student Name" value={user.name} />
        <InfoBox label="Class Arm" value={user.assignedClass || "—"} />
        <InfoBox
          label="Position"
          value={position ? `${ordinal(position)} of ${outOf}` : "—"}
          color={position === 1 ? brand : undefined}
        />
        <InfoBox label="Academic Standing" value={summary.standing?.label || "—"} color={summary.standing?.color} />
      </div>

      {/* Scores table */}
      <table style={{ width: "100%", marginTop: "26px", borderCollapse: "collapse", fontSize: "14px" }}>
        <thead>
          <tr style={{ background: brand, color: "#ffffff" }}>
            {["Subject", "CA (40)", "Exam (60)", "Total (100)", "Grade", "Remark"].map((h, i) => (
              <th
                key={h}
                style={{
                  padding: "12px 12px",
                  textAlign: i === 0 || i === 5 ? "left" : "center",
                  fontWeight: "700",
                  fontSize: "12px",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const bg = i % 2 === 0 ? "#f8fafc" : "#ffffff";
            return (
              <tr key={`${s.subject}-${i}`} style={{ background: bg, borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "9px 12px", fontWeight: "600", color: "#0f172a" }}>{s.subject}</td>
                <td style={{ padding: "9px 12px", textAlign: "center", color: "#334155" }}>{s.caScore}</td>
                <td style={{ padding: "9px 12px", textAlign: "center", color: "#334155" }}>{s.examScore}</td>
                <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: "700", color: "#0f172a" }}>{s.totalScore}</td>
                <td style={{ padding: "6px 12px", textAlign: "center" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      width: "30px",
                      height: "30px",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "8px",
                      background: GRADE_BG[s.grade] || "#f1f5f9",
                      color: GRADE_COLORS[s.grade] || "#0f172a",
                      fontWeight: "800",
                      fontSize: "14px",
                    }}
                  >
                    {s.grade}
                  </span>
                </td>
                <td style={{ padding: "9px 12px", color: "#64748b", fontSize: "12.5px", lineHeight: "1.4" }}>
                  {s.remark || "—"}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                No results recorded for this term yet.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: "12px 14px", fontWeight: "700", color: "#0f172a", borderTop: `3px solid ${brand}` }} colSpan={5}>
              TOTAL · {summary.subjects || 0} subjects
            </td>
            <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: "800", fontSize: "18px", color: brand, borderTop: `3px solid ${brand}` }}>
              {avg > 0 ? `${avg.toFixed(1)}%` : "—"}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Attendance + Remark */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "14px", marginTop: "22px" }}>
        <div style={{ padding: "14px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", color: "#94a3b8" }}>
            Attendance ({school.currentTerm || "This term"})
          </div>
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#475569", lineHeight: "1.7" }}>
            Days present: <strong style={{ color: "#059669" }}>{att.present}</strong> of {att.total || 0}
            <br />
            Days absent: <strong style={{ color: att.absent > 5 ? "#e11d48" : "#0f172a" }}>{att.absent}</strong>
          </div>
        </div>
        <div style={{ padding: "14px 16px", background: "#f1f5f9", borderRadius: "10px", fontSize: "13px", color: "#475569" }}>
          <span style={{ fontWeight: "700", color: "#0f172a" }}>Class Teacher&apos;s Remark: </span>
          {summary.standing?.remark || "Keep working hard — every effort counts!"}
        </div>
      </div>

      {/* Signatures */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", marginTop: "56px" }}>
        <Signature label="Class Teacher" name="" />
        <Signature label="Principal" name="" />
      </div>

      {/* Footer with school logo watermark on the lower right */}
      <div
        style={{
          marginTop: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          borderTop: "1px solid #e2e8f0",
          paddingTop: "14px",
        }}
      >
        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
          Generated by Edutrack · This report is computer-generated and is valid without a physical stamp.
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            opacity: 0.9,
          }}
        >
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- plain <img> required for html2canvas CORS capture in the off-screen PDF node
            <img
              src={school.logoUrl}
              alt={school.name || "School logo"}
              style={{ height: "30px", width: "30px", objectFit: "contain" }}
              crossOrigin="anonymous"
            />
          ) : (
            <div
              style={{
                height: "30px",
                width: "30px",
                borderRadius: "8px",
                background: brand,
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "800",
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
          )}
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", letterSpacing: "0.3px" }}>
            {school.name || ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value, color }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px" }}>
      <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", color: "#94a3b8" }}>
        {label}
      </div>
      <div style={{ fontSize: "14px", fontWeight: "700", color: color || "#0f172a", marginTop: "4px" }}>
        {value}
      </div>
    </div>
  );
}

function Signature({ label, name }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ height: "46px", marginBottom: "4px", borderBottom: "1.5px solid #94a3b8", width: "200px", margin: "0 auto 6px" }} />
      <div style={{ fontSize: "12px", fontWeight: "700", color: "#0f172a" }}>{label}</div>
      <div style={{ fontSize: "10px", color: "#94a3b8" }}>Signature & Date</div>
    </div>
  );
}
