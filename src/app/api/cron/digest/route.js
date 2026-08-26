/**
 * GET /api/cron/digest
 *
 * Cron endpoint that automatically sends platform admin digests on schedule.
 * Authenticates via CRON_SECRET header (Vercel cron, GitHub Actions, cron-job.org, etc.).
 *
 * Schedule logic:
 *   - Daily:  sends once per day after 08:00 UTC (skips if already sent today)
 *   - Weekly: sends once per Monday after 08:00 UTC (skips if already sent this week)
 *
 * External setup examples:
 *   Vercel: add to vercel.json → { "crons": [{ "path": "/api/cron/digest", "schedule": "0 8 * * *" }] }
 *   GitHub Actions: schedule cron "0 8 * * *" calling this URL
 *   cron-job.org: POST to this URL every hour (endpoint self-checks timing)
 */
import { store } from "@/lib/store";
import { buildPlatformDigest } from "@/lib/platform-digest";
import { sendEmail, isEmailConfigured } from "@/lib/mailer";
import { platformDigestPrefs } from "@/app/api/platform/digest/route";

/** Verify cron secret to prevent unauthorized triggers. */
function verifyAuth(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

/**
 * Check if a digest should be sent now based on frequency and lastSentAt.
 * Returns true if:
 *   - frequency is "daily" and lastSentAt is before today 08:00 UTC
 *   - frequency is "weekly" and lastSentAt is before this Monday 08:00 UTC
 */
function shouldSendNow(frequency, lastSentAt) {
  if (frequency === "off" || !frequency) return false;
  if (!lastSentAt) return true; // Never sent → send now

  const now = new Date();
  const last = new Date(lastSentAt);

  if (frequency === "daily") {
    // Send if last send was before today's 08:00 UTC
    const today8am = new Date(now);
    today8am.setUTCHours(8, 0, 0, 0);
    return last < today8am;
  }

  if (frequency === "weekly") {
    // Send if last send was before this Monday's 08:00 UTC
    const day = now.getUTCDay(); // 0=Sun … 6=Sat
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const thisMonday8am = new Date(now);
    thisMonday8am.setUTCDate(thisMonday8am.getUTCDate() + mondayOffset);
    thisMonday8am.setUTCHours(8, 0, 0, 0);
    return last < thisMonday8am;
  }

  return false;
}

/** Compute next send time. */
function computeNextSendAt(frequency) {
  if (frequency === "off") return null;
  const now = new Date();
  const next = new Date(now);

  if (frequency === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(8, 0, 0, 0);
  } else if (frequency === "weekly") {
    const day = next.getUTCDay();
    const daysUntilMon = day === 0 ? 1 : 8 - day;
    next.setUTCDate(next.getUTCDate() + daysUntilMon);
    next.setUTCHours(8, 0, 0, 0);
  }

  return next.toISOString();
}

/** Gather platform-wide data for the digest. */
async function gatherPlatformData(frequency) {
  const periodMs = frequency === "weekly" ? 7 * 24 * 3600000 : 24 * 3600000;
  const since = new Date(Date.now() - periodMs).toISOString();

  // 1. Schools
  let schools = [];
  try {
    const schoolIds = await store.listSchoolIds();
    schools = (
      await Promise.all(schoolIds.map((id) => store.getSchoolById(id)))
    ).filter((s) => s && !s.isPlatformSchool);
  } catch {
    // Fall through
  }

  // Enrich with user counts if needed
  const totalStudents = schools.reduce((a, s) => a + (s.studentCount || 0), 0);
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
    totalStudents: enrichedSchools.reduce((a, s) => a + (s.studentCount || 0), 0),
    totalTeachers: enrichedSchools.reduce((a, s) => a + (s.teacherCount || 0), 0),
    totalParents: enrichedSchools.reduce((a, s) => a + (s.parentCount || 0), 0),
  };

  // 2. Recent alerts
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

  // 4. Health summary
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

  return { enrichedSchools, stats, recentAlerts, recentActivity, healthSummary };
}

/**
 * POST /api/cron/digest
 * Manually trigger digest evaluation (for testing or manual runs).
 */
export async function POST(request) {
  return handleDigest(request);
}

/**
 * GET /api/cron/digest
 * Main cron entry point. Can be called by Vercel cron, GitHub Actions, etc.
 */
export async function GET(request) {
  // Verify cron secret (skip in dev if not set)
  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev && !verifyAuth(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleDigest(request);
}

async function handleDigest(request) {
  const results = [];
  const now = new Date().toISOString();

  // Iterate all platform admin preferences
  for (const [userId, pref] of platformDigestPrefs.entries()) {
    if (!pref || pref.frequency === "off") continue;
    if (!shouldSendNow(pref.frequency, pref.lastSentAt)) {
      results.push({
        userId,
        frequency: pref.frequency,
        action: "skipped",
        reason: "not_scheduled",
        nextSendAt: pref.nextSendAt,
      });
      continue;
    }

    try {
      // Gather data
      const { enrichedSchools, stats, recentAlerts, recentActivity, healthSummary } =
        await gatherPlatformData(pref.frequency);

      // Find admin user
      const admin = await store.findUserById?.(userId);

      // Build digest
      const digest = buildPlatformDigest({
        frequency: pref.frequency,
        adminName: admin?.name || "Platform Admin",
        stats,
        schools: enrichedSchools,
        recentAlerts,
        recentActivity,
        alertSummary: {
          total: recentAlerts.length,
          unread: 0,
          byType: {},
        },
        healthSummary,
      });

      // Send email if configured
      let emailSent = false;
      if (isEmailConfigured()) {
        try {
          const result = await sendEmail({
            to: admin?.email || process.env.PLATFORM_ADMIN_EMAIL,
            subject: digest.subject,
            text: digest.body,
            html: digest.html,
          });
          emailSent = !!result;
        } catch {
          // Non-fatal
        }
      }

      // Store digest record
      try {
        await store.sendDigest?.({
          schoolId: "platform",
          userId,
          frequency: pref.frequency,
          subject: digest.subject,
          preview: digest.preview,
          body: digest.body,
          itemCount: digest.itemCount,
        });
      } catch {
        // Non-fatal
      }

      // Update preferences with send timestamp
      const nextSendAt = computeNextSendAt(pref.frequency);
      platformDigestPrefs.set(userId, {
        ...pref,
        lastSentAt: now,
        nextSendAt,
        lastItemCount: digest.itemCount,
        lastSubject: digest.subject,
      });

      results.push({
        userId,
        frequency: pref.frequency,
        action: "sent",
        subject: digest.subject,
        itemCount: digest.itemCount,
        emailSent,
        nextSendAt,
      });
    } catch (err) {
      results.push({
        userId,
        frequency: pref.frequency,
        action: "error",
        error: err?.message || "Unknown error",
      });
    }
  }

  return Response.json({
    timestamp: now,
    processed: results.length,
    results,
  });
}
