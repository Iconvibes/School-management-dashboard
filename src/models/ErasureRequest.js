import mongoose from "mongoose";

/**
 * ErasureRequest — GDPR Article 17 (Right to Erasure)
 *
 * A user requests permanent deletion of their personal data. The request
 * goes through: PENDING → APPROVED → EXECUTED, or PENDING → REJECTED.
 * Only approved requests are executed (cascade-deletes user data).
 */
const erasureRequestSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: { type: String, default: "Unknown" },
    reason: { type: String, default: "" },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "EXECUTED"],
      default: "PENDING",
      index: true,
    },
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    executedAt: { type: Date, default: null },
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

// One active (non-rejected) request per user per school
erasureRequestSchema.index({ schoolId: 1, userId: 1, status: 1 });
erasureRequestSchema.index({ schoolId: 1, status: 1, requestedAt: -1 });

const ErasureRequest =
  mongoose.models.ErasureRequest ||
  mongoose.model("ErasureRequest", erasureRequestSchema);

export default ErasureRequest;
