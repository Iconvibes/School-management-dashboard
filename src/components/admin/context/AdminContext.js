"use client";
import { createContext, useContext } from "react";

/**
 * AdminShell context — shared state that every admin tab needs.
 *
 * Provided by page.js, consumed by tab components via useAdminShell().
 * This eliminates prop-drilling for session, stats, roster data, and toast.
 */
const AdminContext = createContext(null);

export function AdminProvider({ value, children }) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

/**
 * @returns {{
 *   session: any,
 *   setSession: Function,
 *   stats: any,
 *   setStats: Function,
 *   teachers: any[],
 *   setTeachers: Function,
 *   students: any[],
 *   setStudents: Function,
 *   parents: any[],
 *   showToast: Function,
 *   refreshStats: Function,
 * }}
 */
export function useAdminShell() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdminShell must be used inside <AdminProvider>");
  return ctx;
}
