import mongoose from "mongoose";

const platformAlertSchema = new mongoose.Schema(
  {
    // Which school this alert relates to (null for platform-wide alerts)
    schoolId: { type: String, default: null },
    schoolName: { type: String, default: "" },
    // Alert category
    type: {
      type: String,
      enum: [
        "school_signup",        // new school registered
        "trial_started",        // school started a trial
        "trial_expiring",       // trial ending in ≤3 days
        "trial_expired",        // trial ended without payment
        "subscription_activated", // school subscribed to a paid plan
        "subscription_cancelled", // school cancelled subscription
        "subscription_past_due",  // payment failed / past due
        "school_frozen",        // school admin froze the school
        "school_deleted",       // school admin deleted the school
        "school_restored",      // deleted school was restored
        "impersonation",        // platform admin impersonated a school
        "system",               // system-level alert (maintenance, etc.)
      ],
      required: true,
    },
    // Severity
    severity: {
      type: String,
      enum: ["info", "warning", "critical", "success"],
      default: "info",
    },
    // Alert title (short)
    title: { type: String, required: true },
    // Alert message (detailed)
    message: { type: String, default: "" },
    // Whether the platform admin has read this alert
    read: { type: Boolean, default: false },
    // Extra metadata (plan name, student count, etc.)
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
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

platformAlertSchema.index({ createdAt: -1 });
platformAlertSchema.index({ read: 1 });
platformAlertSchema.index({ type: 1 });
platformAlertSchema.index({ schoolId: 1 });

const PlatformAlert =
  mongoose.models.PlatformAlert ||
  mongoose.model("PlatformAlert", platformAlertSchema);

export default PlatformAlert;
