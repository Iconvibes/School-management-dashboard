import { can } from "@/lib/permissions";

/**
 * Compute which tabs a staff role may open.
 *
 * Permission-driven so the UI tracks ROLE_PERMISSIONS (the single source of
 * truth). Every action is enforced server-side by requirePermission on the
 * same action string, so the menu cannot drift from what the API actually
 * allows.
 *
 * @param {string} myRole - The logged-in user's role (SUPER_ADMIN, BURSAR, REGISTRAR).
 * @returns {Array<{ key: string, label: string }>} Visible tab definitions.
 */
export function getVisibleTabs(myRole) {
  const isSuper = can(myRole, "users.manage");
  const canFees = can(myRole, "fees.view");
  const canRoster = can(myRole, "students.manage");
  const canReports = can(myRole, "reports.view");
  const canSchoolEdit = can(myRole, "school.edit");

  return [
    { key: "overview", label: "Overview" },
    ...(canSchoolEdit ? [{ key: "classes", label: "Classes & Arms" }] : []),
    ...(isSuper ? [{ key: "teachers", label: "Teachers & Payroll" }] : []),
    ...(isSuper ? [{ key: "roles", label: "Roles & Access" }] : []),
    ...(isSuper ? [{ key: "logins", label: "Login Details" }] : []),
    ...(isSuper ? [{ key: "timetable", label: "Timetable" }] : []),
    ...(canRoster ? [{ key: "students", label: "Students & Fees" }] : []),
    ...(canFees ? [{ key: "fees", label: "Fee Management" }] : []),
    ...(canReports ? [{ key: "reports", label: "Report Cards" }] : []),
    ...(isSuper || myRole === "REGISTRAR"
      ? [{ key: "archives", label: "Previous Terms" }]
      : []),
    ...(isSuper ? [{ key: "settings", label: "Settings" }] : []),
    ...(isSuper ? [{ key: "scheme", label: "Scheme of Work" }] : []),
    ...(isSuper ? [{ key: "risk", label: "Risk Alerts" }] : []),
    ...(isSuper
      ? [{ key: "performance", label: "Teacher Performance" }]
      : []),
    ...(isSuper ? [{ key: "alumni", label: "Alumni" }] : []),
    ...(isSuper ? [{ key: "engagement", label: "Parent Engagement" }] : []),
    ...(isSuper ? [{ key: "branches", label: "Branches" }] : []),
    ...(isSuper ? [{ key: "compliance", label: "Compliance" }] : []),
    ...(isSuper ? [{ key: "billing", label: "Billing" }] : []),
  ];
}
