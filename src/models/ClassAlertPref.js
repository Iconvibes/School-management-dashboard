import mongoose from "mongoose";

/**
 * One teacher's class-alert preferences: whether their device should ring
 * when a class period is about to start, how early, and whether the chime
 * plays alongside the banner/notification. One row per (school, user), so
 * the setting follows the teacher across devices.
 */
const classAlertPrefSchema = new mongoose.Schema(
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
    enabled: { type: Boolean, default: false },
    leadMinutes: { type: Number, default: 5, min: 0, max: 30 },
    soundOn: { type: Boolean, default: true },
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

classAlertPrefSchema.index({ schoolId: 1, userId: 1 }, { unique: true });

const ClassAlertPref =
  mongoose.models.ClassAlertPref || mongoose.model("ClassAlertPref", classAlertPrefSchema);

export default ClassAlertPref;
