import mongoose from "mongoose";

/**
 * Branch model for multi-branch school management.
 *
 * This is a DATA MODEL STUB — the schema is ready but the UI is not built yet.
 * When a school chain signs up, the admin can create branches and assign
 * students/teachers to specific branches. The cross-branch analytics dashboard
 * will be built on top of this.
 *
 * Each branch belongs to a school (schoolId). The school's main location
 * is the "default" branch (no branchId or branchId = null).
 */
const branchSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    name: { type: String, required: true }, // e.g. "Main Campus", "Branch B"
    code: { type: String }, // short code e.g. "MAIN", "BRB"
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    // Branch manager (optional)
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Status
    active: { type: Boolean, default: true },
    // Settings specific to this branch (overrides school defaults)
    settings: {
      brandColor: { type: String },
      logo: { type: String },
    },
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

branchSchema.index({ schoolId: 1, name: 1 });

const Branch =
  mongoose.models.Branch || mongoose.model("Branch", branchSchema);

export default Branch;
