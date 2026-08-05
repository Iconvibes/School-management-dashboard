import mongoose from "mongoose";

const feeStructureSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    classArm: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    session: { type: String, required: true, default: "2025/2026" },
    term: { type: String, required: true, default: "First Term" },
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

// One fee structure per class arm per session+term per school
feeStructureSchema.index(
  { schoolId: 1, classArm: 1, session: 1, term: 1 },
  { unique: true }
);

const FeeStructure =
  mongoose.models.FeeStructure || mongoose.model("FeeStructure", feeStructureSchema);

export default FeeStructure;
