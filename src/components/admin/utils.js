"use client";

// Naira formatting — shared across all admin tab components.
const naira = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Payroll badge — PAID (green) / PENDING (amber).
function PayrollBadge({ status }) {
  const paid = status === "PAID";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
        paid
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
          : "bg-amber-50 text-amber-700 ring-amber-600/20"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${paid ? "bg-emerald-500" : "bg-amber-500"}`}
      />
      {paid ? "Paid" : "Pending"}
    </span>
  );
}

// Audit action metadata — maps action keys to labels and colours.
const AUDIT_META = {
  recorded: { label: "Recorded", bg: "bg-brand-50", text: "text-brand-700", ring: "ring-brand-600/20" },
  confirmed: { label: "Confirmed", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/20" },
  parent_paid: { label: "Parent paid", bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-600/20" },
  receipt_downloaded: { label: "Receipt downloaded", bg: "bg-navy-50", text: "text-navy-600", ring: "ring-navy-600/20" },
  reconciled: { label: "Reconciled", bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-600/20" },
  structure_updated: { label: "Structure updated", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-600/20" },
  reminded: { label: "Reminded", bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-600/20" },
};

function AuditBadge({ action }) {
  const meta = AUDIT_META[action] || {
    label: action?.replace(/_/g, " ") || "—",
    bg: "bg-navy-50",
    text: "text-navy-600",
    ring: "ring-navy-600/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${meta.bg} ${meta.text} ${meta.ring}`}
    >
      {meta.label}
    </span>
  );
}

// Role badge colours — used by the Roles & Login Details tabs.
const ROLE_BADGES = {
  SUPER_ADMIN: "bg-violet-50 text-violet-700 ring-violet-600/20",
  BURSAR: "bg-amber-50 text-amber-700 ring-amber-600/20",
  REGISTRAR: "bg-sky-50 text-sky-700 ring-sky-600/20",
  TEACHER: "bg-brand-50 text-brand-700 ring-brand-600/20",
  PARENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export { naira, PayrollBadge, AuditBadge, AUDIT_META, ROLE_BADGES };
