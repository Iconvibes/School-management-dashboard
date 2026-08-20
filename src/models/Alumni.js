import mongoose from "mongoose";

const alumniSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    // Link to the original student record (if they were in EduTrack)
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Alumni info (may not have a linked student record)
    name: { type: String, required: true },
    graduationYear: { type: Number, required: true },
    classArm: { type: String }, // their class arm at graduation
    // Post-graduation tracking
    university: { type: String, default: "" },
    program: { type: String, default: "" }, // e.g. "Computer Science"
    career: { type: String, default: "" },
    // Contact info (for alumni network)
    contactEmail: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    linkedIn: { type: String, default: "" },
    // Opt-in for alumni network
    optedIn: { type: Boolean, default: false },
    optedInAt: { type: Date },
    // Notes
    notes: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

alumniSchema.index({ schoolId: 1, graduationYear: 1 });
alumniSchema.index({ schoolId: 1, name: 1 });

const Alumni =
  mongoose.models.Alumni || mongoose.model("Alumni", alumniSchema);

export default Alumni;
