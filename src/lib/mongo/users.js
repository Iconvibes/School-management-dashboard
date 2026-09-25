/**
 * Mongo store — users domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  bcrypt,
  mongoose,
  School,
  User,
  Score,
  FeeStructure,
  FeePayment,
  FeeCarryover,
  ReminderBatch,
  Attendance,
  TimetableEntry,
  TermArchive,
  ClassAlertPref,
  ConflictScan,
  Notification,
  FeeAudit,
  RoleAudit,
  DigestPref,
  Digest,
  bypassTenantScope,
  nameSlug,
  blindEmailIndex,
  blindPhoneIndex,
  encryptField,
  ready,
  safe,
} from "./shared.js";

// ---- Users -----------------------------------------------------------------

export async function listUsers({ schoolId, role, classArm, limit, offset = 0 }) {
  await ready();
  const query = { schoolId };
  if (role) query.role = role;
  if (classArm) query.assignedClass = classArm;
  let cursor = User.find(query).sort({ name: 1 });
  // Optional pagination — the roster tab can page instead of loading the
  // whole school in one payload. Clamp offset and floor the limit: the demo
  // store slice() would accept (and silently mis-handle) a negative offset /
  // fractional limit, while the Mongo driver throws on both.
  if (limit !== undefined) {
    cursor = cursor
      .skip(Math.max(0, Number(offset) || 0))
      .limit(Math.max(0, Math.floor(Number(limit) || 0)));
  }
  return (await cursor).map(safe);
}

/** Total rows listUsers would return for the same query (pagination parity). */
export async function countUsers({ schoolId, role, classArm }) {
  await ready();
  const query = { schoolId };
  if (role) query.role = role;
  if (classArm) query.assignedClass = classArm;
  return User.countDocuments(query);
}

export async function createUser({ schoolId, name, email, password, role, assignedClass = "", phone = "", subjects = [], assignedClasses = [], generatedPassword }) {
  await ready();
  // Regression-pinned by tests/tenant-scope.test.js: the create payload must
  // carry schoolId, role, password and assignedClass — a previous version
  // dropped them (invisible in demo mode, cross-tenant + un-loginable users
  // in Mongo mode). The raw password rides in; the User pre("save") hook
  // hashes it. Parity with the demo store's createUser.
  const user = await User.create({
    schoolId,
    name,
    email: encryptField(email),
    // Name-only parents have NO email. The blind index of "" is "", which
    // would collide on the per-school unique emailIdx index — derive a
    // per-user sentinel instead so any number of no-email parents can
    // coexist. Empty-email lookups never match (correct: nothing should).
    emailIdx: email ? blindEmailIndex(email) : `empty-${new mongoose.Types.ObjectId()}`,
    password,
    role,
    assignedClass,
    subjects: Array.isArray(subjects) ? subjects : [],
    // Teachers default to their single assignedClass (legacy parity); an
    // explicit multi-arm list wins.
    assignedClasses:
      Array.isArray(assignedClasses) && assignedClasses.length > 0
        ? assignedClasses
        : role === "TEACHER" && assignedClass
          ? [assignedClass]
          : [],
    phone: encryptField(phone),
    phoneIdx: blindPhoneIndex(phone),
    payrollStatus: role === "TEACHER" ? "PENDING" : "PAID",
    generatedPassword: generatedPassword || "",
  });
  return safe(user);
}

/**
 * Change a user's role — a dedicated store op so the generic updateUser path
 * can NEVER touch role (that route forbids it by construction).
 */
export async function updateRole(id, newRole) {
  await ready();
  // By-_id: the role route has already tenant-scoped the caller (requireAuth +
  // assertSameTenant) before reaching here.
  return safe(await bypassTenantScope(User.findByIdAndUpdate(id, { role: newRole }, { new: true })));
}

export async function updateUser(id, patch) {
  await ready();
  const allowed = [
    "name",
    "assignedClass",
    "subjects",
    "assignedClasses",
    "payrollStatus",
    "feePaid",
    "parentId",
    "phone",
    "address",
    "password",
    "generatedPassword",
    // Session revocation: bumped by the change-password route so every token
    // signed before the change dies on its next use.
    "tokenVersion",
    // Teacher bootstrap flag: true once the teacher sets their own password
    // (school-name login turns off); reset to false by an admin reset.
    "passwordSet",
  ];
  const update = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) update[k] = patch[k];
  });
  // findByIdAndUpdate bypasses the model's pre("save") bcrypt hook, so hash
  // explicitly here. Callers validate length before reaching the store.
  if (update.password !== undefined) {
    update.password = await bcrypt.hash(update.password, 10);
  }
  // Phone is PII — encrypt on write (email is immutable via PATCH by design,
  // so only phone needs the field-crypto treatment here). The blind index is
  // computed from the PLAINTEXT (patch.phone), never the envelope.
  if (update.phone !== undefined) {
    update.phone = encryptField(update.phone);
    update.phoneIdx = blindPhoneIndex(patch.phone);
  }
  // Parent-link sync: when a student's link changes, the parent's password
  // becomes that child's slugged full name (recorded in generatedPassword so
  // the admin can look it up). A parent linked to several children signs in
  // with ANY of their names — the login route checks every linked child.
  // Unlinking (parentId: null) changes nothing.
  // By-_id parent-link lookups: the caller is tenant-scoped by the route
  // (requireAuth + assertSameTenant), so these are legitimate bypasses.
  if (update.parentId !== undefined) {
    const child = await bypassTenantScope(User.findById(id));
    if (child && child.role === "STUDENT" && update.parentId) {
      const parent = await bypassTenantScope(User.findById(update.parentId));
      if (parent && parent.role === "PARENT" && String(parent.schoolId) === String(child.schoolId)) {
        const slug = nameSlug(update.name !== undefined ? update.name : child.name);
        await bypassTenantScope(
          User.findByIdAndUpdate(update.parentId, {
            password: await bcrypt.hash(slug, 10),
            generatedPassword: slug,
          })
        );
      }
    }
  }
  return safe(await bypassTenantScope(User.findByIdAndUpdate(id, update, { new: true })));
}

/** List a parent's linked children (tenant-scoped to the parent's school). */
export async function getChildren(parentId) {
  await ready();
  const parent = await bypassTenantScope(User.findById(parentId));
  if (!parent) return [];
  return (await User.find({ schoolId: parent.schoolId, parentId })).map(safe);
}

export async function deleteUser(id) {
  await ready();
  // By-_id + cascade deletes: the route already tenant-scoped the caller.
  const user = await bypassTenantScope(User.findById(id));
  if (!user) return false;
  await bypassTenantScope(User.findByIdAndDelete(id));
  // Cascade: a removed student takes their scores, attendance and fee
  // payments with them; a removed teacher frees their timetable slots.
  if (user.role === "STUDENT") {
    await Promise.all([
      bypassTenantScope(Score.deleteMany({ studentId: id })),
      bypassTenantScope(Attendance.deleteMany({ studentId: id })),
      bypassTenantScope(FeePayment.deleteMany({ studentId: id })),
      bypassTenantScope(FeeCarryover.deleteMany({ studentId: id })),
    ]);
  } else if (user.role === "TEACHER") {
    await bypassTenantScope(TimetableEntry.deleteMany({ teacherId: id }));
  }
  return true;
}

/** How long a deleted school's data stays recoverable before the permanent wipe. */
export const SCHOOL_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export async function setSchoolStatus(schoolId, status) {
  await ready();
  // Allow all valid status transitions — the approval lifecycle uses
  // pending_approval and rejected; freeze/deactivate/restore use the rest.
  const validStatuses = ["active", "frozen", "pending_approval", "rejected"];
  const next = validStatuses.includes(status) ? status : "active";
  const set = { status: next };
  if (next === "active" || next === "rejected") set.approvedAt = new Date();
  const update = { $set: set };
  if (next === "active") {
    // Back to active — whether a reactivation or a grace-period restore, the
    // deletedAt stamp is no longer meaningful.
    update.$unset = { deletedAt: "" };
  }
  return School.findByIdAndUpdate(schoolId, update, { new: true }).then((s) =>
    s ? s.toJSON() : null
  );
}

/**
 * Approve a pending school — sets status to active and records approval time.
 */
export async function approveSchool(schoolId, approvedBy) {
  await ready();
  const school = await School.findOneAndUpdate(
    { _id: schoolId, status: "pending_approval" },
    {
      $set: {
        status: "active",
        approvedAt: new Date(),
        approvedBy: approvedBy || "platform",
      },
      $unset: { deletedAt: "" },
    },
    { new: true }
  );
  return school ? school.toJSON() : null;
}

/**
 * Reject a pending school — sets status to rejected with a reason.
 */
export async function rejectSchool(schoolId, reason, rejectedBy) {
  await ready();
  const school = await School.findOneAndUpdate(
    { _id: schoolId, status: "pending_approval" },
    {
      $set: {
        status: "rejected",
        rejectionReason: reason || "",
        rejectedAt: new Date(),
        rejectedBy: rejectedBy || "platform",
      },
    },
    { new: true }
  );
  return school ? school.toJSON() : null;
}

/**
 * Delete a school (grace period): marks it "deleted" with a deletedAt stamp
 * instead of wiping it. Every byte of data stays intact and the SUPER_ADMIN
 * can restore the account until the grace period expires.
 */
export async function deleteSchool(schoolId) {
  await ready();
  const school = await School.findByIdAndUpdate(
    schoolId,
    { status: "deleted", deletedAt: new Date() },
    { new: true }
  );
  return !!school;
}

/**
 * Permanent wipe — removes the school and every tenant record for real. This
 * is what purgeExpiredDeletedSchools runs once the grace period is over (and
 * what an expired school's login triggers lazily). Platform-level leads are
 * intentionally NOT tenant-scoped, so they survive.
 */
export async function purgeSchool(schoolId) {
  await ready();
  const school = await School.findById(schoolId);
  if (!school) return false;
  await Promise.all([
    School.deleteOne({ _id: schoolId }),
    User.deleteMany({ schoolId }),
    Score.deleteMany({ schoolId }),
    FeeStructure.deleteMany({ schoolId }),
    FeePayment.deleteMany({ schoolId }),
    FeeCarryover.deleteMany({ schoolId }),
    ReminderBatch.deleteMany({ schoolId }),
    Attendance.deleteMany({ schoolId }),
    TimetableEntry.deleteMany({ schoolId }),
    TermArchive.deleteMany({ schoolId }),
    ClassAlertPref.deleteMany({ schoolId }),
    ConflictScan.deleteMany({ schoolId }),
    Notification.deleteMany({ schoolId }),
    FeeAudit.deleteMany({ schoolId }),
    RoleAudit.deleteMany({ schoolId }),
    DigestPref.deleteMany({ schoolId }),
    Digest.deleteMany({ schoolId }),
  ]);
  return true;
}

/**
 * Sweep deleted schools whose grace period has lapsed — the daily background
 * job (see src/instrumentation.js) and the login route's lazy check both call
 * this. Idempotent: a school already purged is simply skipped. Returns the
 * number of tenants permanently removed.
 */
export async function purgeExpiredDeletedSchools({ now = Date.now(), graceMs = SCHOOL_DELETION_GRACE_MS } = {}) {
  await ready();
  const cutoff = new Date(now - graceMs);
  const expired = await School.find({ status: "deleted", deletedAt: { $lt: cutoff } }).lean();
  for (const s of expired) {
    await purgeSchool(String(s._id));
  }
  return expired.length;
}
