import mongoose from "mongoose";

/**
 * One school's most recent timetable-conflict scan — the persisted state
 * behind the admin Overview's Schedule Health card and the daily auto-scan.
 *
 * One row per school (upserted on every scan). `conflicts` holds the full
 * resolved conflict objects (with teacher names) so a fresh health read is a
 * pure lookup, and `conflictKeys` (stable identities, see conflictKey() in
 * src/lib/timetable.js) is what the NEXT scan diffs against to answer "are
 * there NEW collisions since yesterday?" — `newConflictKeys` records that
 * answer at scan time.
 */
const conflictScanSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      unique: true,
      index: true,
    },
    lastRunAt: { type: Date, required: true },
    conflicts: { type: mongoose.Schema.Types.Mixed, default: { teacher: [], arm: [] } },
    conflictKeys: { type: [String], default: [] },
    newConflictKeys: { type: [String], default: [] },
    // Every slot (`classArm|day|period`) EVER flagged by a scan. Unioned
    // across scans on purpose — a resolved conflict stays flagged so the
    // admin is warned if the slot is ever reassigned (no silent regression).
    flaggedSlots: { type: [String], default: [] },
    // Per-day conflict counts (`{ date, conflictCount, newCount }`, ascending
    // by date, capped) — the Schedule Health card's trend sparkline. One
    // point per day: a same-day manual scan replaces the day's entry.
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
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

const ConflictScan =
  mongoose.models.ConflictScan || mongoose.model("ConflictScan", conflictScanSchema);

export default ConflictScan;
