import mongoose from "mongoose";

const feePaymentSchema = new mongoose.Schema(
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
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ["CASH", "TRANSFER", "CARD", "POS", "USSD", "OTHER"],
      default: "CASH",
    },
    receiptNo: { type: String, required: true },
    session: { type: String, required: true, default: "2025/2026" },
    term: { type: String, required: true, default: "First Term" },
    note: { type: String, default: "" },
    // "PENDING" = parent paid online, awaiting the school's confirmation.
    // Only CONFIRMED payments count toward a student's balance.
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED"],
      default: "CONFIRMED",
    },
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

feePaymentSchema.index({ schoolId: 1, receiptNo: 1 }, { unique: true });

const FeePayment =
  mongoose.models.FeePayment || mongoose.model("FeePayment", feePaymentSchema);

export default FeePayment;
