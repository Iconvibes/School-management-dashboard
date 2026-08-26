import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { buildPlatformDigest } from "@/lib/platform-digest";
import { sendEmail, isEmailConfigured } from "@/lib/mailer";

/**
 * POST /api/platform/digest/send
 * Generate and optionally email the platform admin's digest.
 * Body: { frequency?: "daily" | "weekly", sendEmail?: boolean }
 *
 * Aggregates platform-wide data: schools, users, alerts, audit logs, health.
 */
export async function POST(request) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine
  }

  const frequency =
    body.frequency === "weekly" ? "weekly" : "daily";

  // ── Gather platform data ──

  // 1. School stats
  let schools = [];
  try {
    const schoolIds = await store.listSchoolIds();
    schools = (
      await Promise.all(schoolIds.map((id) => store.getSchoolById(id)))
    ).filter((s) => s && !s.isPlatformSchool);
  } catch {
    // Fall through
  }

  const totalStudents = schools.reduce(
    (acc, s) => acc + (s.studentCount || 0),
    0
  );
  const totalTeachers = schools.reduce(
    (acc, s) => acc + (s.teacherCount || 0),
    0
  );
  const totalParents = schools.reduce(
    (acc, s) => acc + (s.parentCount || 0),
    0
  );

  // If school objects don't have counts, get them from users
  let enrichedSchools = schools;
  if (totalStudents === 0 && schools.length > 0) {
    enrichedSchools = await Promise.all(
      schools.map(async (s) => {
        try {
          const users = await store.listUsers({ schoolId: s.id });
          return {
            ...s,
            studentCount: users.filter((u) => u.role === "STUDENT").length,
            teacherCount: users.filter((u) => u.role === "TEACHER").length,
            parentCount: users.filter((u) => u.role === "PARENT").length,
          };
        } catch {
          return s;
        }
      })
    );
  }

  const stats = {
    totalSchools: enrichedSchools.length,
    totalStudents:
      enrichedSchools.reduce((a, s) => a + (s.studentCount || 0), 0) || totalStudents,
    totalTeachers:
      enrichedSchools.reduce((a, s) => a + (s.teacherCount || 0), 0) || totalTeachers,
    totalParents:
      enrichedSchools.reduce((a, s) => a + (s.parentCount || 0), 0) || totalParents,
  };

  // 2. Recent alerts (since last digest or last 24h/7d)
  const periodMs = frequency === "weekly" ? 7 * 24 * 3600000 : 24 * 3600000;
  const since = new Date(Date.now() - periodMs).toISOString();

  let recentAlerts = [];
  try {
    const allAlerts = await store.listPlatformAlerts?.({ limit: 50 });
    if (allAlerts) {
      recentAlerts = (allAlerts.alerts || allAlerts).filter(
        (a) => a.createdAt >= since
      );
    }
  } catch {
    // Fall through
  }

  // 3. Recent audit activity
  let recentActivity = [];
  try {
    const { logs } = await store.listAuditLogs({
      from: since.split("T")[0],
      limit: 30,
      offset: 0,
    });
    recentActivity = logs || [];
  } catch {
    // Fall through
  }

  // 4. Alert summary
  let alertSummary = { total: 0, unread: 0, byType: {} };
  try {
    alertSummary.unread = (await store.getUnreadAlertCount?.()) || 0;
    alertSummary.total = recentAlerts.length;
    recentAlerts.forEach((a) => {
      alertSummary.byType[a.type] = (alertSummary.byType[a.type] || 0) + 1;
    });
  } catch {
    // Fall through
  }

  // 5. Health summary
  let healthSummary = { status: "operational" };
  try {
    const health = await store.getHealthDashboard?.();
    if (health) {
      healthSummary = {
        status: health.status || "operational",
        avgResponseMs: health.avgResponseMs || null,
        errorRate: health.errorRate || 0,
      };
    }
  } catch {
    // Fall through
  }

  // ── Build digest ──
  const admin = await store.findUserById?.(session.userId);
  const digest = buildPlatformDigest({
    frequency,
    adminName: admin?.name || "Platform Admin",
    stats,
    schools: enrichedSchools,
    recentAlerts,
    recentActivity,
    alertSummary,
    healthSummary,
  });

  // ── Optionally send email ──
  let emailSent = false;
  if (body.sendEmail !== false && isEmailConfigured()) {
    try {
      const result = await sendEmail({
        to: admin?.email || process.env.PLATFORM_ADMIN_EMAIL,
        subject: digest.subject,
        text: digest.body,
        html: digest.html,
      });
      emailSent = !!result;
    } catch {
      // Email send failure is non-fatal
    }
  }

  // Store digest record
  try {
    await store.sendDigest?.({
      schoolId: "platform",
      userId: session.userId,
      frequency,
      subject: digest.subject,
      preview: digest.preview,
      body: digest.body,
      itemCount: digest.itemCount,
    });
  } catch {
    // Storage failure is non-fatal
  }

  return Response.json({
    digest,
    emailSent,
    emailConfigured: isEmailConfigured(),
  });
}
