/**
 * Alumni module — demo store implementation.
 */
import { alumniRecords, nid, clone, nowIso, persist } from "@/modules/shared/store-state";

export async function createAlumni({ schoolId, studentId, name, graduationYear, classArm, university, program, career, contactEmail, contactPhone, linkedIn, optedIn, notes }) {
  const record = { id: nid("alum"), schoolId, studentId: studentId || null, name, graduationYear, classArm: classArm || "", university: university || "", program: program || "", career: career || "", contactEmail: contactEmail || "", contactPhone: contactPhone || "", linkedIn: linkedIn || "", optedIn: optedIn || false, optedInAt: optedIn ? nowIso() : null, notes: notes || "", createdAt: nowIso(), updatedAt: nowIso() };
  alumniRecords.push(record); persist(); return clone(record);
}

export async function listAlumni(schoolId, { graduationYear, search } = {}) {
  return alumniRecords.filter((a) => { if (a.schoolId !== schoolId) return false; if (graduationYear && a.graduationYear !== graduationYear) return false; if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false; return true; }).sort((a, b) => b.graduationYear - a.graduationYear || a.name.localeCompare(b.name)).map(clone);
}

export async function getAlumniRecord(alumniId) { return clone(alumniRecords.find((a) => a.id === alumniId) || null); }

export async function updateAlumni(alumniId, updates) {
  const record = alumniRecords.find((a) => a.id === alumniId);
  if (!record) return null;
  Object.assign(record, updates, { updatedAt: nowIso() }); persist(); return clone(record);
}

export async function deleteAlumni(alumniId) {
  const idx = alumniRecords.findIndex((a) => a.id === alumniId);
  if (idx === -1) return false;
  alumniRecords.splice(idx, 1); persist(); return true;
}

export async function getAlumniStats(schoolId) {
  const all = alumniRecords.filter((a) => a.schoolId === schoolId);
  const total = all.length;
  const byYear = {}, universities = {};
  for (const a of all) { byYear[a.graduationYear] = (byYear[a.graduationYear] || 0) + 1; if (a.university) universities[a.university] = (universities[a.university] || 0) + 1; }
  const placed = all.filter((a) => a.university).length;
  return { total, byYear, universities, placementRate: total ? Math.round((placed / total) * 100) : 0 };
}
