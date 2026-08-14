import mongoose from "mongoose";

/**
 * One recorded fee-reminder send — the idempotency record that makes a retry
 * or a double rollover incapable of notifying the same parent twice.
 *
 * Every send (manual "Send reminders" in Fee Management, and the automatic
 * reminders fired at term rollover) is recorded here with an idempotency
 * `key`, scoped to (schoolId, kind, key):
 *
 *   - manual sends use a client-generated batchId (a UUID per send attempt);
 *     replaying the same batchId returns the stored result instead of
 *     re-notifying anyone.
 *   - rollover sends use a deterministic key derived from the new session +
 *     term, so a re-run of the same rollover can never re-notify.
 *
 * `result` holds the full send response ({ sent, skipped, total }), replayed
 * verbatim when the same key comes back.
 */
const reminderBatchSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    kind: { type: String, enum: ["manual", "rollover"], required: true },
    // Idempotency key — a client UUID for manual sends, or the deterministic
    // "rollover:<session>:<term>" key for term rollovers. One batch per key.
    key: { type: String, required: true },
    // Human context, e.g. "2025/2026 · Second Term" for a rollover batch.
    context: { type: String, default: "" },
    // The students this batch reminded (their ids at send time).
    studentIds: { type: [String], default: [] },
    // The full send result — replayed verbatim when the same key returns.
    result: { type: mongoose.Schema.Types.Mixed },
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

// Idempotency gate: at most ONE batch per (school, kind, key). The upsert in
// saveReminderBatch leans on this so a concurrent duplicate request can never
// create two records for the same key.
reminderBatchSchema.index(
  { schoolId: 1, kind: 1, key: 1 },
  { unique: true }
);

const ReminderBatch =
  mongoose.models.ReminderBatch || mongoose.model("ReminderBatch", reminderBatchSchema);

export default ReminderBatch;
