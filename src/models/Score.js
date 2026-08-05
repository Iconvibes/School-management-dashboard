import mongoose from "mongoose";
import { computeGrade } from "@/lib/grading";

const scoreSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    subject: { type: String, required: true, trim: true },
    classArm: { type: String, required: true },
    caScore: { type: Number, min: 0, max: 40, default: 0 },
    examScore: { type: Number, min: 0, max: 60, default: 0 },
    totalScore: { type: Number, min: 0, max: 100, default: 0 },
    grade: { type: String, enum: ["A", "B", "C", "D", "F"], default: "F" },
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

// One score record per student + subject within a class arm
scoreSchema.index({ studentId: 1, subject: 1, classArm: 1 }, { unique: true });

scoreSchema.pre("validate", function (next) {
  this.totalScore = Math.min(100, Math.max(0, this.caScore + this.examScore));
  this.grade = computeGrade(this.totalScore);
  next();
});

const Score = mongoose.models.Score || mongoose.model("Score", scoreSchema);

export default Score;
