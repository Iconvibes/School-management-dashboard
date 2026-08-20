/**
 * Module barrel export — re-exports all store functions from domain modules.
 *
 * Usage: import * as moduleStore from "@/modules";
 *
 * This provides a single entry point for all module store functions without
 * requiring knowledge of individual module paths.
 */

// School & Admin
export {
  createSchoolAndAdmin,
  searchSchools,
  listSchoolIds,
  getSchoolById,
  updateSchool,
  renameArm,
  rolloverTerm,
  listTermArchives,
  getTermArchiveTerms,
  getTermArchiveDetail,
  getAlumni,
  deleteSchool,
  purgeSchool,
  purgeExpiredDeletedSchools,
  setSchoolStatus,
  getDashboardStats,
  createLead,
  listLeads,
} from "./school/store";

// Users
export {
  getSchoolUserIds,
  listUsers,
  countUsers,
  findAuthSnapshot,
  findUserById,
  findUserByIdWithAuth,
  findUserByEmail,
  findUserByEmailInSchool,
  findParentByNameInSchool,
  findTeacherByNameInSchool,
  createUser,
  updateRole,
  updateUser,
  getChildren,
  deleteUser,
  logRoleAudit,
  listRoleAudit,
} from "./users/store";

// Grading
export {
  saveScores,
  getScoresByClassSubject,
  getScoresByStudent,
  getScoresBySchool,
  getScoresByClassArm,
  detectAcademicRisks,
  getTeacherPerformance,
} from "./grading/store";

// Fees
export {
  getFeeStructures,
  saveFeeStructure,
  getFeeLedger,
  recordFeePayment,
  confirmFeePayment,
  logFeeAudit,
  listFeeAudit,
} from "./fees/store";

// Attendance
export {
  getAttendance,
  saveAttendance,
  getStudentAttendanceSummary,
  getStudentAttendanceRecords,
} from "./attendance/store";

// Timetable
export {
  getTimetable,
  saveTimetableEntry,
  deleteTimetableEntry,
  getTimetableConflict,
  getClassAlertPref,
  setClassAlertPref,
  getConflictScan,
  saveConflictScan,
} from "./timetable/store";

// Communications (notifications, messages, push, digests)
export {
  createNotification,
  listNotifications,
  markNotificationsRead,
  deleteNotifications,
  markNotificationsReconciled,
  getReminderBatchByKey,
  saveReminderBatch,
  sendMessage,
  getConversation,
  listConversations,
  markMessageRead,
  markConversationRead,
  getUnreadMessageCount,
  getNotificationPreferences,
  updateNotificationPreferences,
  getEnabledChannels,
  savePushSubscription,
  listPushSubscriptions,
  removePushSubscriptions,
  deletePushSubscription,
  getDigestPref,
  setDigestPref,
  sendDigest,
  listDigests,
} from "./communications/store";

// Resources (schemes of work + class resources)
export {
  createSchemeOfWork,
  getSchemesOfWork,
  getSchemeOfWork,
  updateSchemeOfWork,
  deleteSchemeOfWork,
  createClassResource,
  listClassResources,
  getClassResource,
  updateClassResource,
  deleteClassResource,
} from "./resources/store";

// Alumni (detailed alumni management)
export {
  createAlumni,
  listAlumni,
  getAlumniRecord,
  updateAlumni,
  deleteAlumni,
  getAlumniStats,
} from "./alumni/store";
