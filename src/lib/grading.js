export const MAX_CA = 40;
export const MAX_CA_PER_COMPONENT = 10;
export const CA_COMPONENTS = 4;
export const MAX_EXAM = 60;

/** Compute total CA from 4 components */
export function computeCA(ca1, ca2, ca3, ca4) {
  return Math.min(MAX_CA, Math.max(0,
    (Number(ca1) || 0) +
    (Number(ca2) || 0) +
    (Number(ca3) || 0) +
    (Number(ca4) || 0)
  ));
}

export const DEFAULT_SUBJECTS = [
  "Mathematics",
  "English Language",
  "Physics",
  "Chemistry",
  "Biology",
  "Further Mathematics",
  "Economics",
  "Government",
  "Literature in English",
  "Geography",
  "Computer Science",
  "Agricultural Science",
  "Civic Education",
  "Accounting",
  "Commerce",
  "French",
];

export const TERMS = [
  "First Term",
  "Second Term",
  "Third Term",
];

export function getSubjects() {
  if (process.env.EDUTRACK_SUBJECTS) {
    return process.env.EDUTRACK_SUBJECTS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_SUBJECTS;
}

export function computeGrade(total) {
  if (total >= 70) return "A";
  if (total >= 60) return "B";
  if (total >= 50) return "C";
  if (total >= 40) return "D";
  return "F";
}

export function clampScore(value, max) {
  const n = Math.min(max, Math.max(0, Number(value) || 0));
  return Math.round(n);
}

/** Tailwind-friendly color classes per grade letter (UI use). */
export function gradeBadgeClasses(grade) {
  switch (grade) {
    case "A":
      return "bg-emerald-100 text-emerald-700 ring-emerald-600/20";
    case "B":
      return "bg-brand-100 text-brand-700 ring-brand-600/20";
    case "C":
      return "bg-amber-100 text-amber-700 ring-amber-600/20";
    case "D":
      return "bg-orange-100 text-orange-700 ring-orange-600/20";
    default:
      return "bg-rose-100 text-rose-700 ring-rose-600/20";
  }
}

export function standingFromAverage(avg) {
  if (avg >= 70)
    return { label: "Distinction", color: "#059669", classes: "bg-emerald-100 text-emerald-700 ring-emerald-600/20" };
  if (avg >= 60)
    return { label: "Very Good", color: "#2563eb", classes: "bg-brand-100 text-brand-700 ring-brand-600/20" };
  if (avg >= 50)
    return { label: "Good", color: "#d97706", classes: "bg-amber-100 text-amber-700 ring-amber-600/20" };
  if (avg >= 40)
    return { label: "Credit", color: "#ea580c", classes: "bg-orange-100 text-orange-700 ring-orange-600/20" };
  return { label: "Needs Support", color: "#e11d48", classes: "bg-rose-100 text-rose-700 ring-rose-600/20" };
}

export function standingRemark(label) {
  switch (label) {
    case "Distinction":
      return "Outstanding performance — keep it up!";
    case "Very Good":
      return "Excellent work — a little more push to reach the top!";
    case "Good":
      return "Good effort — stay consistent to improve further.";
    case "Credit":
      return "You can do better — revise consistently and aim higher.";
    default:
      return "Needs more attention — please reach out to your teachers.";
  }
}

/** Per-subject remark shown on the report card, based on the letter grade. */
export function subjectRemark(grade) {
  switch (grade) {
    case "A":
      return "Excellent grasp of the subject.";
    case "B":
      return "Very good — keep up the effort.";
    case "C":
      return "Good, but more practice is needed.";
    case "D":
      return "Fair — please revise this subject more.";
    default:
      return "Needs significant improvement.";
  }
}

/** 1 -> "1st", 3 -> "3rd", 21 -> "21st" etc. */
export function ordinal(n) {
  if (!n || Number.isNaN(n)) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
