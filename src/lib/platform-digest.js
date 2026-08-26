/**
 * Platform digest builder — aggregates cross-tenant activity into a single
 * email-style summary for the platform admin.
 *
 * Covers: tenant stats, new signups, alerts, billing changes, impersonation,
 * frozen/expired schools, and health status.
 */

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatCurrency(amount) {
  if (!amount) return "\u20A60";
  if (amount >= 1000000) return `\u20A6${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `\u20A6${(amount / 1000).toFixed(1)}K`;
  return `\u20A6${Number(amount).toLocaleString()}`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/**
 * Build a platform digest from raw data.
 *
 * @param {Object} data
 * @param {string} data.frequency  "daily" | "weekly"
 * @param {string} data.adminName  Platform admin name
 * @param {Object} data.stats      { totalSchools, totalStudents, totalTeachers, totalParents }
 * @param {Array}  data.schools    School summary list
 * @param {Array}  data.recentAlerts  Platform alerts since last digest
 * @param {Array}  data.recentActivity  Audit log entries since last digest
 * @param {Object} data.alertSummary  { total, unread, byType: { signups, subscriptions, ... } }
 * @param {Object} data.healthSummary  { status, uptime, avgResponseMs, errorRate }
 * @returns {{ subject, preview, body, itemCount, html, stats }}
 */
export function buildPlatformDigest({
  frequency = "daily",
  adminName = "Platform Admin",
  stats = {},
  schools = [],
  recentAlerts = [],
  recentActivity = [],
  alertSummary = {},
  healthSummary = {},
}) {
  const freq = frequency === "weekly" ? "weekly" : "daily";
  const period = freq === "weekly" ? "past 7 days" : "past 24 hours";

  // Count new signups in period
  const newSchools = recentAlerts.filter((a) => a.type === "school_signup");
  const frozenSchools = schools.filter((s) => s.status === "frozen");
  const expiredSchools = schools.filter(
    (s) => s.subscriptionStatus === "expired"
  );
  const trialSchools = schools.filter((s) => s.subscriptionStatus === "trial");

  const itemCount =
    recentAlerts.length +
    recentActivity.length +
    frozenSchools.length +
    expiredSchools.length;

  const subject =
    itemCount === 0
      ? `EduTrack ${freq} digest — all clear`
      : `EduTrack ${freq} digest — ${itemCount} item${itemCount === 1 ? "" : "s"} need attention`;

  const preview =
    itemCount === 0
      ? `No issues across your ${stats.totalSchools || 0} tenants this ${period}.`
      : `${recentAlerts.length} alerts, ${recentActivity.length} events, ${frozenSchools.length + expiredSchools.length} billing issues across ${stats.totalSchools || 0} tenants.`;

  // ── Plain text body ──
  const lines = [
    `Hi ${adminName},`,
    "",
    `Here is your ${freq} platform digest for the ${period}:`,
    "",
    "── PLATFORM OVERVIEW ──",
    `  Tenants:    ${stats.totalSchools || 0}`,
    `  Students:   ${stats.totalStudents || 0}`,
    `  Teachers:   ${stats.totalTeachers || 0}`,
    `  Parents:    ${stats.totalParents || 0}`,
    "",
  ];

  if (newSchools.length > 0) {
    lines.push(`── NEW SIGNUPS (${newSchools.length}) ──`);
    newSchools.forEach((a) => {
      lines.push(`  + ${a.title || "New school"}`);
      if (a.message) lines.push(`    ${a.message}`);
    });
    lines.push("");
  }

  if (recentActivity.length > 0) {
    lines.push(`── KEY ACTIVITY (${recentActivity.length} events) ──`);
    recentActivity.slice(0, 15).forEach((e) => {
      lines.push(
        `  ${timeAgo(e.createdAt)} · ${e.action} · ${e.actor || "System"}`
      );
      if (e.description) lines.push(`    ${e.description}`);
    });
    if (recentActivity.length > 15) {
      lines.push(`  ... and ${recentActivity.length - 15} more`);
    }
    lines.push("");
  }

  if (frozenSchools.length > 0) {
    lines.push(`── FROZEN SCHOOLS (${frozenSchools.length}) ──`);
    frozenSchools.forEach((s) => {
      lines.push(`  🧊 ${s.name} (${s.billingPlan || "unknown"} plan)`);
    });
    lines.push("");
  }

  if (expiredSchools.length > 0) {
    lines.push(`── EXPIRED SUBSCRIPTIONS (${expiredSchools.length}) ──`);
    expiredSchools.forEach((s) => {
      lines.push(`  ❌ ${s.name} (${s.billingPlan || "unknown"} plan)`);
    });
    lines.push("");
  }

  if (trialSchools.length > 0) {
    lines.push(`── TRIAL SCHOOLS (${trialSchools.length}) ──`);
    trialSchools.forEach((s) => {
      lines.push(`  🆓 ${s.name} (${s.billingPlan || "trial"} plan)`);
    });
    lines.push("");
  }

  if (healthSummary.status) {
    lines.push("── SYSTEM HEALTH ──");
    lines.push(`  Status:    ${healthSummary.status}`);
    if (healthSummary.avgResponseMs)
      lines.push(`  Avg response: ${healthSummary.avgResponseMs}ms`);
    if (healthSummary.errorRate !== undefined)
      lines.push(`  Error rate:   ${healthSummary.errorRate}%`);
    lines.push("");
  }

  if (recentAlerts.length > 0) {
    lines.push(`── RECENT ALERTS (${recentAlerts.length}) ──`);
    recentAlerts.slice(0, 10).forEach((a) => {
      lines.push(
        `  ${a.severity === "critical" ? "🚨" : a.severity === "warning" ? "⚠️" : "ℹ️"} ${a.title || a.type}`
      );
      if (a.message) lines.push(`    ${a.message}`);
    });
    lines.push("");
  }

  lines.push(
    "Sign in to the Platform Control panel to review and take action."
  );

  const body = lines.join("\n");

  // ── HTML body ──
  const html = buildDigestHtml({
    freq,
    period,
    adminName,
    stats,
    newSchools,
    recentActivity,
    frozenSchools,
    expiredSchools,
    trialSchools,
    recentAlerts,
    healthSummary,
  });

  return {
    subject,
    preview,
    body,
    html,
    itemCount,
    stats: {
      tenants: stats.totalSchools || 0,
      students: stats.totalStudents || 0,
      newSignups: newSchools.length,
      frozen: frozenSchools.length,
      expired: expiredSchools.length,
      alerts: recentAlerts.length,
      events: recentActivity.length,
    },
  };
}

function buildDigestHtml({
  freq,
  period,
  adminName,
  stats,
  newSchools,
  recentActivity,
  frozenSchools,
  expiredSchools,
  trialSchools,
  recentAlerts,
  healthSummary,
}) {
  const brandColor = "#0F172A";
  const accentColor = "#06b6d4";

  const statRow = (label, value, color) =>
    `<td style="padding:12px;text-align:center;background:${
      color || "#f9fafb"
    };border-radius:8px;">
      <p style="margin:0;font-size:24px;font-weight:700;color:#111827;">${esc(
        String(value)
      )}</p>
      <p style="margin:4px 0 0;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${esc(
        label
      )}</p>
    </td>`;

  const sectionHeader = (title, count) =>
    `<tr><td style="padding:16px 20px 8px;">
      <h3 style="margin:0;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${esc(
        title
      )}${count !== undefined ? ` (${count})` : ""}</h3>
    </td></tr>`;

  const activityItem = (entry) => {
    const colors = {
      impersonate: "#8b5cf6",
      plan_change: "#3b82f6",
      subscription_activate: "#10b981",
      subscription_cancel: "#ef4444",
      school_status_change: "#f59e0b",
      school_created: "#06b6d4",
      school_frozen: "#ef4444",
      school_restored: "#10b981",
    };
    const color = colors[entry.action] || "#6b7280";
    return `<tr><td style="padding:6px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;border-left:3px solid ${color};"><tr>
        <td style="padding:12px 16px;">
          <p style="margin:0;font-size:14px;color:#111827;">${esc(
            entry.description || entry.action.replace(/_/g, " ")
          )}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">${esc(
            entry.actor || "System"
          )} · ${timeAgo(entry.createdAt)}</p>
        </td>
      </tr></table>
    </td></tr>`;
  };

  const alertItem = (alert) => {
    const icon =
      alert.severity === "critical"
        ? "🚨"
        : alert.severity === "warning"
        ? "⚠️"
        : "ℹ️";
    return `<tr><td style="padding:6px 20px;">
      <p style="margin:0;font-size:14px;color:#374151;">${icon} ${esc(
        alert.title || alert.type
      )}</p>
      ${
        alert.message
          ? `<p style="margin:2px 0 0;font-size:12px;color:#9ca3af;">${esc(
              alert.message
            )}</p>`
          : ""
      }
    </td></tr>`;
  };

  const schoolChip = (name, extra) =>
    `<span style="display:inline-block;padding:4px 10px;margin:2px;border-radius:6px;background:#f3f4f6;font-size:13px;color:#374151;">${esc(
      name
    )}${extra ? ` <span style="color:#9ca3af;font-size:11px;">(${esc(extra)})</span>` : ""}</span>`;

  let sections = "";

  // Stats grid
  sections += `<tr><td style="padding:20px;">
    <table width="100%" cellpadding="0" cellspacing="8">
      <tr>${statRow("TENANTS", stats.totalSchools || 0, "#f0f9ff")}${statRow("STUDENTS", stats.totalStudents || 0, "#f0fdf4")}</tr>
      <tr>${statRow("TEACHERS", stats.totalTeachers || 0, "#eff6ff")}${statRow("PARENTS", stats.totalParents || 0, "#faf5ff")}</tr>
    </table>
  </td></tr>`;

  // New signups
  if (newSchools.length > 0) {
    sections += sectionHeader("NEW SIGNUPS", newSchools.length);
    sections += `<tr><td style="padding:4px 24px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:8px;"><tr><td style="padding:12px 16px;">`;
    newSchools.forEach((a) => {
      sections += `<p style="margin:4px 0;font-size:14px;color:#065f46;">✅ ${esc(
        a.title || "New school registered"
      )}</p>`;
      if (a.message)
        sections += `<p style="margin:2px 0 8px 20px;font-size:12px;color:#6b7280;">${esc(
          a.message
        )}</p>`;
    });
    sections += `</td></tr></table></td></tr>`;
  }

  // Key activity
  if (recentActivity.length > 0) {
    sections += sectionHeader("KEY ACTIVITY", recentActivity.length);
    sections += "<tbody>";
    recentActivity.slice(0, 15).forEach((e) => {
      sections += activityItem(e);
    });
    sections += "</tbody>";
    if (recentActivity.length > 15) {
      sections += `<tr><td style="padding:4px 24px 12px;">
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">... and ${
          recentActivity.length - 15
        } more events</p>
      </td></tr>`;
    }
  }

  // Frozen schools
  if (frozenSchools.length > 0) {
    sections += sectionHeader("FROZEN SCHOOLS", frozenSchools.length);
    sections += `<tr><td style="padding:4px 24px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;"><tr><td style="padding:12px 16px;">`;
    frozenSchools.forEach((s) => {
      sections += `<p style="margin:4px 0;font-size:14px;color:#991b1b;">🧊 ${esc(
        s.name
      )} <span style="color:#9ca3af;font-size:12px;">(${
        s.billingPlan || "unknown"
      } plan)</span></p>`;
    });
    sections += `</td></tr></table></td></tr>`;
  }

  // Expired subscriptions
  if (expiredSchools.length > 0) {
    sections += sectionHeader(
      "EXPIRED SUBSCRIPTIONS",
      expiredSchools.length
    );
    sections += `<tr><td style="padding:4px 24px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;"><tr><td style="padding:12px 16px;">`;
    expiredSchools.forEach((s) => {
      sections += `<p style="margin:4px 0;font-size:14px;color:#991b1b;">❌ ${esc(
        s.name
      )} <span style="color:#9ca3af;font-size:12px;">(${
        s.billingPlan || "unknown"
      } plan)</span></p>`;
    });
    sections += `</td></tr></table></td></tr>`;
  }

  // Trial schools
  if (trialSchools.length > 0) {
    sections += sectionHeader("TRIAL SCHOOLS", trialSchools.length);
    sections += `<tr><td style="padding:4px 20px 12px;">`;
    sections += `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:8px;"><tr><td style="padding:12px 16px;">`;
    trialSchools.forEach((s) => {
      sections += `<p style="margin:4px 0;font-size:14px;color:#1e40af;">🆓 ${esc(
        s.name
      )} <span style="color:#9ca3af;font-size:12px;">(trial)</span></p>`;
    });
    sections += `</td></tr></table></td></tr>`;
  }

  // Health
  if (healthSummary.status) {
    sections += sectionHeader("SYSTEM HEALTH");
    sections += `<tr><td style="padding:4px 24px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;"><tr>
        <td style="padding:12px 16px;width:50%;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Status</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${
            healthSummary.status === "operational" ? "#059669" : "#dc2626"
          };">${esc(healthSummary.status)}</p>
        </td>
        ${
          healthSummary.avgResponseMs
            ? `<td style="padding:12px 16px;width:25%;">
            <p style="margin:0;font-size:12px;color:#6b7280;">Avg Response</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${healthSummary.avgResponseMs}ms</p>
          </td>`
            : ""
        }
        ${
          healthSummary.errorRate !== undefined
            ? `<td style="padding:12px 16px;width:25%;">
            <p style="margin:0;font-size:12px;color:#6b7280;">Error Rate</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${
              healthSummary.errorRate > 5 ? "#dc2626" : "#111827"
            };">${healthSummary.errorRate}%</p>
          </td>`
            : ""
        }
      </tr></table>
    </td></tr>`;
  }

  // Alerts
  if (recentAlerts.length > 0) {
    sections += sectionHeader("RECENT ALERTS", recentAlerts.length);
    sections += "<tbody>";
    recentAlerts.slice(0, 10).forEach((a) => {
      sections += alertItem(a);
    });
    sections += "</tbody>";
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>EduTrack Platform Digest</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body,table,td,p,a,li,blockquote{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
    body{margin:0;padding:0;width:100% !important;height:100% !important}
    @media only screen and (max-width:600px){
      .email-wrapper{padding:16px 8px !important}
      .email-body{width:100% !important;border-radius:8px !important}
      .stat-cell{display:inline-block !important;width:49% !important;box-sizing:border-box !important;padding:10px 6px !important}
      .header-pad{padding:20px 16px !important}
      .header-title{font-size:16px !important}
      .greeting-pad{padding:20px 16px 8px !important}
      .footer-pad{padding:16px !important}
      .health-row td{display:block !important;width:100% !important;border-left:none !important;border-top:1px solid #e5e7eb !important}
      .health-row td:first-child{border-top:none !important}
    }
    @media (prefers-color-scheme:dark){
      .email-bg{background-color:#111827 !important}
      .email-body{background-color:#1f2937 !important}
    }
  </style>
</head>
<body class="email-bg" style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;"><tr><td align="center"><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-wrapper" style="background:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-body" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">

<!-- Header -->
<tr><td class="header-pad" style="background:${brandColor};padding:28px 28px;">
  <h1 class="header-title" style="margin:0;color:#fff;font-size:20px;font-weight:700;">EduTrack Platform Digest</h1>
  <p style="margin:6px 0 0;color:rgba(255,255,255,0.65);font-size:13px;">${esc(freq.charAt(0).toUpperCase() + freq.slice(1))} summary Â· ${esc(period)}</p>
</td></tr>

<!-- Greeting -->
<tr><td class="greeting-pad" style="padding:24px 28px 8px;">
  <p style="margin:0;font-size:16px;color:#374151;">Hi ${esc(adminName)},</p>
  <p style="margin:8px 0 0;font-size:14px;color:#6b7280;line-height:1.5;">Hereâ€™s what happened across your <strong style="color:#111827;">${stats.totalSchools || 0}</strong> tenants this ${esc(period)}:</p>
</td></tr>

<!-- Sections -->
${sections}

<!-- Footer -->
<tr><td class="footer-pad" style="background:#f9fafb;padding:24px 28px;border-top:1px solid #e5e7eb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="padding:0;">
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
        <a href="#" style="color:${accentColor};text-decoration:none;font-weight:600;">Sign in to Platform Control</a> to review and take action.
      </p>
    </td>
    <td align="right" style="padding:0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;"><tr><td style="background:${accentColor};border-radius:6px;padding:8px 16px;">
        <a href="#" style="color:#fff;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;">Open Dashboard â†’</a>
      </td></tr></table>
    </td>
  </tr></table>
  <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;text-align:center;">Sent by EduTrack Platform Â· ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
</td></tr>

</table></td></tr></table>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;
}
