import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  {
    week: { type: Number, required: true },
    title: { type: String, required: true },
    objectives: [{ type: String }],
    status: {
      type: String,
      enum: ["planned", "in_progress", "completed", "skipped"],
      default: "planned",
    },
    resources: [
      {
        title: { type: String },
        url: { type: String },
        type: { type: String, enum: ["link", "file", "note"], default: "link" },
      },
    ],
    teacherNotes: { type: String, default: "" },
    completedAt: { type: Date },
  },
  { _id: true }
);

const schemeOfWorkSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    subject: { type: String, required: true },
    classArm: { type: String, required: true },
    session: { type: String, required: true },
    term: { type: String, required: true },
    topics: [topicSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
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

// One scheme per subject/class/term combination
schemeOfWorkSchema.index(
  { schoolId: 1, subject: 1, classArm: 1, session: 1, term: 1 },
  { unique: true }
);

const SchemeOfWork =
  mongoose.models.SchemeOfWork ||
  mongoose.model("SchemeOfWork", schemeOfWorkSchema);

export default SchemeOfWork;
