/**
 * Mongo store — teaching domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  ready,
  safe,
} from "./shared.js";

// ── Scheme of Work ──────────────────────────────────────────────────
import SchemeOfWork from "@/models/SchemeOfWork";

export async function createSchemeOfWork({ schoolId, subject, classArm, session, term, topics, fileUrl, fileName, fileType, fileSize, uploadedBy, createdBy }) {
  await ready();
  const existing = await SchemeOfWork.findOne({ schoolId, subject, classArm, session, term });
  if (existing) {
    existing.topics = topics || existing.topics;
    if (fileUrl !== undefined) { existing.fileUrl = fileUrl; existing.fileName = fileName || ""; existing.fileType = fileType || ""; existing.fileSize = fileSize || 0; existing.uploadedBy = uploadedBy || createdBy; }
    existing.updatedBy = createdBy;
    await existing.save();
    return safe(existing);
  }
  const doc = await SchemeOfWork.create({ schoolId, subject, classArm, session, term, topics: topics || [], fileUrl: fileUrl || "", fileName: fileName || "", fileType: fileType || "", fileSize: fileSize || 0, uploadedBy: uploadedBy || createdBy, createdBy, updatedBy: createdBy });
  return safe(doc);
}

export async function getSchemesOfWork(schoolId, { subject, classArm, session, term } = {}) {
  await ready();
  const q = { schoolId };
  if (subject) q.subject = subject;
  if (classArm) q.classArm = classArm;
  if (session) q.session = session;
  if (term) q.term = term;
  return (await SchemeOfWork.find(q).sort({ createdAt: -1 })).map(safe);
}

export async function getSchemeOfWork(schemeId) {
  await ready();
  return safe(await SchemeOfWork.findById(schemeId));
}

export async function updateSchemeOfWork(schemeId, updates) {
  await ready();
  return safe(await SchemeOfWork.findByIdAndUpdate(schemeId, updates, { new: true }));
}

export async function deleteSchemeOfWork(schemeId) {
  await ready();
  await SchemeOfWork.findByIdAndDelete(schemeId);
  return true;
}

// ── Class Resources ─────────────────────────────────────────────────
import ClassResource from "@/models/ClassResource";

export async function createClassResource({ schoolId, teacherId, classArm, subject, type, title, description, content, attachments, dueDate, maxScore, isReadAhead, readAheadDate, ocrSource }) {
  await ready();
  const doc = await ClassResource.create({
    schoolId, teacherId, classArm, subject, type, title,
    description: description || "", content: content || "",
    attachments: attachments || [],
    dueDate: dueDate || null, maxScore: maxScore || null,
    isReadAhead: isReadAhead || false, readAheadDate: readAheadDate || null,
    published: true, publishedAt: new Date(),
    ocrSource: ocrSource || null,
  });
  return safe(doc);
}

export async function listClassResources(schoolId, { classArm, subject, teacherId, type } = {}) {
  await ready();
  const q = { schoolId, published: true };
  if (classArm) q.classArm = classArm;
  if (subject) q.subject = subject;
  if (teacherId) q.teacherId = teacherId;
  if (type) q.type = type;
  return (await ClassResource.find(q).sort({ createdAt: -1 })).map(safe);
}

export async function getClassResource(resourceId) {
  await ready();
  return safe(await ClassResource.findById(resourceId));
}

export async function updateClassResource(resourceId, updates) {
  await ready();
  return safe(await ClassResource.findByIdAndUpdate(resourceId, updates, { new: true }));
}

export async function deleteClassResource(resourceId) {
  await ready();
  await ClassResource.findByIdAndDelete(resourceId);
  return true;
}

// ── Assignment Submissions ──────────────────────────────────────────
import AssignmentSubmission from "@/models/AssignmentSubmission";

export async function createSubmission({ schoolId, resourceId, studentId, classArm, subject, content, attachments }) {
  await ready();
  // Upsert: one submission per student per resource
  const existing = await AssignmentSubmission.findOne({ resourceId, studentId });
  if (existing) {
    existing.content = content || "";
    existing.attachments = attachments || [];
    existing.status = "submitted";
    existing.score = null;
    existing.grade = null;
    existing.feedback = "";
    existing.gradedAt = null;
    existing.gradedBy = null;
    existing.updatedAt = new Date();
    await existing.save();
    return safe(existing);
  }
  const resource = await ClassResource.findById(resourceId);
  const doc = await AssignmentSubmission.create({
    schoolId,
    resourceId,
    studentId,
    classArm,
    subject,
    content: content || "",
    attachments: attachments || [],
    maxScore: resource?.maxScore || null,
  });
  return safe(doc);
}

export async function getSubmissionsForResource(resourceId) {
  await ready();
  return (await AssignmentSubmission.find({ resourceId }).sort({ createdAt: -1 })).map(safe);
}

export async function getSubmissionForResourceAndStudent(resourceId, studentId) {
  await ready();
  return safe(await AssignmentSubmission.findOne({ resourceId, studentId }));
}

export async function getSubmissionsByStudent(schoolId, studentId) {
  await ready();
  return (await AssignmentSubmission.find({ schoolId, studentId }).sort({ createdAt: -1 })).map(safe);
}

export async function gradeSubmission(submissionId, { score, grade, feedback, gradedBy }) {
  await ready();
  const sub = await AssignmentSubmission.findByIdAndUpdate(
    submissionId,
    {
      score,
      grade,
      feedback: feedback || "",
      gradedAt: new Date(),
      gradedBy,
      status: "graded",
    },
    { new: true }
  );
  return safe(sub);
}
