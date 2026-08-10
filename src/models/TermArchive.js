import mongoose from "mongoose";

/**
 * Archived per-term snapshots from a term rollover.
 *
 * When a school moves to a new term, the old term's live scores and
 * attendance registers are snapshotted here (keyed by schoolId/session/term)
 * and cleared from the live tables — the new term starts with an empty
 * scorebook and a clean register, while this collection stays the durable
 * record of what the old term held. One row per score, one row per attendance
 * register (per-row docs keep a 10k-student term far below the 16MB doc cap).
 *
 * `kind` distinguishes the payload shapes:
 *   - "score":      studentId, subject, caScore, examScore, totalScore, grade
 *   - "attendance": date, records[{ studentId, present }]
 *   - "student":    the term's cohort roster — studentId, studentName,
 *                   classArm. Snapshot at rollover so archived report cards
 *                   keep the real name even if the student later graduates
 *                   or is deleted. Excluded from summary counts.
 */
const termArchiveSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    session: { type: String, required: true },
    term: { type: String, required: true },
    kind: { type: String, enum: ["score", "attendance", "student"], required: true },
    classArm: { type: String, required: true },
    // score rows
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    subject: { type: String },
    caScore: { type: Number },
    examScore: { type: Number },
    totalScore: { type: Number },
    grade: { type: String },
    // attendance rows
    date: { type: String },
    records: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        present: { type: Boolean },
      },
      { _id: false },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Archived terms are queried by (school, session, term) and kind.
termArchiveSchema.index({ schoolId: 1, session: 1, term: 1, kind: 1 });

const TermArchive =
  mongoose.models.TermArchive || mongoose.model("TermArchive", termArchiveSchema);

export default TermArchive;
