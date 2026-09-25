/**
 * School-wide data export utilities for GDPR compliance.
 *
 * Generates CSV files from school data for admin download.
 * Each dataset is a separate CSV sheet that can be opened in Excel/Google Sheets.
 */

/**
 * Convert an array of objects to CSV string.
 * Handles escaping of values containing commas, quotes, or newlines.
 *
 * @param {Array<Object>} rows — array of objects with consistent keys
 * @param {string[]} columns — column keys to include (in order)
 * @param {Object} [headers] — optional { key: "Header Label" } map
 * @returns {string} CSV content
 */
export function toCSV(rows, columns, headers = {}) {
  if (!rows || rows.length === 0) return "";

  const headerRow = columns.map((col) => escapeCSV(headers[col] || col));
  const dataRows = rows.map((row) =>
    columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return "";
      if (typeof val === "boolean") return val ? "Yes" : "No";
      if (typeof val === "object") return escapeCSV(JSON.stringify(val));
      return escapeCSV(String(val));
    })
  );

  return [headerRow.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
}

/**
 * Escape a CSV value — wrap in quotes if it contains commas, quotes, or newlines.
 */
function escapeCSV(value) {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Build a complete school data export package.
 * Returns an object with CSV strings for each dataset.
 *
 * @param {Object} store — the data store (demo or mongo)
 * @param {string} schoolId
 * @returns {Promise<Object>} { students, teachers, parents, scores, attendance, feeLedger, feePayments, schoolInfo, summary }
 */
export async function buildSchoolExport(store, schoolId) {
  const school = await store.getSchoolById(schoolId);
  if (!school) throw new Error("School not found");

  const allUsers = await store.listUsers({ schoolId });
  const students = allUsers.filter((u) => u.role === "STUDENT");
  const teachers = allUsers.filter((u) => u.role === "TEACHER");
  const parents = allUsers.filter((u) => u.role === "PARENT");
  const admins = allUsers.filter((u) => u.role === "SUPER_ADMIN" || u.role === "BURSAR" || u.role === "REGISTRAR");

  // Scores — use getScoresBySchool if available, else fallback
  const allScores = (typeof store.getScoresBySchool === "function")
    ? await store.getScoresBySchool(schoolId)
    : (typeof store.listScores === "function"
        ? await store.listScores({ schoolId })
        : []);

  // Attendance — get all attendance records for the school
  const allAttendance = (typeof store.getAttendance === "function")
    ? await store.getAttendance(schoolId)
    : (typeof store.listAttendance === "function"
        ? await store.listAttendance({ schoolId })
        : []);

  // Fee ledger
  const feeLedger = (typeof store.getFeeLedger === "function")
    ? await store.getFeeLedger(schoolId)
    : [];

  // Fee payments — access via feeLedger since there's no direct list function
  const feePayments = (typeof store.listFeePayments === "function")
    ? await store.listFeePayments(schoolId)
    : (typeof store.getFeeLedger === "function"
        ? (await store.getFeeLedger(schoolId)).flatMap((l) => l.payments || [])
        : []);

  // Fee structures
  const feeStructures = (typeof store.getFeeStructures === "function")
    ? await store.getFeeStructures(schoolId)
    : [];

  // Timetable
  const timetable = (typeof store.getTimetable === "function")
    ? await store.getTimetable({ schoolId })
    : [];

  // Scheme of work
  const schemes = (typeof store.getSchemesOfWork === "function")
    ? await store.getSchemesOfWork(schoolId)
    : [];

  // ── Build CSV sheets ────────────────────────────────────────────

  const studentsCSV = toCSV(
    students.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email || "",
      classArm: s.assignedClass || "",
      phone: s.phone || "",
      createdAt: s.createdAt || "",
    })),
    ["id", "name", "email", "classArm", "phone", "createdAt"],
    { id: "Student ID", name: "Student Name", email: "Email", classArm: "Class Arm", phone: "Phone", createdAt: "Enrolled Date" }
  );

  const teachersCSV = toCSV(
    teachers.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email || "",
      subjects: Array.isArray(t.assignedClasses) ? t.assignedClasses.join(", ") : (t.assignedClass || ""),
      phone: t.phone || "",
      payrollStatus: t.payrollStatus || "",
      createdAt: t.createdAt || "",
    })),
    ["id", "name", "email", "subjects", "phone", "payrollStatus", "createdAt"],
    { id: "Teacher ID", name: "Teacher Name", email: "Email", subjects: "Class Arms / Subjects", phone: "Phone", payrollStatus: "Payroll Status", createdAt: "Joined Date" }
  );

  const parentsCSV = toCSV(
    parents.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email || "",
      phone: p.phone || "",
      createdAt: p.createdAt || "",
    })),
    ["id", "name", "email", "phone", "createdAt"],
    { id: "Parent ID", name: "Parent Name", email: "Email", phone: "Phone", createdAt: "Joined Date" }
  );

  const scoresCSV = toCSV(
    allScores.map((s) => ({
      studentId: s.studentId || "",
      subject: s.subject || "",
      classArm: s.classArm || "",
      ca1: s.ca1 ?? "",
      ca2: s.ca2 ?? "",
      ca3: s.ca3 ?? "",
      ca4: s.ca4 ?? "",
      caScore: s.caScore ?? "",
      examScore: s.examScore ?? "",
      totalScore: s.totalScore ?? "",
      grade: s.grade || "",
      session: s.session || "",
      term: s.term || "",
    })),
    ["studentId", "subject", "classArm", "ca1", "ca2", "ca3", "ca4", "caScore", "examScore", "totalScore", "grade", "session", "term"],
    { studentId: "Student ID", subject: "Subject", classArm: "Class Arm", ca1: "CA1", ca2: "CA2", ca3: "CA3", ca4: "CA4", caScore: "CA Total", examScore: "Exam", totalScore: "Total", grade: "Grade", session: "Session", term: "Term" }
  );

  const attendanceCSV = toCSV(
    allAttendance.flatMap((a) =>
      (a.records || []).map((r) => ({
        date: a.date || "",
        classArm: a.classArm || "",
        studentId: r.studentId || "",
        present: r.present ? "Present" : "Absent",
        session: a.session || "",
        term: a.term || "",
      }))
    ),
    ["date", "classArm", "studentId", "present", "session", "term"],
    { date: "Date", classArm: "Class Arm", studentId: "Student ID", present: "Status", session: "Session", term: "Term" }
  );

  const feeLedgerCSV = toCSV(
    feeLedger.map((f) => ({
      studentId: f.studentId || "",
      studentName: f.studentName || "",
      classArm: f.classArm || "",
      amount: f.amount ?? "",
      paid: f.paid ?? "",
      balance: f.balance ?? "",
      session: f.session || "",
      term: f.term || "",
    })),
    ["studentId", "studentName", "classArm", "amount", "paid", "balance", "session", "term"],
    { studentId: "Student ID", studentName: "Student Name", classArm: "Class Arm", amount: "Total Billed", paid: "Total Paid", balance: "Balance", session: "Session", term: "Term" }
  );

  const feePaymentsCSV = toCSV(
    feePayments.map((p) => ({
      id: p.id || "",
      studentId: p.studentId || "",
      amount: p.amount ?? "",
      method: p.method || "",
      status: p.status || "",
      receiptNo: p.receiptNo || "",
      note: p.note || "",
      session: p.session || "",
      term: p.term || "",
      createdAt: p.createdAt || "",
    })),
    ["id", "studentId", "amount", "method", "status", "receiptNo", "note", "session", "term", "createdAt"],
    { id: "Payment ID", studentId: "Student ID", amount: "Amount", method: "Method", status: "Status", receiptNo: "Receipt No", note: "Note", session: "Session", term: "Term", createdAt: "Date" }
  );

  const feeStructuresCSV = toCSV(
    feeStructures.map((f) => ({
      classArm: f.classArm || "",
      amount: f.amount ?? "",
      session: f.session || "",
      term: f.term || "",
    })),
    ["classArm", "amount", "session", "term"],
    { classArm: "Class Arm", amount: "Amount", session: "Session", term: "Term" }
  );

  const timetableCSV = toCSV(
    timetable.map((t) => ({
      classArm: t.classArm || "",
      day: t.day || "",
      period: t.period || "",
      subject: t.subject || "",
      teacherId: t.teacherId || "",
      session: t.session || "",
      term: t.term || "",
    })),
    ["classArm", "day", "period", "subject", "teacherId", "session", "term"],
    { classArm: "Class Arm", day: "Day", period: "Period", subject: "Subject", teacherId: "Teacher ID", session: "Session", term: "Term" }
  );

  const schoolInfoJSON = {
    name: school.name,
    id: school.id,
    currentSession: school.currentSession,
    currentTerm: school.currentTerm,
    activeArms: school.activeArms || [],
    status: school.status,
    createdAt: school.createdAt,
    billingPlan: school.billingPlan,
    subscriptionStatus: school.subscriptionStatus,
  };

  const summaryJSON = {
    exportDate: new Date().toISOString(),
    school: school.name,
    totalStudents: students.length,
    totalTeachers: teachers.length,
    totalParents: parents.length,
    totalAdmins: admins.length,
    totalScoreRecords: allScores.length,
    totalAttendanceDays: allAttendance.length,
    totalFeePayments: feePayments.length,
    totalFeeStructures: feeStructures.length,
    totalTimetableSlots: timetable.length,
    totalSchemesOfWork: schemes.length,
  };

  return {
    students: studentsCSV,
    teachers: teachersCSV,
    parents: parentsCSV,
    scores: scoresCSV,
    attendance: attendanceCSV,
    feeLedger: feeLedgerCSV,
    feePayments: feePaymentsCSV,
    feeStructures: feeStructuresCSV,
    timetable: timetableCSV,
    schoolInfo: JSON.stringify(schoolInfoJSON, null, 2),
    summary: JSON.stringify(summaryJSON, null, 2),
  };
}

/**
 * Build a combined CSV export with all data in one file (multi-sheet style).
 * Each dataset is separated by a blank line and a section header.
 *
 * @param {Object} exportData — output from buildSchoolExport
 * @returns {string} combined CSV content
 */
export function buildCombinedCSV(exportData) {
  const sections = [
    { key: "summary", label: "Export Summary" },
    { key: "schoolInfo", label: "School Information" },
    { key: "students", label: "Students" },
    { key: "teachers", label: "Teachers" },
    { key: "parents", label: "Parents" },
    { key: "scores", label: "Scores" },
    { key: "attendance", label: "Attendance" },
    { key: "feeLedger", label: "Fee Ledger" },
    { key: "feePayments", label: "Fee Payments" },
    { key: "feeStructures", label: "Fee Structures" },
    { key: "timetable", label: "Timetable" },
  ];

  const parts = [];
  for (const { key, label } of sections) {
    const data = exportData[key];
    if (!data) continue;
    parts.push(`# ${label}`);
    parts.push(data);
    parts.push("");
  }
  return parts.join("\n");
}
