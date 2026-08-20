import mongoose from "mongoose";

const channelPrefSchema = new mongoose.Schema(
  {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    push: { type: Boolean, default: true },
  },
  { _id: false }
);

const notificationPreferenceSchema = new mongoose.Schema(
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
    // Per-notification-type channel preferences
    feeReminder: { type: channelPrefSchema, default: () => ({ inApp: true, email: true, sms: false, whatsapp: false, push: true }) },
    reportCard: { type: channelPrefSchema, default: () => ({ inApp: true, email: true, sms: true, whatsapp: false, push: true }) },
    announcement: { type: channelPrefSchema, default: () => ({ inApp: true, email: true, sms: false, whatsapp: false, push: true }) },
    classResource: { type: channelPrefSchema, default: () => ({ inApp: true, email: false, sms: false, whatsapp: false, push: true }) },
    paymentConfirmation: { type: channelPrefSchema, default: () => ({ inApp: true, email: true, sms: true, whatsapp: false, push: true }) },
    readAhead: { type: channelPrefSchema, default: () => ({ inApp: true, email: false, sms: false, whatsapp: false, push: true }) },
    message: { type: channelPrefSchema, default: () => ({ inApp: true, email: false, sms: false, whatsapp: false, push: true }) },
    // Global override
    allDisabled: { type: Boolean, default: false },
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

notificationPreferenceSchema.index({ schoolId: 1, userId: 1 }, { unique: true });

const NotificationPreference =
  mongoose.models.NotificationPreference ||
  mongoose.model("NotificationPreference", notificationPreferenceSchema);

export default NotificationPreference;
