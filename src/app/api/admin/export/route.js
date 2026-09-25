import { NextResponse } from "next/server.js";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { buildSchoolExport, buildCombinedCSV } from "@/lib/data-export";
import { checkRateLimit } from "@/lib/rate-limit";
import * as log from "@/lib/log";

/**
 * GET /api/admin/export?format=csv|json|individual
 *
 * Exports all school data as a downloadable file.
 * SUPER_ADMIN only.
 *
 * Query params:
 *   format — "csv" (default, combined CSV), "json" (all data as JSON),
 *            "individual" (returns dataset names + sizes for UI selection)
 *   dataset — specific dataset to export (only for format=individual):
 *             students, teachers, parents, scores, attendance,
 *             feeLedger, feePayments, feeStructures, timetable
 */
export async function GET(req) {
  const session = await requirePermission(["SUPER_ADMIN", "BURSAR"], "school.edit");
  if (isDenied(session)) return session;

  // Rate limit: 10 exports per hour
  const rl = checkRateLimit(`export:${session.schoolId}`, 10, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many export requests. Please try again later." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "csv";
  const dataset = searchParams.get("dataset");

  try {
    const exportData = await buildSchoolExport(store, session.schoolId);

    // Individual dataset export
    if (format === "individual" && dataset && exportData[dataset]) {
      const csv = exportData[dataset];
      const school = await store.getSchoolById(session.schoolId);
      const schoolSlug = (school?.name || "school").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const filename = `${schoolSlug}-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;

      log.info("export", `Individual export: ${dataset} for school ${session.schoolId}`);

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Full JSON export
    if (format === "json") {
      const school = await store.getSchoolById(session.schoolId);
      const schoolSlug = (school?.name || "school").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const filename = `${schoolSlug}-full-export-${new Date().toISOString().slice(0, 10)}.json`;

      log.info("export", `Full JSON export for school ${session.schoolId}`);

      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Combined CSV export (default)
    const combinedCSV = buildCombinedCSV(exportData);
    const school = await store.getSchoolById(session.schoolId);
    const schoolSlug = (school?.name || "school").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const filename = `${schoolSlug}-full-export-${new Date().toISOString().slice(0, 10)}.csv`;

    log.info("export", `Full CSV export for school ${session.schoolId}`);

    return new NextResponse(combinedCSV, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    log.error("export", "Export failed:", err);
    return NextResponse.json({ error: "Export failed: " + err.message }, { status: 500 });
  }
}
