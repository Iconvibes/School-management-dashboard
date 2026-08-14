import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { decryptField } from "@/lib/field-crypto";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Encrypted at rest (enc:v1 envelope) — the store encrypts on write. The
    // field is deliberately NOT lowercased/trimmed by the schema: envelopes
    // are case-sensitive base64url, so the schema must leave the value alone.
    email: {
      type: String,
      required: true,
    },
    // Deterministic HMAC of the normalized email — equality lookups (login,
    // dedupe) and the per-school unique index run on THIS, never on the
    // ciphertext. Never returned by the API (stripped in toJSON).
    emailIdx: {
      type: String,
      required: true,
      index: true,
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
    // Subject-specialist teaching model (Nigerian secondary schools): a
    // teacher is NOT locked to one arm — one Mathematics teacher covers all
    // twelve classes (JSS1–JSS3 plain + every SS stream), an English teacher
    // spans JSS1–JSS3 and all SS streams. `subjects` × `assignedClasses` IS
    // the teacher's scope; students keep the single `assignedClass`. Legacy
    // teachers (assignedClass set, arrays empty) keep working via a
    // single-arm fallback.
    subjects: { type: [String], default: [] },
    assignedClasses: { type: [String], default: [] },
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
    // Contact details — encrypted at rest like email (envelope, not plaintext).
    phone: { type: String, default: "" },
    phoneIdx: { type: String, default: "" },
    address: { type: String, default: "" },
    // The student's current login password, stored so the admin can look it
    // up from the dashboard (Students tab). Starts as the auto-generated
    // name + class arm value and is kept in sync whenever the student
    // changes it or an admin resets it. Empty for non-student accounts.
    generatedPassword: { type: String, default: "" },
    // Session-revocation counter: bumped on password change so every JWT
    // signed before the change is rejected by requireAuth on its next use.
    tokenVersion: { type: Number, default: 0 },
    // True once a TEACHER has set their own password. Until then their login
    // password is the school name (bootstrap); after a self-change the
    // school-name fallback turns OFF and only their own password works. An
    // admin reset flips it back to false. Irrelevant for other roles.
    passwordSet: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        // Decrypt the PII fields for API consumers; drop the blind indexes
        // (they would enable offline dictionary attacks on emails).
        ret.email = decryptField(ret.email) || "";
        ret.phone = decryptField(ret.phone) || "";
        delete ret.emailIdx;
        delete ret.phoneIdx;
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
// admin@x.com without clashing. The blind index (not the ciphertext — every
// encryption mints a fresh IV) enforces it.
userSchema.index({ schoolId: 1, emailIdx: 1 }, { unique: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
