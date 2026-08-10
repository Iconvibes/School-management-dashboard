import { jsonError } from "@/lib/auth";
import { store } from "@/lib/store";
import { isDenied, requirePermission } from "@/lib/policy";
import { buildAlumniCsv } from "@/lib/alumni-csv";
import { roundAverage, rankClassPosition } from "@/lib/ranking";
import {
  standingFromAverage,
  standingRemark,
  subjectRemark,
} from "@/lib/grading";

/**
 * GET /api/school/archives — read-only viewer over the term archive.
 *
 * A term rollover snapshots the old term's scores + attendance into the
 * archive (then clears the live tables); this route serves them back for the
 * admin dashboard's "Previous Terms" tab, printable through the existing
 * report-card layout (ReportCardModal).
 *
 *   GET /api/school/archives                            → { terms: [...] }
 *     — grouped summary: per term (session, term, scoreCount,
 *       attendanceCount) plus a per-arm breakdown.
 *   GET /api/school/archives?alumni=1                   → { alumni: [...] }
 *     — every archived-roster student who is no longer on the live roster,
 *       with the term they last appeared in (graduated / deleted students).
 *   GET /api/school/archives?alumni=1&format=csv        → the same list as a
 *     downloadable CSV attachment (UTF-8 BOM + RFC-4180 quoting via the
 *     shared buildAlumniCsv helper) — for large lists and scheduled reports
 *     that shouldn't depend on the browser building the file.
 *   GET /api/school/archives?session=&term=&classArm=   → per-student detail:
 *     scores with remarks, attendance summary, the term average, and the
 *     student's class position re-computed from the ARCHIVED cohort (the live
 *     tables have moved on to the current term, so rankings must come from
 *     the snapshot). The `school` in the payload is synthesized with the
 *     ARCHIVED session/term so a printed report card reads the term it
 *     actually belongs to.
 *
 * SUPER_ADMIN + REGISTRAR only (reports.view).
 */
export async function GET(request) {
  const session = await requirePermission(["SUPER_ADMIN", "REGISTRAR"], "reports.view");
  if (isDenied(session)) return session;

  const url = new URL(request.url);
  const sessionName = url.searchParams.get("session");
  const term = url.searchParams.get("term");
  const classArm = url.searchParams.get("classArm");

  // Alumni mode — archived-roster students no longer on the live roster.
  if (url.searchParams.get("alumni") === "1" || url.searchParams.get("alumni") === "true") {
    const alumni = await store.getAlumni(session.schoolId);
    // format=csv: a downloadable attachment (BOM + quoting come from the same
    // tested helper the browser export uses, so both surfaces agree byte for
    // byte). The filename carries the school slug + date, mirroring the
    // client-side export.
    if (url.searchParams.get("format") === "csv") {
      const school = await store.getSchoolById(session.schoolId);
      const slug = (school?.name || "school")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const csv = buildAlumniCsv(alumni);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="alumni-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return Response.json({ alumni });
  }

  // Summary mode — the term list with per-arm counts.
  if (!sessionName || !term) {
    const terms = await store.getTermArchiveTerms(session.schoolId);
    return Response.json({ terms });
  }

  // Detail mode — one archived class arm, joined with student names and
  // rebuilt into report-card payloads.
  const rows = await store.getTermArchiveDetail(session.schoolId, {
    session: sessionName,
    term,
    classArm,
  });
  const students = await store.listUsers({ schoolId: session.schoolId, role: "STUDENT" });
  const rosterRows = rows.filter((r) => r.kind === "student");
  const scoreRows = rows.filter((r) => r.kind === "score");
  const attRows = rows.filter((r) => r.kind === "attendance");

  // Names: the ARCHIVED roster wins (it is a snapshot of who was enrolled and
  // what they were called THAT term — a student who later graduates or is
  // deleted keeps their name on printed cards). Live users fill the gaps for
  // terms archived before the roster snapshot existed.
  const nameById = new Map(students.map((s) => [s.id, s.name]));
  rosterRows.forEach((r) => {
    if (r.studentId && r.studentName) nameById.set(r.studentId, r.studentName);
  });

  // Group scores + attendance by student, seeded with the archived roster so
  // an enrolled student with no scores/attendance that term still appears.
  const byStudent = {};
  rosterRows.forEach((r) => {
    if (r.studentId && !byStudent[r.studentId]) {
      byStudent[r.studentId] = { scores: [], attendance: { total: 0, present: 0, absent: 0 } };
    }
  });
  scoreRows.forEach((s) => {
    if (!byStudent[s.studentId]) {
      byStudent[s.studentId] = { scores: [], attendance: { total: 0, present: 0, absent: 0 } };
    }
    byStudent[s.studentId].scores.push(s);
  });
  attRows.forEach((a) => {
    (a.records || []).forEach((rec) => {
      if (!byStudent[rec.studentId]) {
        byStudent[rec.studentId] = { scores: [], attendance: { total: 0, present: 0, absent: 0 } };
      }
      byStudent[rec.studentId].attendance.total += 1;
      if (rec.present) byStudent[rec.studentId].attendance.present += 1;
      else byStudent[rec.studentId].attendance.absent += 1;
    });
  });

  // Class position from the ARCHIVED cohort only (students present in the
  // snapshot — graduates and deleted accounts still rank where they were).
  const scoreMap = {};
  scoreRows.forEach((s) => {
    if (!scoreMap[s.studentId]) scoreMap[s.studentId] = [];
    scoreMap[s.studentId].push(s);
  });
  const classmates = Object.keys(byStudent).map((id) => ({
    id,
    name: nameById.get(id) || "Former student",
  }));

  const school = await store.getSchoolById(session.schoolId);
  const studentsDetail = Object.entries(byStudent)
    .map(([studentId, data]) => {
      const total = data.scores.reduce((acc, s) => acc + s.totalScore, 0);
      const average = data.scores.length ? total / data.scores.length : 0;
      const standing = standingFromAverage(average);
      const pos = rankClassPosition(studentId, classmates, scoreMap);
      return {
        studentId,
        studentName: nameById.get(studentId) || "Former student",
        classArm: data.scores[0]?.classArm || classArm || "",
        scores: data.scores.map((s) => ({ ...s, remark: subjectRemark(s.grade) })),
        attendance: data.attendance,
        summary: {
          subjects: data.scores.length,
          average: roundAverage(average),
          position: pos.position,
          outOf: pos.outOf,
          standing: {
            label: standing.label,
            color: standing.color,
            remark: standingRemark(standing.label),
          },
        },
      };
    })
    .sort((a, b) => b.summary.average - a.summary.average);

  return Response.json({
    session: sessionName,
    term,
    classArm: classArm || "",
    // Synthesized with the ARCHIVED term so a printed card reads the right
    // session/term even though the school has since moved on.
    school: {
      id: school?.id || "",
      name: school?.name || "",
      brandColor: school?.brandColor || "#2563EB",
      logoUrl: school?.logoUrl || "",
      currentSession: sessionName,
      currentTerm: term,
    },
    students: studentsDetail,
  });
}
