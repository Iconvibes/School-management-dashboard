import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      required: true,
      enum: ["SUPER_ADMIN", "BURSAR", "REGISTRAR", "TEACHER", "STUDENT", "PARENT"],
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    assignedClass: { type: String, default: "" },
    payrollStatus: {
      type: String,
      enum: ["PAID", "PENDING"],
      default: "PENDING",
    },
    feePaid: { type: Boolean, default: false },
    // For STUDENT records: links the student to their PARENT account
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Contact details useful for parents/students
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Emails are unique WITHIN a school, not globally — two tenants can each use
// admin@x.com without clashing. This compound index enforces it.
userSchema.index({ schoolId: 1, email: 1 }, { unique: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
