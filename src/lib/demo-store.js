import bcrypt from "bcryptjs";

/**
 * In-memory store used when MONGODB_URI is not set (demo mode).
 * Mirrors the shape returned by the Mongoose store so API routes are identical.
 */

let seq = 100;
const nid = (prefix) => `${prefix}_${++seq}`;

const schools = [];
const users = [];
const scores = [];
const feeStructures = [];
const feePayments = [];
const attendance = [];
const leads = [];
let receiptSeq = 1000;

const hash = (pw) => bcrypt.hashSync(pw, 10);

const nowIso = () => new Date().toISOString();

// ---- Seed data -------------------------------------------------------------

function seed() {
  const school = {
    id: nid("sch"),
    name: "Greenfield International School",
    logoUrl: "",
    brandColor: "#2563EB",
    activeArms: [
      "SS1 Science",
      "SS1 Arts",
      "SS2 Science",
      "SS2 Arts",
      "SS3 Science",
      "SS3 Arts",
    ],
    currentSession: "2025/2026",
    currentTerm: "First Term",
    createdAt: nowIso(),
  };
  schools.push(school);

  const addUser = (
    name,
    email,
    password,
    role,
    assignedClass = "",
    extra = {}
  ) => {
    const u = {
      id: nid("usr"),
      name,
      email,
      password: hash(password),
      role,
      schoolId: school.id,
      assignedClass,
      payrollStatus: "PENDING",
      feePaid: false,
      parentId: null,
      phone: "",
      address: "",
      createdAt: nowIso(),
      ...extra,
    };
    users.push(u);
    return u;
  };

  const admin = addUser(
    "Super Admin",
    "admin@edutrack.app",
    "admin123",
    "SUPER_ADMIN",
    "",
    { payrollStatus: "PAID" }
  );

  const teachers = [
    addUser("Mrs. Adaeze Okafor", "a.okafor@edutrack.app", "teacher123", "TEACHER", "SS1 Science", { payrollStatus: "PAID" }),
    addUser("Mr. Tunde Bakare", "t.bakare@edutrack.app", "teacher123", "TEACHER", "SS1 Arts", { payrollStatus: "PENDING" }),
    addUser("Dr. Ifeoma Nwosu", "i.nwosu@edutrack.app", "teacher123", "TEACHER", "SS2 Science", { payrollStatus: "PAID" }),
    addUser("Mr. Emeka Obi", "e.obi@edutrack.app", "teacher123", "TEACHER", "SS2 Arts", { payrollStatus: "PENDING" }),
    addUser("Ms. Sarah Adeyemi", "s.adeyemi@edutrack.app", "teacher123", "TEACHER", "SS3 Science", { payrollStatus: "PENDING" }),
  ];

  const studentSeeds = [
    ["Kunle Adebayo", "k.adebayo@edutrack.app", "SS1 Science"],
    ["Chidinma Obi", "c.obi@edutrack.app", "SS1 Science"],
    ["Emeka Nwosu", "e.nwosu@edutrack.app", "SS1 Science"],
    ["Fatima Bello", "f.bello@edutrack.app", "SS1 Science"],
    ["Ibrahim Musa", "i.musa@edutrack.app", "SS1 Arts"],
    ["Sarah Johnson", "s.johnson@edutrack.app", "SS1 Arts"],
    ["Tobi Alade", "t.alade@edutrack.app", "SS1 Arts"],
    ["Grace Uche", "g.uche@edutrack.app", "SS2 Science"],
    ["David Osei", "d.osei@edutrack.app", "SS2 Science"],
    ["Hannah Kalu", "h.kalu@edutrack.app", "SS3 Arts"],
  ];

  const students = studentSeeds.map(([name, email, arm], i) =>
    addUser(name, email, "student123", "STUDENT", arm, {
      feePaid: i % 3 !== 0,
    })
  );

  // Seed one parent account linked to two children (demo)
  const parent = addUser(
    "Mrs. Folake Adebayo",
    "p.adebayo@edutrack.app",
    "parent123",
    "PARENT",
    "",
    { phone: "0803 123 4567", address: "12 Ikoyi Crescent, Lagos" }
  );
  students[0].parentId = parent.id; // Kunle Adebayo
  students[1].parentId = parent.id; // Chidinma Obi

  // ---- Seed fee structures + payments (demo) ----
  const feeByArm = {
    "SS1 Science": 185000,
    "SS1 Arts": 170000,
    "SS2 Science": 185000,
    "SS2 Arts": 170000,
    "SS3 Science": 190000,
    "SS3 Arts": 175000,
  };
  Object.entries(feeByArm).forEach(([classArm, amount]) => {
    feeStructures.push({
      id: nid("fst"),
      schoolId: school.id,
      classArm,
      amount,
      session: "2025/2026",
      term: "First Term",
      createdAt: nowIso(),
    });
  });
  students.forEach((student, i) => {
    const amount = feeByArm[student.assignedClass] || 150000;
    const paidFull = i % 3 !== 0;
    const paid = paidFull ? amount : Math.round(amount * 0.4);
    if (paid > 0) {
      feePayments.push({
        id: nid("fpay"),
        schoolId: school.id,
        studentId: student.id,
        amount: paid,
        method: "TRANSFER",
        receiptNo: `RCT-${++receiptSeq}`,
        session: "2025/2026",
        term: "First Term",
        note: paidFull ? "Full term fee" : "Part payment",
        createdAt: nowIso(),
      });
      // sync the legacy boolean so the rest of the UI stays consistent
      student.feePaid = paidFull;
    }
  });

  // ---- Seed attendance (demo): last 20 school days, ~85% presence ----
  const SCHOOL_DAYS = 20;
  for (let d = SCHOOL_DAYS; d >= 1; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    ["SS1 Science", "SS1 Arts", "SS2 Science", "SS2 Arts", "SS3 Science", "SS3 Arts"].forEach((arm) => {
      const armStudents = students.filter((s) => s.assignedClass === arm);
      if (armStudents.length === 0) return;
      attendance.push({
        id: nid("att"),
        schoolId: school.id,
        classArm: arm,
        date,
        session: "2025/2026",
        term: "First Term",
        records: armStudents.map((s, i) => ({
          studentId: s.id,
          present: (i + d) % 9 !== 0, // ~11% absence
        })),
        createdAt: nowIso(),
      });
    });
  }

  // Deterministic-ish score seeds so every dashboard has content
  const subjectSets = {
    "SS1 Science": [
      ["Mathematics", 34, 52],
      ["Physics", 30, 44],
      ["Chemistry", 28, 40],
      ["Biology", 36, 50],
      ["English Language", 32, 47],
    ],
    "SS1 Arts": [
      ["Literature in English", 33, 48],
      ["Government", 31, 45],
      ["Economics", 29, 42],
      ["English Language", 35, 51],
    ],
    "SS2 Science": [
      ["Mathematics", 26, 38],
      ["Physics", 24, 35],
      ["Chemistry", 27, 41],
      ["Further Mathematics", 22, 33],
    ],
    "SS3 Arts": [
      ["Literature in English", 30, 44],
      ["Government", 28, 39],
      ["Economics", 26, 37],
    ],
  };

  const offsets = [0, 3, -4, 2, -2, 5, -6, 1, -3, 4];

  students.forEach((student, i) => {
    const sets = subjectSets[student.assignedClass] || [];
    sets.forEach(([subject, ca, exam]) => {
      const off = offsets[i % offsets.length];
      const caScore = Math.min(40, Math.max(5, ca + off));
      const examScore = Math.min(60, Math.max(10, exam - off));
      const totalScore = caScore + examScore;
      const grade = totalScore >= 70 ? "A" : totalScore >= 60 ? "B" : totalScore >= 50 ? "C" : totalScore >= 40 ? "D" : "F";
      scores.push({
        id: nid("scr"),
        studentId: student.id,
        schoolId: school.id,
        subject,
        classArm: student.assignedClass,
        caScore,
        examScore,
        totalScore,
        grade,
        createdAt: nowIso(),
      });
    });
  });

  return { admin, teachers, students };
}

seed();

// ---- Helpers ---------------------------------------------------------------

const clone = (obj) => (obj ? { ...obj } : obj);

// ---- Store API -------------------------------------------------------------

export async function createSchoolAndAdmin({ schoolName, adminName, email, password }) {
  const school = {
    id: nid("sch"),
    name: schoolName,
    logoUrl: "",
    brandColor: "#2563EB",
    activeArms: [],
    currentSession: "2025/2026",
    currentTerm: "First Term",
    createdAt: nowIso(),
  };
  schools.push(school);
  const user = {
    id: nid("usr"),
    name: adminName,
    email: email.toLowerCase(),
    password: hash(password),
    role: "SUPER_ADMIN",
    schoolId: school.id,
    assignedClass: "",
    payrollStatus: "PAID",
    feePaid: false,
    parentId: null,
    phone: "",
    address: "",
    createdAt: nowIso(),
  };
  users.push(user);
  return { school, user };
}

export async function findUserByEmail(email) {
  return clone(users.find((u) => u.email === email.toLowerCase()));
}

export async function findUserByEmailInSchool(schoolId, email) {
  return clone(
    users.find(
      (u) => u.schoolId === schoolId && u.email === email.toLowerCase()
    )
  );
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
      brandColor: s.brandColor || "#2563EB",
    }));
}

export async function findUserById(id) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  // Strip the password hash for parity with the Mongo store (findUserByEmail
  // is the only path that intentionally returns it, for login verification)
  const { password, ...safe } = user;
  return safe;
}

export async function getSchoolById(id) {
  return clone(schools.find((s) => s.id === id));
}

export async function updateSchool(id, patch) {
  const school = schools.find((s) => s.id === id);
  if (!school) return null;
  const allowed = ["name", "logoUrl", "brandColor", "activeArms", "currentSession", "currentTerm"];
  allowed.forEach((k) => {
    if (patch[k] !== undefined) school[k] = patch[k];
  });
  return clone(school);
}

export async function listUsers({ schoolId, role, classArm }) {
  return users
    .filter((u) => u.schoolId === schoolId)
    .filter((u) => (role ? u.role === role : true))
    .filter((u) => (classArm ? u.assignedClass === classArm : true))
    .map(clone);
}

export async function createUser({ schoolId, name, email, password, role, assignedClass = "", phone = "" }) {
  const user = {
    id: nid("usr"),
    name,
    email: email.toLowerCase(),
    password: hash(password),
    role,
    schoolId,
    assignedClass,
    payrollStatus: role === "TEACHER" ? "PENDING" : "PAID",
    feePaid: false,
    parentId: null,
    phone,
    address: "",
    createdAt: nowIso(),
  };
  users.push(user);
  return clone(user);
}

export async function updateUser(id, patch) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  const allowed = ["name", "assignedClass", "payrollStatus", "feePaid", "parentId", "phone", "address"];
  allowed.forEach((k) => {
    if (patch[k] !== undefined) user[k] = patch[k];
  });
  return clone(user);
}

/** List a parent's linked children (tenant-scoped to the parent's school). */
export async function getChildren(parentId) {
  const parent = users.find((u) => u.id === parentId);
  if (!parent) return [];
  return users
    .filter((u) => u.schoolId === parent.schoolId && u.parentId === parentId)
    .map((u) => {
      // Strip password hash for parity with the Mongo store
      const { password, ...safe } = u;
      return safe;
    });
}

export async function deleteUser(id) {
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  users.splice(idx, 1);
  return true;
}

export async function saveScores({ schoolId, classArm, subject, rows }) {
  const saved = [];
  for (const row of rows) {
    const caScore = Math.min(40, Math.max(0, Number(row.caScore) || 0));
    const examScore = Math.min(60, Math.max(0, Number(row.examScore) || 0));
    const totalScore = caScore + examScore;
    const grade = totalScore >= 70 ? "A" : totalScore >= 60 ? "B" : totalScore >= 50 ? "C" : totalScore >= 40 ? "D" : "F";
    let score = scores.find(
      (s) => s.studentId === row.studentId && s.subject === subject && s.classArm === classArm
    );
    if (!score) {
      score = {
        id: nid("scr"),
        studentId: row.studentId,
        schoolId,
        subject,
        classArm,
        createdAt: nowIso(),
      };
      scores.push(score);
    }
    score.caScore = caScore;
    score.examScore = examScore;
    score.totalScore = totalScore;
    score.grade = grade;
    saved.push(clone(score));
  }
  return saved;
}

export async function getScoresByClassSubject({ schoolId, classArm, subject }) {
  return scores
    .filter((s) => s.schoolId === schoolId && s.classArm === classArm && s.subject === subject)
    .map(clone);
}

export async function getScoresByStudent(studentId) {
  return scores.filter((s) => s.studentId === studentId).map(clone);
}

export async function getScoresBySchool(schoolId) {
  return scores.filter((s) => s.schoolId === schoolId).map(clone);
}

export async function getDashboardStats(schoolId) {
  const schoolUsers = users.filter((u) => u.schoolId === schoolId);
  const students = schoolUsers.filter((u) => u.role === "STUDENT");
  const teachers = schoolUsers.filter((u) => u.role === "TEACHER");
  const paidTeachers = teachers.filter((t) => t.payrollStatus === "PAID");
  const feePaid = students.filter((s) => s.feePaid);
  const schoolScores = scores.filter((s) => s.schoolId === schoolId);

  const byArm = {};
  students.forEach((s) => {
    byArm[s.assignedClass] = (byArm[s.assignedClass] || 0) + 1;
  });

  // Fee amounts — only CONFIRMED payments count as collected.
  const schoolPayments = feePayments.filter((p) => p.schoolId === schoolId);
  const totalBilled = feeStructures
    .filter((f) => f.schoolId === schoolId)
    .reduce((acc, f) => acc + f.amount * (byArm[f.classArm] || 0), 0);
  const totalCollected = schoolPayments
    .filter((p) => p.status !== "PENDING")
    .reduce((acc, p) => acc + p.amount, 0);
  const pendingPayments = schoolPayments.filter((p) => p.status === "PENDING");

  return {
    totalStudents: students.length,
    activeTeachers: teachers.length,
    payrollPaid: paidTeachers.length,
    payrollPending: teachers.length - paidTeachers.length,
    feeCollected: feePaid.length,
    feeRate: students.length ? Math.round((feePaid.length / students.length) * 100) : 0,
    feeCollectedAmount: totalCollected,
    feeOutstandingAmount: Math.max(0, totalBilled - totalCollected),
    pendingPayments: {
      count: pendingPayments.length,
      amount: pendingPayments.reduce((acc, p) => acc + p.amount, 0),
    },
    classDistribution: byArm,
    totalScoreRecords: schoolScores.length,
  };
}

// ---- Fees -------------------------------------------------------------------

export async function getFeeStructures(schoolId) {
  return feeStructures
    .filter((f) => f.schoolId === schoolId)
    .sort((a, b) => a.classArm.localeCompare(b.classArm))
    .map(clone);
}

export async function saveFeeStructure(schoolId, { classArm, amount, session, term }) {
  let structure = feeStructures.find(
    (f) =>
      f.schoolId === schoolId &&
      f.classArm === classArm &&
      f.session === session &&
      f.term === term
  );
  if (!structure) {
    structure = {
      id: nid("fst"),
      schoolId,
      classArm,
      session,
      term,
      createdAt: nowIso(),
    };
    feeStructures.push(structure);
  }
  structure.amount = Math.max(0, Number(amount) || 0);
  return clone(structure);
}

/** Full fee ledger for a school: per-student billed / paid / balance.
 *  Only CONFIRMED payments count toward paid/balance; PENDING payments are
 *  reported separately so a parent's unconfirmed payment never clears a
 *  student's balance. */
export async function getFeeLedger(schoolId) {
  const students = users.filter((u) => u.schoolId === schoolId && u.role === "STUDENT");
  const school = schools.find((s) => s.id === schoolId);
  // Scope structures to the school's CURRENT session+term so a term rollover
  // never bills students with an old term's fee.
  const structures = feeStructures.filter(
    (f) =>
      f.schoolId === schoolId &&
      f.session === (school?.currentSession || "2025/2026") &&
      f.term === (school?.currentTerm || "First Term")
  );
  return students.map((student) => {
    const structure = structures.find(
      (f) => f.classArm === student.assignedClass
    );
    const amount = structure?.amount || 0;
    const payments = feePayments
      .filter((p) => p.schoolId === schoolId && p.studentId === student.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const confirmed = payments.filter((p) => p.status !== "PENDING");
    const pending = payments.filter((p) => p.status === "PENDING");
    const paid = confirmed.reduce((acc, p) => acc + p.amount, 0);
    const pendingAmount = pending.reduce((acc, p) => acc + p.amount, 0);
    const balance = Math.max(0, amount - paid);
    return {
      studentId: student.id,
      name: student.name,
      email: student.email,
      assignedClass: student.assignedClass || "",
      amount,
      paid,
      pending: pendingAmount,
      balance,
      feePaid: amount > 0 ? balance <= 0 : !!student.feePaid,
      payments,
    };
  });
}

export async function recordFeePayment({ schoolId, studentId, amount, method, note, status = "CONFIRMED" }) {
  const student = users.find(
    (u) => u.id === studentId && u.schoolId === schoolId && u.role === "STUDENT"
  );
  if (!student) return null;
  const amt = Math.max(0, Number(amount) || 0);
  // Normalize for parity with the Mongo schema's enum validation.
  const paymentStatus = status === "PENDING" ? "PENDING" : "CONFIRMED";
  const payment = {
    id: nid("fpay"),
    schoolId,
    studentId,
    amount: amt,
    method: method || "CASH",
    receiptNo: `RCT-${++receiptSeq}`,
    session: "2025/2026",
    term: "First Term",
    note: note || "",
    status: paymentStatus,
    createdAt: nowIso(),
  };
  feePayments.push(payment);
  // Sync the legacy feePaid boolean (ledger only counts CONFIRMED, so a
  // PENDING payment leaves feePaid untouched until the admin confirms it).
  const ledger = await getFeeLedger(schoolId);
  const entry = ledger.find((l) => l.studentId === studentId);
  student.feePaid = entry ? entry.balance <= 0 : true;
  return clone(payment);
}

/** Mark a PENDING payment as CONFIRMED and re-sync the student's fee status.
 *  Returns null if the payment is missing or already confirmed (parity with
 *  the Mongo store's findOneAndUpdate({ status: "PENDING" }) filter). */
export async function confirmFeePayment({ schoolId, paymentId }) {
  const payment = feePayments.find(
    (p) => p.id === paymentId && p.schoolId === schoolId
  );
  if (!payment || payment.status !== "PENDING") return null;
  payment.status = "CONFIRMED";
  const student = users.find((u) => u.id === payment.studentId);
  if (student) {
    const ledger = await getFeeLedger(schoolId);
    const entry = ledger.find((l) => l.studentId === student.id);
    student.feePaid = entry ? entry.balance <= 0 : true;
  }
  return clone(payment);
}

// ---- Attendance -------------------------------------------------------------

export async function getAttendance(schoolId, classArm, date) {
  const rec = attendance.find(
    (a) => a.schoolId === schoolId && a.classArm === classArm && a.date === date
  );
  return rec ? clone(rec) : null;
}

export async function saveAttendance(schoolId, classArm, date, records) {
  let rec = attendance.find(
    (a) => a.schoolId === schoolId && a.classArm === classArm && a.date === date
  );
  if (!rec) {
    rec = {
      id: nid("att"),
      schoolId,
      classArm,
      date,
      session: "2025/2026",
      term: "First Term",
      records: [],
      createdAt: nowIso(),
    };
    attendance.push(rec);
  }
  rec.records = records.map((r) => ({
    studentId: r.studentId,
    present: !!r.present,
  }));
  return clone(rec);
}

/** Attendance summary for one student: total days, present, absent. */
export async function getStudentAttendanceSummary(schoolId, studentId) {
  const records = attendance.filter(
    (a) =>
      a.schoolId === schoolId &&
      a.records.some((r) => r.studentId === studentId)
  );
  let present = 0;
  records.forEach((a) => {
    const rec = a.records.find((r) => r.studentId === studentId);
    if (rec?.present) present += 1;
  });
  return { total: records.length, present, absent: records.length - present };
}

// ---- Marketing leads ---------------------------------------------------------

/** Create a lead (demo request or newsletter subscription). Returns null if the
 *  email already exists for that kind (parity with the Mongo unique index). */
export async function createLead({ kind, name = "", school = "", email, phone = "", size = "", interest = "", message = "", ip = "", userAgent = "" }) {
  const existing = leads.find(
    (l) => l.kind === kind && l.email === email.toLowerCase()
  );
  if (existing) return null;
  const lead = {
    id: nid("lea"),
    kind,
    name,
    school,
    email: email.toLowerCase(),
    phone,
    size,
    interest,
    message,
    ip,
    userAgent,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  leads.push(lead);
  return clone(lead);
}

/** Most recent leads first (parity with Mongo listLeads). */
export async function listLeads(kind) {
  return leads
    .filter((l) => (kind ? l.kind === kind : true))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}
