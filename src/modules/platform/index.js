/**
 * Platform Module — Manages platform-level alerts, notifications, and audit logging.
 *
 * Store functions: createPlatformAlert, listPlatformAlerts, markAlertsRead,
 *   markAllAlertsRead, getUnreadAlertCount, seedPlatformAlerts,
 *   createAuditLog, listAuditLogs, getAuditLogStats, getAuditHeatmap,
 *   createImpersonationSession, endImpersonationSession, getImpersonationSessions,
 *   getImpersonationSessionDetail, recordImpersonationAction,
 *   recordHealthMetric, getHealthDashboard, getApiHealthSeries
 * API routes: /api/platform/alerts, /api/platform/audit, /api/platform/health
 * Components: AlertsPage, AuditLogPage, HealthPage
 * Models: PlatformAlert, AuditLog, HealthMetric
 */
export * from "./store";
export * from "./webhooks";
