/**
 * Resources module — demo store implementation.
 * Functions: createSchemeOfWork, getSchemesOfWork, getSchemeOfWork, updateSchemeOfWork, deleteSchemeOfWork,
 *            createClassResource, listClassResources, getClassResource, updateClassResource, deleteClassResource
 */
import { schemesOfWork, classResources, assignmentSubmissions, nid, clone, nowIso, persist } from "@/modules/shared/store-state";

export async function createSchemeOfWork({ schoolId, subject, classArm, session, term, topics, createdBy }) {
  const existing = schemesOfWork.find((s) => s.schoolId === schoolId && s.subject === subject && s.classArm === classArm && s.session === session && s.term === term);
  if (existing) { existing.topics = topics || []; existing.updatedBy = createdBy; existing.updatedAt = nowIso(); persist(); return clone(existing); }
  const scheme = { id: nid("sch"), schoolId, subject, classArm, session, term, topics: topics || [], createdBy, updatedBy: createdBy, createdAt: nowIso(), updatedAt: nowIso() };
  schemesOfWork.push(scheme); persist(); return clone(scheme);
}

export async function getSchemesOfWork(schoolId, { subject, classArm, session, term } = {}) {
  return schemesOfWork.filter((s) => { if (s.schoolId !== schoolId) return false; if (subject && s.subject !== subject) return false; if (classArm && s.classArm !== classArm) return false; if (session && s.session !== session) return false; if (term && s.term !== term) return false; return true; }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(clone);
}

export async function getSchemeOfWork(schemeId) { return clone(schemesOfWork.find((s) => s.id === schemeId) || null); }

export async function updateSchemeOfWork(schemeId, updates) {
  const scheme = schemesOfWork.find((s) => s.id === schemeId);
  if (!scheme) return null;
  Object.assign(scheme, updates, { updatedAt: nowIso() }); persist(); return clone(scheme);
}

export async function deleteSchemeOfWork(schemeId) {
  const idx = schemesOfWork.findIndex((s) => s.id === schemeId);
  if (idx === -1) return false;
  schemesOfWork.splice(idx, 1); persist(); return true;
}

export async function createClassResource({ schoolId, teacherId, classArm, subject, type, title, description, content, attachments, dueDate, maxScore, isReadAhead, readAheadDate, ocrSource }) {
  const resource = { id: nid("res"), schoolId, teacherId, classArm, subject, type, title, description: description || "", content: content || "", attachments: attachments || [], dueDate: dueDate || null, maxScore: maxScore || null, isReadAhead: isReadAhead || false, readAheadDate: readAheadDate || null, published: true, publishedAt: nowIso(), ocrSource: ocrSource || null, createdAt: nowIso(), updatedAt: nowIso() };
  classResources.push(resource); persist(); return clone(resource);
}

export async function listClassResources(schoolId, { classArm, subject, teacherId, type } = {}) {
  return classResources.filter((r) => { if (r.schoolId !== schoolId || !r.published) return false; if (classArm && r.classArm !== classArm) return false; if (subject && r.subject !== subject) return false; if (teacherId && r.teacherId !== teacherId) return false; if (type && r.type !== type) return false; return true; }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(clone);
}

export async function getClassResource(resourceId) { return clone(classResources.find((r) => r.id === resourceId) || null); }

export async function updateClassResource(resourceId, updates) {
  const resource = classResources.find((r) => r.id === resourceId);
  if (!resource) return null;
  Object.assign(resource, updates, { updatedAt: nowIso() }); persist(); return clone(resource);
}

export async function deleteClassResource(resourceId) {
  const idx = classResources.findIndex((r) => r.id === resourceId);
  if (idx === -1) return false;
  classResources.splice(idx, 1); persist(); return true;
}

// ── Assignment Submissions ──────────────────────────────────────────

export async function createSubmission({ schoolId, resourceId, studentId, classArm, subject, content, attachments }) {
  // Upsert: one submission per student per resource
  const existing = assignmentSubmissions.find(
    (s) => s.resourceId === resourceId && s.studentId === studentId
  );
  if (existing) {
    existing.content = content || "";
    existing.attachments = attachments || [];
    existing.status = "submitted";
    existing.updatedAt = nowIso();
    persist();
    return clone(existing);
  }
  const resource = classResources.find((r) => r.id === resourceId);
  const submission = {
    id: nid("sub"),
    schoolId,
    resourceId,
    studentId,
    classArm,
    subject,
    content: content || "",
    attachments: attachments || [],
    score: null,
    maxScore: resource?.maxScore || null,
    grade: null,
    feedback: "",
    gradedAt: null,
    gradedBy: null,
    status: "submitted",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  assignmentSubmissions.push(submission);
  persist();
  return clone(submission);
}

export async function getSubmissionsForResource(resourceId) {
  return assignmentSubmissions
    .filter((s) => s.resourceId === resourceId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}

export async function getSubmissionForResourceAndStudent(resourceId, studentId) {
  const sub = assignmentSubmissions.find(
    (s) => s.resourceId === resourceId && s.studentId === studentId
  );
  return sub ? clone(sub) : null;
}

export async function getSubmissionsByStudent(schoolId, studentId) {
  return assignmentSubmissions
    .filter((s) => s.schoolId === schoolId && s.studentId === studentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}

export async function gradeSubmission(submissionId, { score, grade, feedback, gradedBy }) {
  const sub = assignmentSubmissions.find((s) => s.id === submissionId);
  if (!sub) return null;
  sub.score = score;
  sub.grade = grade;
  sub.feedback = feedback || "";
  sub.gradedAt = nowIso();
  sub.gradedBy = gradedBy;
  sub.status = "graded";
  sub.updatedAt = nowIso();
  persist();
  return clone(sub);
}
