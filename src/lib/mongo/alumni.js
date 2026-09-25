/**
 * Mongo store — alumni domain. Split out of mongo-store.js by model/entity;
 * signatures are unchanged and re-exported from mongo-store.js (the hub),
 * so every existing import path keeps working.
 */
import {
  ready,
  safe,
} from "./shared.js";

// ── Alumni ──────────────────────────────────────────────────────────
import Alumni from "@/models/Alumni";

export async function createAlumni({ schoolId, studentId, name, graduationYear, classArm, university, program, career, contactEmail, contactPhone, linkedIn, optedIn, notes }) {
  await ready();
  const doc = await Alumni.create({
    schoolId, studentId: studentId || null, name, graduationYear,
    classArm: classArm || "", university: university || "", program: program || "",
    career: career || "", contactEmail: contactEmail || "", contactPhone: contactPhone || "",
    linkedIn: linkedIn || "", optedIn: optedIn || false,
    optedInAt: optedIn ? new Date() : null,
    notes: notes || "",
  });
  return safe(doc);
}

export async function listAlumni(schoolId, { graduationYear, search } = {}) {
  await ready();
  const q = { schoolId };
  if (graduationYear) q.graduationYear = graduationYear;
  if (search) q.name = { $regex: search, $options: "i" };
  return (await Alumni.find(q).sort({ graduationYear: -1, name: 1 })).map(safe);
}

export async function getAlumniRecord(alumniId) {
  await ready();
  return safe(await Alumni.findById(alumniId));
}

export async function updateAlumni(alumniId, updates) {
  await ready();
  return safe(await Alumni.findByIdAndUpdate(alumniId, updates, { new: true }));
}

export async function deleteAlumni(alumniId) {
  await ready();
  await Alumni.findByIdAndDelete(alumniId);
  return true;
}

export async function getAlumniStats(schoolId) {
  await ready();
  const all = await Alumni.find({ schoolId });
  const total = all.length;
  const byYear = {};
  const universities = {};
  for (const a of all) {
    byYear[a.graduationYear] = (byYear[a.graduationYear] || 0) + 1;
    if (a.university) universities[a.university] = (universities[a.university] || 0) + 1;
  }
  const placed = all.filter((a) => a.university).length;
  return { total, byYear, universities, placementRate: total ? Math.round((placed / total) * 100) : 0 };
}
