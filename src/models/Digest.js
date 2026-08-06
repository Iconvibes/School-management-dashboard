import mongoose from "mongoose";

const digestSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    // Which admin this digest was composed for.
    userId: { type: String, required: true },
    frequency: { type: String, enum: ["daily", "weekly"], default: "daily" },
    // The email-style record, exactly what buildDigestEmail produced.
    subject: { type: String, required: true },
    preview: { type: String, required: true },
    body: { type: String, default: "" },
    itemCount: { type: Number, default: 0 },
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

// Digest history is always read as "school, admin, newest first".
digestSchema.index({ schoolId: 1, userId: 1, createdAt: -1 });

const Digest = mongoose.models.Digest || mongoose.model("Digest", digestSchema);

export default Digest;
