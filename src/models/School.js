import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    logoUrl: { type: String, default: "" },
    brandColor: { type: String, default: "#2563EB" },
    activeArms: { type: [String], default: [] },
    currentSession: { type: String, default: "2025/2026" },
    currentTerm: { type: String, default: "First Term" },
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

const School =
  mongoose.models.School || mongoose.model("School", schoolSchema);

export default School;
