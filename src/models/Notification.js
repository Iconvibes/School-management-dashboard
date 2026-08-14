import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    // What happened — lets the UI theme the icon (e.g. "fee_payment").
    kind: { type: String, default: "info" },
    // Recipient addresses (the school's admin accounts). Stored so a real
    // SMTP transport can pick them up later.
    to: [{ type: String }],
    subject: { type: String, required: true },
    preview: { type: String, required: true },
    body: { type: String, default: "" },
    // Optional money fact (e.g. a fee reminder's outstanding balance) so the
    // reconcile flow can forward the LATEST amount without re-parsing text.
    amount: { type: Number, default: undefined },
    // Set when a fee reminder was forwarded to a newly linked parent — a
    // reminder is never forwarded twice.
    reconciledAt: { type: Date, default: undefined },
    // Per-admin read state: the user ids that have read this notification.
    // The legacy school-wide `read: true` is migrated to a "*" sentinel,
    // meaning every admin counts as having read it. Each admin therefore sees
    // their OWN unread count, not the school's shared one.
    readBy: [{ type: String }],
    // SOFT delete for the admin inbox: when an admin deletes a notification,
    // it is stamped here instead of removed. Staff inbox queries hide it, but
    // a parent's or student's own reminder copy stays visible — deleting from
    // the admin's view never unsends a reminder. Absent = not deleted.
    adminDeletedAt: { type: Date, default: undefined },
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

// The inbox query is always "school, newest first, optionally unread only".
notificationSchema.index({ schoolId: 1, createdAt: -1 });

const Notification =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

export default Notification;
