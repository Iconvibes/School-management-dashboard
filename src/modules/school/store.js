/**
 * School module — demo store implementation.
 *
 * Functions: createSchoolAndAdmin, searchSchools, listSchoolIds,
 *            getSchoolById, updateSchool, renameArm, rolloverTerm,
 *            listTermArchives, getTermArchiveTerms, getTermArchiveDetail,
 *            getAlumni, deleteSchool, purgeSchool, purgeExpiredDeletedSchools,
 *            setSchoolStatus, getDashboardStats
 */
import { blindEmailIndex } from "@/lib/field-crypto";
import { armAlreadyExists } from "@/lib/arms";
import {
  schools,
  users,
  scores,
  attendance,
  feeStructures,
  feePayments,
  feeCarryovers,
  termArchives,
  notifications,
  feeAudit,
  roleAudit,
  digestPrefs,
  digests,
  timetable,
  classAlertPrefs,
  conflictScans,
  reminderBatches,
  leads,
  nid,
  clone,
  hash,
  nowIso,
  persist,
  publicUser,
  blindEmailIndex,
} from "@/modules/shared/store-state";

// Re-export getFeeLedger from fees module (used in rolloverTerm)
import { getFeeLedger } from "@/modules/fees/store";

const SCHOOL_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const TERM_DISPLAY_ORDER = ["First Term", "Second Term", "Third Term"];

function termRankKey(session, term) {
  const t = TERM_DISPLAY_ORDER.indexOf(term);
  return `${session}::${String(t === -1 ? 99 : t).padStart(2, "0")}`;
}

export async function createSchoolAndAdmin({ schoolName, adminName, email, password }) {
  const school = {
    id: nid("sch"),
    name: schoolName,
    logoUrl: "",
    sealUrl: "",
    brandColor: "#2563EB",
    notificationRetentionDays: 90,
    reconcileDeletedReminders: false,
    status: "active",
    activeArms: [],
    currentSession: "2025/2026",
    currentTerm: "First Term",
    onboardingComplete: false,
    reminderTemplates: {},
    createdAt: nowIso(),
  };
  schools.push(school);
  const user = {
    id: nid("usr"),
    name: adminName,
    email: email.toLowerCase(),
    emailIdx: blindEmailIndex(email),
    password: hash(password),
    role: "SUPER_ADMIN",
    schoolId: school.id,
    assignedClass: "",
    payrollStatus: "PAID",
    feePaid: false,
    parentId: null,
    phone: "",
    phoneIdx: "",
    address: "",
    createdAt: nowIso(),
  };
  users.push(user);
  persist();
  return { school, user: publicUser(user) };
}

export async function searchSchools(search, limit = 8) {
  const q = (search || "").toLowerCase().trim();
  return schools
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      name: s.name,
      logoUrl: s.logoUrl || "",
      sealUrl: s.sealUrl || "",
      brandColor: s.brandColor || "#2563EB",
      status: s.status || "active",
    }));
}

export async function listSchoolIds() {
  return schools.map((s) => s.id);
}

export async function getSchoolById(id) {
  return clone(schools.find((s) => s.id === id));
}

export async function updateSchool(id, patch) {
  const school = schools.find((s) => s.id === id);
  if (!school) return null;
  const allowed = [
    "name", "logoUrl", "sealUrl", "brandColor", "activeArms",
    "currentSession", "currentTerm", "onboardingComplete", "periodTimes",
    "breakTimes", "dailySchedules", "reminderTemplates",
    "notificationRetentionDays", "reconcileDeletedReminders",
  ];
  allowed.forEach((k) => {
    if (patch[k] !== undefined) school[k] = patch[k];
  });
  persist();
  return clone(school);
}

/**
 * Rename a class arm across EVERY reference in one atomic pass.
 */
export async function renameArm(schoolId, from, to) {
  const school = schools.find((s) => s.id === schoolId);
  if (!school) return null;
  const source = String(from || "").trim();
  const target = String(to || "").trim();
  if (!source) return { error: "The arm to rename is required" };
  if (!target) return { error: "The new arm name is required" };
  if (!school.activeArms.includes(source)) {
    return { error: `"${source}" is not one of the school's class arms` };
  }
  if (armAlreadyExists(school.activeArms, target)) {
    return { error: `"${target}" is already a class arm` };
  }
  if (source.toLowerCase() === target.toLowerCase()) {
    return { error: "The new name must differ from the current one" };
  }

  const counts = { students: 0, teachers: 0, feeStructures: 0, scores: 0, attendance: 0, timetable: 0 };
  school.activeArms = school.activeArms.map((a) => (a === source ? target : a));

  users.forEach((u) => {
    if (u.schoolId !== schoolId) return;
    const inClasses = Array.isArray(u.assignedClasses) && u.assignedClasses.includes(source);
    if (u.assignedClass === source || inClasses) {
      if (u.role === "STUDENT") counts.students += 1;
      else if (u.role === "TEACHER") counts.teachers += 1;
    }
    if (u.assignedClass === source) u.assignedClass = target;
    if (inClasses) u.assignedClasses = u.assignedClasses.map((a) => (a === source ? target : a));
  });
  feeStructures.forEach((f) => {
    if (f.schoolId === schoolId && f.classArm === source) { f.classArm = target; counts.feeStructures += 1; }
  });
  scores.forEach((s) => {
    if (s.schoolId === schoolId && s.classArm === source) { s.classArm = target; counts.scores += 1; }
  });
  attendance.forEach((a) => {
    if (a.schoolId === schoolId && a.classArm === source) { a.classArm = target; counts.attendance += 1; }
  });
  timetable.forEach((t) => {
    if (t.schoolId === schoolId && t.classArm === source) { t.classArm = target; counts.timetable += 1; }
  });

  persist();
  return { school: clone(school), counts };
}

/**
 * Move the school to a new term (term rollover) — archives old scores/attendance,
 * clones fee structures forward, resets billing state, carries unpaid balances.
 */
export async function rolloverTerm(schoolId, { newTerm, newSession, dryRun = false }) {
  const school = schools.find((s) => s.id === schoolId);
  if (!school) return null;
  const term = String(newTerm || "").trim();
  const session = String(newSession || "").trim() || school.currentSession || "2025/2026";
  if (!term) return { error: "The new term is required" };
  if (term === school.currentTerm && session === school.currentSession) {
    return { error: `The school is already on ${session} · ${term}` };
  }

  const oldSession = school.currentSession || "2025/2026";
  const oldTerm = school.currentTerm || "First Term";
  const oldStructures = feeStructures.filter(
    (f) => f.schoolId === schoolId && f.session === oldSession && f.term === oldTerm
  );
  const scoreRows = scores.filter((s) => s.schoolId === schoolId);
  const attendanceRows = attendance.filter(
    (a) => a.schoolId === schoolId && a.session === oldSession && a.term === oldTerm
  );
  const ttEntries = timetable.filter((t) => t.schoolId === schoolId);
  const students = users.filter((u) => u.schoolId === schoolId && u.role === "STUDENT");

  const oldLedger = await getFeeLedger(schoolId);
  const carriedBalances = new Map(
    oldLedger.filter((l) => l.balance > 0).map((l) => [l.studentId, l.balance])
  );

  const counts = {
    scoresArchived: scoreRows.length,
    attendanceArchived: attendanceRows.length,
    feesCloned: oldStructures.length,
    timetableCloned: ttEntries.length,
    studentsReset: students.length,
    carryovers: carriedBalances.size,
  };
  if (dryRun) return { school: clone(school), counts };

  // 1. Archive old term
  students.forEach((u) => {
    termArchives.push({
      id: nid("tar"), schoolId, session: oldSession, term: oldTerm,
      kind: "student", classArm: u.assignedClass || "", studentId: u.id, studentName: u.name,
    });
  });
  scoreRows.forEach((s) => {
    termArchives.push({
      id: nid("tar"), schoolId, session: oldSession, term: oldTerm,
      kind: "score", classArm: s.classArm, studentId: s.studentId, subject: s.subject,
      caScore: s.caScore, examScore: s.examScore, totalScore: s.totalScore, grade: s.grade,
    });
  });
  attendanceRows.forEach((a) => {
    termArchives.push({
      id: nid("tar"), schoolId, session: oldSession, term: oldTerm,
      kind: "attendance", classArm: a.classArm, date: a.date,
      records: a.records.map((r) => ({ ...r })),
    });
  });
  const keptScores = scores.filter((s) => s.schoolId !== schoolId);
  scores.length = 0;
  scores.push(...keptScores);
  const keptAttendance = attendance.filter(
    (a) => !(a.schoolId === schoolId && a.session === oldSession && a.term === oldTerm)
  );
  attendance.length = 0;
  attendance.push(...keptAttendance);

  // 2. Clone fee structures forward
  oldStructures.forEach((f) => {
    let structure = feeStructures.find(
      (x) => x.schoolId === schoolId && x.classArm === f.classArm && x.session === session && x.term === term
    );
    if (!structure) {
      structure = { id: nid("fst"), schoolId, classArm: f.classArm, session, term, createdAt: nowIso() };
      feeStructures.push(structure);
    }
    structure.amount = f.amount;
  });

  // 3. Re-stamp timetable grid
  ttEntries.forEach((t) => { t.session = session; t.term = term; });

  // 4. Move school forward
  school.currentSession = session;
  school.currentTerm = term;
  students.forEach((u) => { u.feePaid = false; });

  // 5. Carry unpaid balances
  const carried = [];
  for (const [studentId, amount] of carriedBalances) {
    feeCarryovers.push({
      id: nid("fco"), schoolId, studentId, session, term, amount,
      fromSession: oldSession, fromTerm: oldTerm, createdAt: nowIso(),
    });
    carried.push({ studentId, amount });
  }

  persist();
  return { school: clone(school), counts, carryovers: carried };
}

export async function listTermArchives(schoolId, { session, term, kind } = {}) {
  return termArchives
    .filter((a) => a.schoolId === schoolId)
    .filter((a) => (session ? a.session === session : true))
    .filter((a) => (term ? a.term === term : true))
    .filter((a) => (kind ? a.kind === kind : true))
    .map(clone);
}

export async function getTermArchiveTerms(schoolId) {
  const groups = {};
  termArchives
    .filter((a) => a.schoolId === schoolId)
    .forEach((a) => {
      const key = `${a.session}||${a.term}`;
      if (!groups[key]) {
        groups[key] = { session: a.session, term: a.term, scoreCount: 0, attendanceCount: 0, students: 0, arms: {} };
      }
      const g = groups[key];
      if (a.kind === "score") g.scoreCount += 1;
      else if (a.kind === "attendance") g.attendanceCount += 1;
      else if (a.kind === "student") g.students += 1;
      if (!g.arms[a.classArm]) {
        g.arms[a.classArm] = { classArm: a.classArm, scoreCount: 0, attendanceCount: 0, students: 0 };
      }
      if (a.kind === "score") g.arms[a.classArm].scoreCount += 1;
      else if (a.kind === "attendance") g.arms[a.classArm].attendanceCount += 1;
      else if (a.kind === "student") g.arms[a.classArm].students += 1;
    });
  return Object.values(groups)
    .sort((x, y) => {
      const tx = TERM_DISPLAY_ORDER.indexOf(x.term);
      const ty = TERM_DISPLAY_ORDER.indexOf(y.term);
      if (tx !== ty) return tx - ty;
      return String(x.session).localeCompare(String(y.session));
    })
    .map((g) => ({
      session: g.session, term: g.term, scoreCount: g.scoreCount,
      attendanceCount: g.attendanceCount, students: g.students,
      arms: Object.values(g.arms).sort((a, b) => a.classArm.localeCompare(b.classArm)),
    }));
}

export async function getTermArchiveDetail(schoolId, { session, term, classArm } = {}) {
  return termArchives
    .filter((a) => a.schoolId === schoolId)
    .filter((a) => (session ? a.session === session : true))
    .filter((a) => (term ? a.term === term : true))
    .filter((a) => (classArm ? a.classArm === classArm : true))
    .map(clone);
}

export async function getAlumni(schoolId) {
  const liveIds = new Set(
    users.filter((u) => u.schoolId === schoolId && u.role === "STUDENT").map((u) => u.id)
  );
  const lastByStudent = {};
  termArchives
    .filter((a) => a.schoolId === schoolId && a.kind === "student")
    .forEach((a) => {
      const prev = lastByStudent[a.studentId];
      if (!prev || termRankKey(a.session, a.term) > termRankKey(prev.lastSession, prev.lastTerm)) {
        lastByStudent[a.studentId] = {
          studentName: a.studentName, classArm: a.classArm,
          lastSession: a.session, lastTerm: a.term,
        };
      }
    });
  return Object.entries(lastByStudent)
    .filter(([studentId]) => !liveIds.has(studentId))
    .map(([studentId, last]) => ({
      studentId, studentName: last.studentName, classArm: last.classArm,
      lastSession: last.lastSession, lastTerm: last.lastTerm,
    }))
    .sort((x, y) => x.studentName.localeCompare(y.studentName));
}

export async function deleteSchool(schoolId) {
  const school = schools.find((s) => s.id === schoolId);
  if (!school) return false;
  school.status = "deleted";
  school.deletedAt = nowIso();
  persist();
  return true;
}

export async function purgeSchool(schoolId) {
  const idx = schools.findIndex((s) => s.id === schoolId);
  if (idx === -1) return false;
  schools.splice(idx, 1);
  const drop = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].schoolId === schoolId) arr.splice(i, 1);
    }
  };
  [users, scores, feeStructures, feePayments, feeCarryovers, reminderBatches,
   attendance, notifications, feeAudit, roleAudit, digestPrefs, digests,
   timetable, classAlertPrefs, conflictScans, termArchives].forEach(drop);
  persist();
  return true;
}

export async function purgeExpiredDeletedSchools({ now = Date.now(), graceMs = SCHOOL_DELETION_GRACE_MS } = {}) {
  const expired = schools.filter(
    (s) => s.status === "deleted" && s.deletedAt && Date.parse(s.deletedAt) + graceMs <= now
  );
  for (const s of expired) {
    await purgeSchool(s.id);
  }
  return expired.length;
}

export async function setSchoolStatus(schoolId, status) {
  const school = schools.find((s) => s.id === schoolId);
  if (!school) return null;
  school.status = status === "frozen" ? "frozen" : "active";
  if (school.status === "active") school.deletedAt = null;
  persist();
  return clone(school);
}

export async function getDashboardStats(schoolId) {
  const school = schools.find((s) => s.id === schoolId);
  if (!school) return null;

  const schoolStudents = users.filter((u) => u.schoolId === schoolId && u.role === "STUDENT");
  const schoolTeachers = users.filter((u) => u.schoolId === schoolId && u.role === "TEACHER");
  const schoolParents = users.filter((u) => u.schoolId === schoolId && u.role === "PARENT");

  const today = new Date().toISOString().split("T")[0];
  const todayAttendance = attendance.filter(
    (a) => a.schoolId === schoolId && a.date === today
  );
  const presentToday = todayAttendance.reduce(
    (sum, a) => sum + a.records.filter((r) => r.present).length, 0
  );

  // Fee stats for current term
  const currentSession = school.currentSession || "2025/2026";
  const currentTerm = school.currentTerm || "First Term";
  const termPayments = feePayments.filter(
    (p) => p.schoolId === schoolId && p.session === currentSession && p.term === currentTerm && p.status !== "PENDING"
  );
  const totalCollected = termPayments.reduce((sum, p) => sum + p.amount, 0);

  // Recent notifications
  const recentNotifications = notifications
    .filter((n) => n.schoolId === schoolId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  // Conflict scan
  const conflictScan = conflictScans.find((c) => c.schoolId === schoolId);

  return {
    totalStudents: schoolStudents.length,
    totalTeachers: schoolTeachers.length,
    totalParents: schoolParents.length,
    attendanceToday: {
      present: presentToday,
      total: todayAttendance.reduce((sum, a) => sum + a.records.length, 0),
      rate: todayAttendance.reduce((sum, a) => sum + a.records.length, 0) > 0
        ? Math.round((presentToday / todayAttendance.reduce((sum, a) => sum + a.records.length, 0)) * 100)
        : 0,
    },
    feeCollection: {
      total: totalCollected,
      collected: totalCollected,
      outstanding: 0,
    },
    recentNotifications,
    conflictScan: conflictScan ? {
      lastRunAt: conflictScan.lastRunAt,
      conflictCount: (conflictScan.conflicts?.teacher?.length || 0) + (conflictScan.conflicts?.arm?.length || 0),
    } : null,
  };
}

// ── Marketing Leads ─────────────────────────────────────────────────

export async function createLead({ kind, name = "", school = "", email, phone = "", size = "", interest = "", message = "", ip = "", userAgent = "" }) {
  const existing = leads.find((l) => l.kind === kind && l.emailIdx === blindEmailIndex(email));
  if (existing) return null;
  const lead = { id: nid("lea"), kind, name, school, email: email.toLowerCase(), emailIdx: blindEmailIndex(email), phone, size, interest, message, ip, userAgent, createdAt: nowIso(), updatedAt: nowIso() };
  leads.push(lead); persist(); return clone(lead);
}

export async function listLeads(kind) {
  return leads.filter((l) => (kind ? l.kind === kind : true))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((l) => { const { emailIdx, ...safe } = l; return safe; });
}
