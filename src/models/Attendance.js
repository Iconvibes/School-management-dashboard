import mongoose from "mongoose";

const attendanceRecordSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    present: { type: Boolean, required: true },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    classArm: { type: String, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    session: { type: String, required: true, default: "2025/2026" },
    term: { type: String, required: true, default: "First Term" },
    records: { type: [attendanceRecordSchema], default: [] },
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

// One register per class arm per day per school
attendanceSchema.index({ schoolId: 1, classArm: 1, date: 1 }, { unique: true });

const Attendance =
  mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);

export default Attendance;
