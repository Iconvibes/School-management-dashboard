import mongoose from "mongoose";

/**
 * Unpaid fee balance carried from a previous term into the new one, created
 * at term rollover for every student whose old-term balance was still > 0.
 *
 * The carried amount is ADDED to the student's new-term fee, so the ledger's
 * billed amount = this term's structure + carried balance. Keyed uniquely by
 * (schoolId, studentId, session, term) — one row per student per new term.
 */
const feeCarryoverSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    session: { type: String, required: true, default: "2025/2026" },
    term: { type: String, required: true, default: "First Term" },
    amount: { type: Number, required: true, min: 0 },
    // Which term the balance came from (for the archive / audit trail).
    fromSession: { type: String, required: true },
    fromTerm: { type: String, required: true },
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

// One carryover row per student per session+term per school.
feeCarryoverSchema.index(
  { schoolId: 1, studentId: 1, session: 1, term: 1 },
  { unique: true }
);

const FeeCarryover =
  mongoose.models.FeeCarryover || mongoose.model("FeeCarryover", feeCarryoverSchema);

export default FeeCarryover;
