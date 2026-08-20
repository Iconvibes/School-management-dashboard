import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema(
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
      index: true,
    },
    // Web Push subscription data
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    // Device info for debugging
    userAgent: { type: String, default: "" },
    // Subscription lifecycle
    active: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
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

// One subscription per endpoint (unique device)
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
// Fast lookup for broadcasting to a school
pushSubscriptionSchema.index({ schoolId: 1, active: 1 });

const PushSubscription =
  mongoose.models.PushSubscription ||
  mongoose.model("PushSubscription", pushSubscriptionSchema);

export default PushSubscription;
