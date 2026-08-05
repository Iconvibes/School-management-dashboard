import mongoose from "mongoose";

/**
 * Marketing leads captured from the public site.
 * - kind "demo": a school requesting a demo via /contact
 * - kind "newsletter": an email subscribed on /blog
 * These are NOT tenant-scoped — they belong to Edutrack, the platform,
 * not to any individual school.
 */
const leadSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      required: true,
      enum: ["demo", "newsletter"],
      index: true,
    },
    name: { type: String, default: "", trim: true },
    school: { type: String, default: "", trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: { type: String, default: "", trim: true },
    size: { type: String, default: "", trim: true },
    interest: { type: String, default: "", trim: true },
    message: { type: String, default: "", trim: true },
    // Source IP for light abuse tracking / analytics
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
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

// A person can subscribe once per kind (dedupe newsletter signups).
leadSchema.index({ kind: 1, email: 1 }, { unique: true });

const Lead = mongoose.models.Lead || mongoose.model("Lead", leadSchema);

export default Lead;
