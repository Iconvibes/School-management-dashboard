import mongoose from "mongoose";

/**
 * One weekly timetable slot: a subject taught by one teacher in one class
 * arm at one period of one school day. The SUPER_ADMIN builds these in the
 * admin console; teachers read their own (subject-specialist scope) in the
 * teacher portal.
 *
 * Uniqueness: one slot per (schoolId, classArm, day, period) — upserted, so
 * assigning a period simply overwrites it. teacherId rides an index for the
 * teacher's "what classes do I take" view.
 */
const timetableSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    classArm: { type: String, required: true },
    day: { type: String, required: true }, // Monday..Friday
    period: { type: Number, required: true, min: 1, max: 8 },
    subject: { type: String, required: true, trim: true },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    session: { type: String, required: true, default: "2025/2026" },
    term: { type: String, required: true, default: "First Term" },
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

// One subject per period per class arm — the upsert key.
timetableSchema.index(
  { schoolId: 1, classArm: 1, day: 1, period: 1 },
  { unique: true }
);
// Teacher's own weekly view (and the double-booking guard).
timetableSchema.index({ schoolId: 1, teacherId: 1 });

const TimetableEntry =
  mongoose.models.TimetableEntry ||
  mongoose.model("TimetableEntry", timetableSchema);

export default TimetableEntry;
