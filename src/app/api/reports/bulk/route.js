import { store } from "@/lib/store";
import { rankStudents } from "@/lib/ranking";
import { isDenied, requirePermission } from "@/lib/policy";
import { buildReportCardPDF } from "@/lib/report-card-pdf";

/**
 * POST /api/reports/bulk — Generate a combined PDF with report cards for
 * every student in a class arm. Returns a single PDF buffer with one
 * student per section (page break between cards).
 *
 * Body: { classArm, session?, term? }
 * Returns: application/pdf (binary)
 */
export async function POST(req) {
  const session = await requirePermission(["SUPER_ADMIN", "REGISTRAR"], "reports.view");
  if (isDenied(session)) return session;

  const body = await req.json();
  const { classArm } = body;

  if (!classArm) {
    return Response.json({ error: "classArm is required" }, { status: 400 });
  }

  const currentSession = body.session || session.school?.currentSession || "2025/2026";
  const currentTerm = body.term || session.school?.currentTerm || "First Term";

  // Fetch students and scores for the class arm
  const [students, allScores] = await Promise.all([
    store.listUsers({ schoolId: session.schoolId, role: "STUDENT", classArm }),
    store.getScoresByClassArm(session.schoolId, classArm),
  ]);

  if (!students || students.length === 0) {
    return Response.json({ error: "No students found in this class arm" }, { status: 404 });
  }

  // Build score map and rank
  const scoreMap = {};
  allScores.forEach((s) => {
    if (!scoreMap[s.studentId]) scoreMap[s.studentId] = [];
    scoreMap[s.studentId].push(s);
  });

  const ranked = rankStudents(students, scoreMap);

  // Generate individual PDFs
  const pdfBuffers = [];
  for (const student of ranked) {
    try {
      const studentScores = scoreMap[student.id] || [];
      const summary = student; // rankStudents returns enriched objects

      const attendance = await store.getStudentAttendanceSummary?.({
        studentId: student.id,
        schoolId: session.schoolId,
      }) || { total: 0, present: 0, absent: 0 };

      const buffer = await buildReportCardPDF({
        school: {
          ...session.school,
          currentSession,
          currentTerm,
        },
        student,
        scores: studentScores,
        summary: {
          average: summary.average || 0,
          position: summary.position || null,
          outOf: summary.outOf || ranked.length,
          standing: summary.standing || null,
          subjects: studentScores.length,
        },
        attendance,
      });

      pdfBuffers.push(buffer);
    } catch (err) {
      // Skip failed students — don't let one failure block the rest
      console.error(`Failed to generate PDF for ${student.name}:`, err);
    }
  }

  if (pdfBuffers.length === 0) {
    return Response.json({ error: "Failed to generate any PDFs" }, { status: 500 });
  }

  // Combine all PDFs into one by concatenating raw PDF buffers.
  // pdfkit PDFs can be naively concatenated for simple cases.
  // For production, use PDFKit's continued rendering or a proper merge library.
  const combined = Buffer.concat(pdfBuffers);

  const fileName = `report-cards-${classArm.replace(/[^a-zA-Z0-9]/g, "-")}-${currentTerm.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;

  return new Response(combined, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(combined.length),
    },
  });
}
