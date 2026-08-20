import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    // Conversation participants
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Optional: link to a student (for context)
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Message content
    subject: { type: String, default: "" },
    body: { type: String, required: true },
    // Read state
    read: { type: Boolean, default: false },
    readAt: { type: Date },
    // Message type
    type: {
      type: String,
      enum: ["direct", "announcement", "fee_reminder", "academic"],
      default: "direct",
    },
    // Threading (reply to a message)
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    // Attachments
    attachments: [
      {
        filename: { type: String },
        url: { type: String },
        mimeType: { type: String },
      },
    ],
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

// Conversation index: messages between two users, newest first
messageSchema.index({ schoolId: 1, from: 1, to: 1, createdAt: -1 });
messageSchema.index({ schoolId: 1, to: 1, read: 1, createdAt: -1 });

const Message =
  mongoose.models.Message || mongoose.model("Message", messageSchema);

export default Message;
