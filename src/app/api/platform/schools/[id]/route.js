import { store } from "@/lib/store";
import { invalidateSchoolAuthSnapshots, isDenied, requirePermission } from "@/lib/policy";
import { getFeeLedger } from "@/modules/fees/store";

/**
 * GET /api/platform/schools/[id]
 * Get detailed info for a specific school (platform admin only).
 * Returns school details, users, fee ledger summary, enrollment history,
 * revenue history, and recent audit activity.
 */
export async function GET(req, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  const { id } = await params;
  const school = await store.getSchoolById(id);
  if (!school) {
    return Response.json({ error: "School not found" }, { status: 404 });
  }

  // Get all users for this school
  const users = await store.listUsers({ schoolId: id });

  // Fee ledger summary
  let feeSummary = {
    totalExpected: 0, totalPaid: 0, totalPending: 0, totalBalance: 0,
    studentCount: 0, fullyPaidCount: 0, partialCount: 0, unpaidCount: 0,
  };
  try {
    const ledger = await getFeeLedger(id);
    const studentCount = ledger.length;
    const totalExpected = ledger.reduce((s, e) => s + e.amount, 0);
    const totalPaid = ledger.reduce((s, e) => s + e.paid, 0);
    const totalPending = ledger.reduce((s, e) => s + e.pending, 0);
    const totalBalance = ledger.reduce((s, e) => s + e.balance, 0);
    const fullyPaidCount = ledger.filter((e) => e.feePaid).length;
    const unpaidCount = ledger.filter((e) => !e.feePaid && e.balance > 0).length;
    const partialCount = studentCount - fullyPaidCount - unpaidCount;

    feeSummary = {
      totalExpected, totalPaid, totalPending, totalBalance,
      studentCount, fullyPaidCount, partialCount: Math.max(0, partialCount), unpaidCount,
    };
  } catch {
    // Fee module may not be available in some contexts
  }

  // Recent audit activity for this school
  let recentActivity = [];
  try {
    const { logs } = await store.listAuditLogs({ schoolId: id, limit: 50, offset: 0 });
    recentActivity = logs;
  } catch {
    // Audit module may not be available
  }

  // ── Enrollment History ──
  // Derive monthly enrollment from user creation dates.
  // If all users have the same createdAt (demo mode), generate synthetic
  // growth from 20% → 100% over 6 months ending at "now".
  const enrollmentHistory = buildEnrollmentHistory(users, school);

  // ── Revenue History ──
  // Derive monthly revenue from fee payments.
  // If payments lack varied dates (demo), generate synthetic revenue bars.
  const revenueHistory = buildRevenueHistory(id, feeSummary);

  // ── Revenue Forecast ──
  // Project next 3 months based on historical trends.
  const revenueForecast = buildRevenueForecast(revenueHistory);

  return Response.json({
    school,
    stats: { users, totalUsers: users.length },
    feeSummary,
    recentActivity,
    enrollmentHistory,
    revenueHistory,
    revenueForecast,
  });
}


/**
 * DELETE /api/platform/schools/[id]
 * Delete a school � platform admin only.
 *
 * Body: { action?: "soft" | "purge" }
 *   - "soft" (default): marks the school deleted with a 30-day recovery window
 *   - "purge": permanent wipe (only allowed on already-deleted schools)
 */
export async function DELETE(request, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  const { id } = await params;
  const school = await store.getSchoolById(id);
  if (!school) {
    return Response.json({ error: "School not found" }, { status: 404 });
  }

  // Block deletion of the internal platform school
  if (school.isPlatformSchool) {
    return Response.json({ error: "Cannot delete the platform school" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = body.action === "purge" ? "purge" : "soft";

  // Purge is only allowed on schools already in grace period
  if (action === "purge" && school.status !== "deleted") {
    return Response.json(
      { error: "School must be soft-deleted first before permanent purge" },
      { status: 400 }
    );
  }

  let ok;
  if (action === "purge") {
    ok = await store.purgeSchool(id);
  } else {
    ok = await store.deleteSchool(id);
    if (ok) {
      await invalidateSchoolAuthSnapshots(id);
    }
  }

  if (!ok) {
    return Response.json({ error: "Failed to delete school" }, { status: 500 });
  }

  // Audit log
  try {
    await store.createAuditLog({
      action: action === "purge" ? "school_purged" : "school_deleted",
      actor: "Platform Admin",
      schoolId: school.id,
      schoolName: school.name,
      description: action === "purge"
        ? "Platform admin permanently purged " + school.name
        : "Platform admin deleted " + school.name + " (30-day grace period)",
      meta: { action, triggeredBy: session.userId },
    });
  } catch {
    // Audit log failure is non-blocking
  }

  // Platform alert
  try {
    await store.createPlatformAlert({
      schoolId: school.id,
      schoolName: school.name,
      type: "school_deleted",
      severity: "warning",
      title: action === "purge" ? "School permanently purged" : "School deleted",
      message: action === "purge"
        ? school.name + " was permanently removed by Platform Admin."
        : school.name + " was deleted by Platform Admin (recoverable for 30 days).",
      meta: { action },
    });
  } catch {
    // Alert creation is non-blocking
  }

  return Response.json({ success: true, action });
}

export async function PATCH(request, { params }) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.schools");
  if (isDenied(session)) return session;

  const { id } = await params;
  const school = await store.getSchoolById(id);
  if (!school) {
    return Response.json({ error: "School not found" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.action !== "restore") {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  if (school.status !== "deleted") {
    return Response.json({ error: "School is not deleted" }, { status: 400 });
  }

  const SCHOOL_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
  if (school.deletedAt && Date.now() - new Date(school.deletedAt).getTime() > SCHOOL_DELETION_GRACE_MS) {
    return Response.json({ error: "Grace period has expired" }, { status: 400 });
  }

  const restored = await store.setSchoolStatus(id, "active");
  if (!restored) {
    return Response.json({ error: "Failed to restore school" }, { status: 500 });
  }

  await invalidateSchoolAuthSnapshots(id);

  try {
    await store.createAuditLog({
      action: "school_restored",
      actor: "Platform Admin",
      schoolId: school.id,
      schoolName: school.name,
      description: "Platform admin restored " + school.name + " from deleted status",
      meta: { triggeredBy: session.userId },
    });
  } catch {
    // Non-blocking
  }

  try {
    await store.createPlatformAlert({
      schoolId: school.id,
      schoolName: school.name,
      type: "school_restored",
      severity: "success",
      title: "School restored",
      message: school.name + " was restored by Platform Admin. All logins have resumed.",
      meta: {},
    });
  } catch {
    // Non-blocking
  }

  return Response.json({ success: true, school: restored });
}

/**
/**
 * Build a 3-month revenue forecast using weighted moving average + linear trend.
 * Uses the last 6 months of history to predict the next quarter.
 */
function buildRevenueForecast(revenueHistory) {
  if (!revenueHistory || revenueHistory.length < 3) {
    return { months: [], projectedTotal: 0, method: "insufficient_data", confidence: 0 };
  }

  // Use last 6 months (or all available) for the forecast
  const recent = revenueHistory.slice(-6);
  const values = recent.map((m) => m.collected || 0);
  const n = values.length;

  // --- Weighted Moving Average (recent months weighted more) ---
  // Generate weights dynamically: more recent months get higher weights.
  // For n months, assign weights 1, 2, ..., n (normalized).
  const wmaWeights = values.map((_, i) => i + 1);
  const totalWeight = wmaWeights.reduce((s, w) => s + w, 0);
  const wma = values.reduce((s, v, i) => s + v * wmaWeights[i], 0) / totalWeight;

  // --- Linear Trend (least squares) ---
  const indices = values.map((_, i) => i);
  const meanX = indices.reduce((s, x) => s + x, 0) / n;
  const meanY = values.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (indices[i] - meanX) * (values[i] - meanY);
    den += (indices[i] - meanX) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = meanY - slope * meanX;
  // R² for confidence
  const yMean = meanY;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (values[i] - yMean) ** 2;
    const predicted = intercept + slope * i;
    ssRes += (values[i] - predicted) ** 2;
  }
  const rSquared = ssTot !== 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  // --- Blend WMA (60%) + trend projection (40%) ---
  const now = new Date();
  const forecastMonths = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const trendValue = intercept + slope * (n + i - 1);
    const blended = Math.round(wma * 0.6 + Math.max(0, trendValue) * 0.4);
    // Confidence band: ±15% based on R² (lower R² = wider band)
    const uncertainty = Math.round(blended * (0.25 - rSquared * 0.15));
    forecastMonths.push({
      label, key,
      projected: Math.max(0, blended),
      lower: Math.max(0, blended - uncertainty),
      upper: blended + uncertainty,
      isForecast: true,
    });
  }

  const projectedTotal = forecastMonths.reduce((s, m) => s + m.projected, 0);
  const currentMonthAvg = Math.round(meanY);

  return {
    months: forecastMonths,
    projectedTotal,
    currentMonthAvg,
    slope: Math.round(slope),
    rSquared: Math.round(rSquared * 100),
    method: "wma_trend_blend",
    confidence: Math.round(rSquared * 100),
    trend: slope > 0 ? "growing" : slope < 0 ? "declining" : "stable",
  };
}

/**
 * Build monthly enrollment trend from user creation dates.
 * Returns last 12 months of cumulative student/teacher/total counts.
 */
function buildEnrollmentHistory(users, school) {
  const now = new Date();
  const months = [];

  // Get unique creation dates to check if data is varied
  const creationDates = new Set(users.map((u) => {
    const d = new Date(u.createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }));

  const isVaried = creationDates.size > 1;

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    let students, teachers, parents, total;

    // Users who joined this month (for drill-down)
    let joinedUsers = [];

    if (isVaried) {
      // Real data: count users who existed by end of this month
      const prevMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const created = users.filter((u) => new Date(u.createdAt) <= endOfMonth);
      const prevCreated = users.filter((u) => new Date(u.createdAt) <= prevMonthEnd);
      // New users this month = those in current but not in previous
      const prevIds = new Set(prevCreated.map((u) => u.id));
      joinedUsers = created.filter((u) => !prevIds.has(u.id)).map((u) => ({
        id: u.id, name: u.name, role: u.role, createdAt: u.createdAt,
      }));
      students = created.filter((u) => u.role === "STUDENT").length;
      teachers = created.filter((u) => u.role === "TEACHER").length;
      parents = created.filter((u) => u.role === "PARENT").length;
      total = created.length;
    } else {
      // Synthetic growth for demo: ramp from 20% to 100% over 12 months
      const progress = (12 - i) / 12;
      const curve = Math.min(1, progress * progress * 1.2); // ease-in curve
      const scale = 0.2 + curve * 0.8;

      const totalStudents = users.filter((u) => u.role === "STUDENT").length;
      const totalTeachers = users.filter((u) => u.role === "TEACHER").length;
      const totalParents = users.filter((u) => u.role === "PARENT").length;

      students = Math.max(0, Math.round(totalStudents * scale));
      teachers = Math.max(0, Math.round(totalTeachers * scale));
      parents = Math.max(0, Math.round(totalParents * scale));
      total = students + teachers + parents;

      // Generate synthetic joined users for this month based on deltas
      const prevProgress = Math.min(1, ((12 - i - 1) / 12) * ((12 - i - 1) / 12) * 1.2);
      const prevScale = 0.2 + Math.min(1, prevProgress) * 0.8;
      const prevTotal = Math.round((totalStudents + totalTeachers + totalParents) * prevScale);
      const newCount = Math.max(0, total - prevTotal);
      // Pick users from the full list, distributing by month index as seed
      const allSorted = [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      const startIdx = Math.floor((i / 12) * allSorted.length);
      joinedUsers = allSorted.slice(startIdx, startIdx + newCount).map((u) => ({
        id: u.id, name: u.name, role: u.role, createdAt: u.createdAt,
      }));
    }

    months.push({ label, key, students, teachers, parents, total, joinedUsers });
  }

  return months;
}

/**
 * Build monthly revenue history from fee payments.
 * Returns last 12 months of collected/pending amounts.
 */
function buildRevenueHistory(schoolId, feeSummary) {
  const now = new Date();
  const months = [];

  // Try to read actual fee payments from the store
  let actualPayments = [];
  try {
    // Access the shared state directly for payment history
    const mod = require("@/modules/shared/store-state");
    const feePayments = mod.feePayments || [];
    actualPayments = feePayments.filter((p) => p.schoolId === schoolId);
  } catch {
    // Fall through to synthetic
  }

  // Check if payments have varied dates
  const paymentMonths = new Set(actualPayments.map((p) => {
    const d = new Date(p.createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }));

  const isVaried = paymentMonths.size > 1;

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    let collected, pending, count;

    if (isVaried) {
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const monthPayments = actualPayments.filter((p) => {
        const pd = new Date(p.createdAt);
        return pd <= endOfMonth && p.status !== "PENDING";
      });
      const monthPending = actualPayments.filter((p) => {
        const pd = new Date(p.createdAt);
        return pd <= endOfMonth && p.status === "PENDING";
      });
      collected = monthPayments.reduce((s, p) => s + p.amount, 0);
      pending = monthPending.reduce((s, p) => s + p.amount, 0);
      count = monthPayments.length;
    } else {
      // Synthetic revenue for demo: ramp up over 12 months
      const progress = (12 - i) / 12;
      const curve = Math.min(1, progress * progress * 1.2);
      const scale = 0.1 + curve * 0.9;

      const totalCollected = feeSummary.totalPaid || 0;
      const totalPending = feeSummary.totalPending || 0;

      collected = Math.round(totalCollected * scale);
      pending = Math.round(totalPending * scale * 0.3);
      count = Math.round((feeSummary.fullyPaidCount || 0) * scale);
    }

    months.push({ label, key, collected, pending, count });
  }

  return months;
}
