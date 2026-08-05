import { store } from "@/lib/store";
import { computeGrade, standingFromAverage } from "@/lib/grading";
import { buildArmRankings } from "@/lib/ranking";
import { isDenied, requireAuth } from "@/lib/policy";

/**
 * GET /api/parent/children
 * Returns the signed-in parent's linked children, each with a live summary:
 * report averages + position, attendance, and fee balance.
 * Tenant-safe: children are resolved from the parent's own school only.
 */
export async function GET() {
  const session = await requireAuth(["PARENT"]);
  if (isDenied(session)) return session;

  const children = await store.getChildren(session.userId);
  const [school, allScores, students] = await Promise.all([
    store.getSchoolById(session.schoolId),
    store.getScoresBySchool(session.schoolId),
    store.listUsers({ schoolId: session.schoolId, role: "STUDENT" }),
  ]);
  const ledger = await store.getFeeLedger(session.schoolId);

  const scoreMap = {};
  allScores.forEach((s) => {
    if (!scoreMap[s.studentId]) scoreMap[s.studentId] = [];
    scoreMap[s.studentId].push(s);
  });

  const armRankings = buildArmRankings(students, scoreMap);

  const rows = [];
  for (const child of children) {
    const sc = scoreMap[child.id] || [];
    const total = sc.reduce((acc, s) => acc + s.totalScore, 0);
    const average = sc.length ? total / sc.length : 0;
    const standing = standingFromAverage(average);
    const attendance = await store.getStudentAttendanceSummary(session.schoolId, child.id);
    const feeEntry = ledger.find((l) => l.studentId === child.id);

    // Class position within the child's arm — one ranking pass per arm (done
    // above for the whole school), instead of re-ranking per child.
    let position = null;
    let outOf = null;
    if (child.assignedClass) {
      const pos = armRankings[child.assignedClass]?.[child.id];
      position = pos?.position ?? null;
      outOf = pos?.outOf ?? null;
    }

    rows.push({
      id: child.id,
      name: child.name,
      email: child.email,
      assignedClass: child.assignedClass || "",
      subjects: sc.length,
      average: Math.round(average * 100) / 100,
      grade: sc.length ? computeGrade(Math.round(average)) : null,
      standing: standing.label,
      position,
      outOf,
      attendance,
      fee: feeEntry
        ? {
            amount: feeEntry.amount,
            paid: feeEntry.paid,
            pending: feeEntry.pending || 0,
            balance: feeEntry.balance,
            feePaid: feeEntry.feePaid,
          }
        : { amount: 0, paid: 0, pending: 0, balance: 0, feePaid: false },
    });
  }

  return Response.json({
    children: rows,
    school: {
      name: school?.name || "",
      brandColor: school?.brandColor || "#2563EB",
      currentSession: school?.currentSession || "",
      currentTerm: school?.currentTerm || "",
    },
  });
}
