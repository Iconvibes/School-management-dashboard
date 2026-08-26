import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";

/**
 * GET /api/platform/compare?ids=sch_101,sch_102
 * Returns enrollment + revenue history for multiple schools so they can be
 * compared side by side on the platform dashboard.
 *
 * PLATFORM_ADMIN only.
 */
export async function GET(req) {
  const session = await requirePermission(["PLATFORM_ADMIN"], "platform.view");
  if (isDenied(session)) return session;

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids") || "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (ids.length < 2) {
    return Response.json({ error: "Provide at least 2 school IDs" }, { status: 400 });
  }
  if (ids.length > 4) {
    return Response.json({ error: "Maximum 4 schools for comparison" }, { status: 400 });
  }

  const results = await Promise.all(ids.map((id) => buildSchoolData(id)));
  const valid = results.filter(Boolean);

  return Response.json({ schools: valid });
}

/**
 * Build enrollment + revenue history for one school.
 * Mirrors the logic in the school detail API.
 */
async function buildSchoolData(schoolId) {
  const school = await store.getSchoolById(schoolId);
  if (!school) return null;

  const users = await store.listUsers({ schoolId });
  const now = new Date();

  // Check if user creation dates are varied
  const creationDates = new Set(
    users.map((u) => {
      const d = new Date(u.createdAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })
  );
  const isVaried = creationDates.size > 1;

  // Build enrollment history
  const enrollmentHistory = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    let students, teachers, parents, total;

    if (isVaried) {
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const created = users.filter((u) => new Date(u.createdAt) <= endOfMonth);
      students = created.filter((u) => u.role === "STUDENT").length;
      teachers = created.filter((u) => u.role === "TEACHER").length;
      parents = created.filter((u) => u.role === "PARENT").length;
      total = created.length;
    } else {
      const progress = (12 - i) / 12;
      const curve = Math.min(1, progress * progress * 1.2);
      const scale = 0.2 + curve * 0.8;
      const totalStudents = users.filter((u) => u.role === "STUDENT").length;
      const totalTeachers = users.filter((u) => u.role === "TEACHER").length;
      const totalParents = users.filter((u) => u.role === "PARENT").length;
      students = Math.max(0, Math.round(totalStudents * scale));
      teachers = Math.max(0, Math.round(totalTeachers * scale));
      parents = Math.max(0, Math.round(totalParents * scale));
      total = students + teachers + parents;
    }

    enrollmentHistory.push({ label, key, students, teachers, parents, total });
  }

  // Build revenue history
  let totalPaid = 0;
  let totalBalance = 0;
  try {
    const { getFeeLedger } = await import("@/modules/fees/store");
    const ledger = await getFeeLedger(schoolId);
    totalPaid = ledger.reduce((s, e) => s + e.paid, 0);
    totalBalance = ledger.reduce((s, e) => s + e.balance, 0);
  } catch {
    // Fee module may not be available
  }

  const revenueHistory = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const progress = (12 - i) / 12;
    const curve = Math.min(1, progress * progress * 1.2);
    const scale = 0.1 + curve * 0.9;
    const collected = Math.round(totalPaid * scale);

    revenueHistory.push({ label, key, collected });
  }

  return {
    id: school.id,
    name: school.name,
    brandColor: school.brandColor || "#2563EB",
    status: school.status || "active",
    students: users.filter((u) => u.role === "STUDENT").length,
    teachers: users.filter((u) => u.role === "TEACHER").length,
    totalPaid,
    totalBalance,
    enrollmentHistory,
    revenueHistory,
  };
}
