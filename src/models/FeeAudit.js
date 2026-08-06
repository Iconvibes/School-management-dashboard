import mongoose from "mongoose";

const feeAuditSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    // What happened: PAYMENT_RECORDED | PAYMENT_CONFIRMED |
    // PARENT_PAYMENT_SUBMITTED | RECEIPT_DOWNLOADED
    action: { type: String, required: true },
    // Who did it (the signed-in user; seeded/system events use "System")
    actorId: { type: String, default: "" },
    actorName: { type: String, required: true },
    actorRole: { type: String, default: "" },
    // The student the money is for
    studentId: { type: String, default: "" },
    studentName: { type: String, default: "" },
    classArm: { type: String, default: "" },
    receiptNo: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    method: { type: String, default: "" },
    note: { type: String, default: "" },
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

// The trail is always read as "school, newest first" — reconciliation lists
// the most recent fee action at the top.
feeAuditSchema.index({ schoolId: 1, createdAt: -1 });

const FeeAudit =
  mongoose.models.FeeAudit || mongoose.model("FeeAudit", feeAuditSchema);

export default FeeAudit;
