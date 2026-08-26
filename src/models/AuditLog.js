import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    // Action type
    action: {
      type: String,
      enum: [
        "impersonate",         // platform admin impersonated a school admin
        "plan_change",         // school plan was changed
        "subscription_activate", // school subscription activated
        "subscription_cancel",   // school subscription cancelled
        "school_status_change",  // school frozen/unfrozen
        "school_created",        // new school registered
        "school_deleted",        // school deleted
        "alert_created",         // platform alert created
        "config_change",         // platform config changed
      ],
      required: true,
      index: true,
    },
    // Who performed the action
    actor: { type: String, required: true, index: true },
    // Which school was affected (null for platform-wide actions)
    schoolId: { type: String, default: null, index: true },
    schoolName: { type: String, default: "" },
    // Human-readable description
    description: { type: String, default: "" },
    // Extra metadata (old/new values, IP, etc.)
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    // IP address of the actor
    ip: { type: String, default: null },
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

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog =
  mongoose.models.AuditLog ||
  mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
