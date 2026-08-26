import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
  },
  { _id: true }
);

const assignmentSubmissionSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassResource",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    classArm: { type: String, required: true },
    subject: { type: String, required: true },
    // Student's submission content
    content: { type: String, default: "" },
    attachments: [attachmentSchema],
    // Grading (set by teacher)
    score: { type: Number, default: null },
    maxScore: { type: Number, default: null },
    grade: { type: String, default: null },
    feedback: { type: String, default: "" },
    gradedAt: { type: Date, default: null },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Status tracking
    status: {
      type: String,
      enum: ["submitted", "graded", "returned"],
      default: "submitted",
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

// Compound indexes for common queries
assignmentSubmissionSchema.index({ resourceId: 1, studentId: 1 }, { unique: true });
assignmentSubmissionSchema.index({ schoolId: 1, classArm: 1, subject: 1 });
assignmentSubmissionSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });

const AssignmentSubmission =
  mongoose.models.AssignmentSubmission ||
  mongoose.model("AssignmentSubmission", assignmentSubmissionSchema);

export default AssignmentSubmission;
