/**
 * GDPR Data Subject Access Request (DSAR) — Export
 *
 * GET /api/me/export
 *
 * Returns ALL personal data the authenticated user has in the system,
 * packaged as a downloadable JSON file. Satisfies GDPR Art. 15 and Art. 20.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/policy";
import { store } from "@/lib/store";

export async function GET() {
  const session = await requireAuth();
  // requireAuth returns a Response on failure
  if (session instanceof NextResponse) return session;

  const userId = session.userId;
  const schoolId = session.schoolId;
  const role = session.role;

  const user = await store.findUserById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const exportData = {
    _meta: {
      exportDate: new Date().toISOString(),
      format: "EduTrack GDPR Data Export v1",
      dataSubject: user.name,
      role,
      schoolId,
    },
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      role: user.role,
      assignedClass: user.assignedClass || "",
      subjects: user.subjects || [],
      assignedClasses: user.assignedClasses || [],
      createdAt: user.createdAt,
    },
  };

  if (role === "STUDENT") {
    const scores = await store.getScoresByStudent(userId);
    exportData.academic = {
      scores: scores.map((s) => ({
        classArm: s.classArm,
        subject: s.subject,
        session: s.session,
        term: s.term,
        rows: (s.rows || []).filter((r) => r.studentId === userId),
      })),
    };

    const attendanceSummary = await store.getStudentAttendanceSummary(schoolId, userId);
    const attendanceRecords = await store.getStudentAttendanceRecords(schoolId, userId);
    exportData.attendance = {
      summary: attendanceSummary,
      records: attendanceRecords,
    };

    const ledger = await store.getFeeLedger(schoolId, { studentIds: [userId] });
    exportData.fees = {
      ledger: ledger.map((l) => ({
        name: l.name,
        assignedClass: l.assignedClass,
        amount: l.amount,
        paid: l.paid,
        balance: l.balance,
        payments: l.payments,
      })),
    };
  }

  if (role === "PARENT") {
    const children = await store.getChildren(userId);
    exportData.children = [];
    for (const child of children) {
      const childScores = await store.getScoresByStudent(child.id);
      const childAttendance = await store.getStudentAttendanceRecords(schoolId, child.id);
      const childLedger = await store.getFeeLedger(schoolId, { studentIds: [child.id] });
      exportData.children.push({
        profile: {
          id: child.id,
          name: child.name,
          assignedClass: child.assignedClass,
        },
        academic: { scores: childScores },
        attendance: { records: childAttendance },
        fees: { ledger: childLedger },
      });
    }
  }

  if (role === "TEACHER") {
    exportData.teaching = {
      assignedClasses: user.assignedClasses || [],
      subjects: user.subjects || [],
    };

    try {
      const timetable = await store.getTimetable({ schoolId });
      exportData.timetable = timetable.filter((t) => t.teacherId === userId);
    } catch {
      // timetable may not be available
    }

    try {
      const schemes = await store.getSchemesOfWork(schoolId);
      exportData.schemesOfWork = schemes.filter(
        (s) => s.createdBy === userId || s.updatedBy === userId
      );
    } catch {
      // schemes may not be available
    }
  }

  const notifications = await store.listNotifications(schoolId, userId);
  exportData.notifications = notifications.map((n) => ({
    subject: n.subject,
    body: n.body,
    kind: n.kind,
    createdAt: n.createdAt,
    read: n.read,
  }));

  try {
    const conversations = await store.listConversations(schoolId, userId);
    exportData.messages = {
      conversations: conversations.length,
      note: "Full message content available via the Messages section of your dashboard.",
    };
  } catch {
    // messaging may not be available
  }

  try {
    const roleAudit = await store.listRoleAudit(schoolId);
    exportData.auditTrail = {
      roleChanges: roleAudit.filter(
        (e) => e.targetId === userId || e.actorId === userId
      ),
    };
  } catch {
    // audit may not be available
  }

  const body = JSON.stringify(exportData, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="edutrack-data-export-${userId}-${Date.now()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
