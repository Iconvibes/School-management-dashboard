import mongoose from "mongoose";

// One row of the school day — when period N actually starts and ends. The
// class-alert scheduler (and the admin period-times editor) read these; a
// school without one falls back to DEFAULT_PERIOD_TIMES.
const periodTimeSchema = new mongoose.Schema(
  {
    period: { type: Number, required: true, min: 1, max: 8 },
    start: { type: String, required: true }, // "HH:MM"
    end: { type: String, required: true }, // "HH:MM"
  },
  { _id: false }
);

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    logoUrl: { type: String, default: "" },
    // School seal / signature stamp image — printed on report cards next to
    // the logo (base64 data URL, same upload rules as logoUrl).
    sealUrl: { type: String, default: "" },
    brandColor: { type: String, default: "#2563EB" },
    // "active" | "frozen" | "deleted" — the dashboard danger zone drives
    // all three. "frozen" is soft deactivation (blocks all non-super-admin
    // logins, reactivatable). "deleted" is the 30-day grace state after the
    // admin deletes the school: data is kept and recoverable via restore
    // until deletedAt + SCHOOL_DELETION_GRACE_MS, when the sweeper purges it.
    status: { type: String, enum: ["active", "frozen", "deleted"], default: "active" },
    // When the school was deleted — the start of the recovery grace period.
    deletedAt: { type: Date, default: undefined },
    activeArms: { type: [String], default: [] },
    currentSession: { type: String, default: "2025/2026" },
    currentTerm: { type: String, default: "First Term" },
    // Optional override of the default school day (see getPeriodTimes).
    periodTimes: { type: [periodTimeSchema], default: undefined },
    // The school-wide mid-day break between period 4 and 5 ({ start, end }
    // "HH:MM", default 10:40-11:00 — see getBreakTime / getDayTimeline).
    // It is a display/alert concept, not a timetable entry.
    breakTimes: { type: { start: String, end: String }, default: undefined },
    // Per-weekday bell-schedule overrides: { [day]: { periodTimes?: […],
    // breakTimes?: {start,end} } }. A day with an override runs its OWN
    // schedule (e.g. Friday ends at period 6); days without one fall back to
    // the school-wide periodTimes/breakTimes. See getPeriodTimes(school, day)
    // and getDayTimeline(school, day).
    dailySchedules: { type: mongoose.Schema.Types.Mixed, default: undefined },
    // First-run wizard state: false until the founding SUPER_ADMIN saves the
    // onboarding steps (classes, session/term, branding). Once true, visiting
    // /onboarding sends them straight to the admin dashboard instead.
    onboardingComplete: { type: Boolean, default: false },
    // Per-school fee-reminder wording: { parent, student } templates with
    // {name}/{student}/{class}/{balance}/{school} placeholders. Blank = the
    // built-in copy (see src/lib/notifications.js). Set via
    // /api/school/reminder-templates and auto-saved by the Send reminder flow.
    reminderTemplates: { type: mongoose.Schema.Types.Mixed, default: undefined },
    // How old a notification must be (in days) before the admin inbox
    // auto-archives it — age-based, so the inbox stays lean while history
    // remains viewable from the bell's Archived tab. Parent/student reminder
    // copies are never affected.
    notificationRetentionDays: { type: Number, default: 90, min: 1, max: 3650 },
    // Whether reminders the admin deleted from the inbox should STILL appear
    // in the Reconcile & forward list (eligible to be forwarded once the
    // student's parent is linked). Default false: deleted means hidden from
    // every staff view, including reconcile.
    reconcileDeletedReminders: { type: Boolean, default: false },
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
