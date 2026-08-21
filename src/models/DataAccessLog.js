import mongoose from "mongoose";

/**
 * DataAccessLog — GDPR Article 30 (Records of Processing Activities)
 *
 * Every data access event is recorded: who accessed what data, when, and why.
 * Used for compliance auditing, consent tracking, and erasure execution logs.
 * Immutable once created — entries are never updated or deleted.
 */
const dataAccessLogSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    actorId: { type: String, default: "" },
    actorName: { type: String, default: "Unknown" },
    actorRole: { type: String, default: "" },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    detail: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
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

dataAccessLogSchema.index({ schoolId: 1, timestamp: -1 });
dataAccessLogSchema.index({ schoolId: 1, actorId: 1 });
dataAccessLogSchema.index({ schoolId: 1, action: 1, timestamp: -1 });

const DataAccessLog =
  mongoose.models.DataAccessLog ||
  mongoose.model("DataAccessLog", dataAccessLogSchema);

export default DataAccessLog;
