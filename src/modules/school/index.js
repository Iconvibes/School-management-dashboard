/**
 * School Module — Manages school settings, admin dashboard stats, term rollover,
 * arm management, class archives, and marketing leads.
 *
 * Store functions: createSchoolAndAdmin, searchSchools, listSchoolIds,
 *   getSchoolById, updateSchool, renameArm, rolloverTerm,
 *   listTermArchives, getTermArchiveTerms, getTermArchiveDetail,
 *   getAlumni, deleteSchool, purgeSchool, purgeExpiredDeletedSchools,
 *   setSchoolStatus, getDashboardStats, createLead, listLeads
 * API routes: /api/school/*, /api/admin/*
 * Components: OverviewTab, SettingsTab
 * Models: School
 */
export * from "./store";
