import mongoose from "mongoose";

const digestPrefSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    // The admin this preference belongs to — read state is per admin, so the
    // digest schedule is too.
    userId: { type: String, required: true },
    // off | daily | weekly — what the bell shows as the admin's digest schedule.
    frequency: { type: String, enum: ["off", "daily", "weekly"], default: "off" },
    lastSentAt: { type: Date, default: null },
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

// One preference per (school, admin).
digestPrefSchema.index({ schoolId: 1, userId: 1 }, { unique: true });

const DigestPref =
  mongoose.models.DigestPref || mongoose.model("DigestPref", digestPrefSchema);

export default DigestPref;
