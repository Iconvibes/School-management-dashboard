/**
 * Users module — demo store implementation.
 *
 * Functions: getSchoolUserIds, listUsers, countUsers, findAuthSnapshot,
 *            findUserById, findUserByIdWithAuth, createUser, updateRole,
 *            updateUser, getChildren, deleteUser, findUserByEmail,
 *            findUserByEmailInSchool, findParentByNameInSchool,
 *            findTeacherByNameInSchool
 */
import { blindEmailIndex, blindPhoneIndex } from "@/lib/field-crypto";
import { nameSlug } from "@/lib/passwords";
import {
  users,
  schools,
  scores,
  attendance,
  feePayments,
  feeCarryovers,
  timetable,
  nid,
  clone,
  hash,
  nowIso,
  persist,
  publicUser,
  roleAudit,
} from "@/modules/shared/store-state";

// Re-export helpers needed by other modules
export { publicUser };

export async function getSchoolUserIds(schoolId) {
  return users.filter((u) => u.schoolId === schoolId).map((u) => u.id);
}

export async function listUsers({ schoolId, role, classArm, limit, offset = 0 }) {
  const filtered = users
    .filter((u) => u.schoolId === schoolId)
    .filter((u) => (role ? u.role === role : true))
    .filter((u) => (classArm ? u.assignedClass === classArm : true));
  const from = Math.max(0, Number(offset) || 0);
  const to = limit === undefined ? undefined : from + Math.floor(Math.max(0, Number(limit) || 0));
  const page = limit === undefined ? filtered : filtered.slice(from, to);
  return page.map(publicUser);
}

export async function countUsers({ schoolId, role, classArm }) {
  return users
    .filter((u) => u.schoolId === schoolId)
    .filter((u) => (role ? u.role === role : true))
    .filter((u) => (classArm ? u.assignedClass === classArm : true))
    .length;
}

/**
 * Lean auth hot-path lookup — role/schoolId/assignedClass/subjects/arms/tokenVersion ONLY.
 */
export async function findAuthSnapshot(id) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  const ownArms = Array.isArray(user.assignedClasses) ? user.assignedClasses : [];
  const arms = ownArms.length ? ownArms : user.assignedClass ? [user.assignedClass] : [];
  return {
    id: user.id,
    role: user.role,
    schoolId: user.schoolId,
    schoolStatus: schools.find((s) => s.id === user.schoolId)?.status || "active",
    assignedClass: user.assignedClass || "",
    subjects: Array.isArray(user.subjects) ? user.subjects : [],
    assignedClasses: arms,
    tokenVersion: user.tokenVersion || 0,
  };
}

export async function findUserById(id) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  return publicUser(user);
}

export async function findUserByIdWithAuth(id) {
  return clone(users.find((u) => u.id === id));
}

export async function findUserByEmail(email) {
  return clone(users.find((u) => u.emailIdx === blindEmailIndex(email)));
}

export async function findUserByEmailInSchool(schoolId, email) {
  return clone(
    users.find(
      (u) => u.schoolId === schoolId && u.emailIdx === blindEmailIndex(email)
    )
  );
}

export async function findParentByNameInSchool(schoolId, name) {
  const norm = String(name || "").trim().toLowerCase();
  if (!norm) return null;
  const found = users.find(
    (u) =>
      u.schoolId === schoolId &&
      u.role === "PARENT" &&
      String(u.name || "").trim().toLowerCase() === norm
  );
  return found ? clone(found) : null;
}

export async function findTeacherByNameInSchool(schoolId, name) {
  const norm = String(name || "").trim().toLowerCase();
  if (!norm) return null;
  const found = users.find(
    (u) =>
      u.schoolId === schoolId &&
      u.role === "TEACHER" &&
      String(u.name || "").trim().toLowerCase() === norm
  );
  return found ? clone(found) : null;
}

export async function createUser({ schoolId, name, email, password, role, assignedClass = "", phone = "", subjects = [], assignedClasses = [], generatedPassword }) {
  const id = nid("usr");
  const user = {
    id,
    name,
    email: String(email || "").toLowerCase(),
    emailIdx: email ? blindEmailIndex(email) : `empty-${id}`,
    password: hash(password),
    role,
    schoolId,
    assignedClass,
    subjects: Array.isArray(subjects) ? subjects : [],
    assignedClasses:
      Array.isArray(assignedClasses) && assignedClasses.length > 0
        ? assignedClasses
        : role === "TEACHER" && assignedClass
          ? [assignedClass]
          : [],
    generatedPassword: generatedPassword || "",
    payrollStatus: role === "TEACHER" ? "PENDING" : "PAID",
    feePaid: false,
    parentId: null,
    phone,
    phoneIdx: blindPhoneIndex(phone),
    address: "",
    createdAt: nowIso(),
  };
  users.push(user);
  persist();
  return publicUser(user);
}

export async function updateRole(id, newRole) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  user.role = newRole;
  persist();
  return publicUser(user);
}

export async function updateUser(id, patch) {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  const allowed = [
    "name", "assignedClass", "subjects", "assignedClasses",
    "payrollStatus", "feePaid", "parentId", "phone", "address",
    "generatedPassword", "tokenVersion", "passwordSet",
  ];
  allowed.forEach((k) => {
    if (patch[k] !== undefined) user[k] = patch[k];
  });
  if (patch.phone !== undefined) user.phoneIdx = blindPhoneIndex(patch.phone);
  if (patch.password !== undefined) user.password = hash(patch.password);
  // Parent-link sync: when a student is linked to a parent, that parent's
  // login password becomes the child's full name (slugged).
  if (patch.parentId !== undefined && user.role === "STUDENT") {
    const parent = user.parentId ? users.find((u) => u.id === user.parentId) : null;
    if (parent && parent.role === "PARENT" && parent.schoolId === user.schoolId) {
      const slug = nameSlug(user.name);
      parent.password = hash(slug);
      parent.generatedPassword = slug;
    }
  }
  persist();
  return publicUser(user);
}

export async function getChildren(parentId) {
  const parent = users.find((u) => u.id === parentId);
  if (!parent) return [];
  return users
    .filter((u) => u.schoolId === parent.schoolId && u.parentId === parentId)
    .map(publicUser);
}

export async function deleteUser(id) {
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  const user = users[idx];
  users.splice(idx, 1);
  // Cascade: a removed student takes their scores, attendance and fee
  // payments with them; a removed teacher frees their timetable slots.
  const drop = (arr, key) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i][key] === id) arr.splice(i, 1);
    }
  };
  if (user.role === "STUDENT") {
    drop(scores, "studentId");
    drop(attendance, "studentId");
    drop(feePayments, "studentId");
    drop(feeCarryovers, "studentId");
  } else if (user.role === "TEACHER") {
    drop(timetable, "teacherId");
  }
  persist();
  return true;
}

// ── Role Audit ──────────────────────────────────────────────────────

export async function logRoleAudit({ schoolId, actorId = "", actorName, actorRole = "", targetId = "", targetName = "", fromRole = "", toRole }) {
  const entry = { id: nid("rla"), schoolId, actorId, actorName: actorName || "Unknown", actorRole, targetId, targetName: targetName || "Unknown", fromRole, toRole, createdAt: nowIso() };
  roleAudit.push(entry); persist(); return clone(entry);
}

export async function listRoleAudit(schoolId, { limit = 100 } = {}) {
  return roleAudit.filter((e) => e.schoolId === schoolId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || Number(b.id.replace(/\D/g, "")) - Number(a.id.replace(/\D/g, "")))
    .slice(0, limit).map(clone);
}
