import mongoose from "mongoose";

const roleAuditSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    // Who did it (the signed-in super admin)
    actorId: { type: String, default: "" },
    actorName: { type: String, required: true },
    actorRole: { type: String, default: "" },
    // Whose role changed
    targetId: { type: String, default: "" },
    targetName: { type: String, default: "" },
    fromRole: { type: String, default: "" },
    toRole: { type: String, required: true },
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

// The trail is always read as "school, newest first".
roleAuditSchema.index({ schoolId: 1, createdAt: -1 });

const RoleAudit =
  mongoose.models.RoleAudit || mongoose.model("RoleAudit", roleAuditSchema);

export default RoleAudit;
