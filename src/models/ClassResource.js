import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
  },
  { _id: true }
);

const classResourceSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    classArm: { type: String, required: true },
    subject: { type: String, required: true },
    type: {
      type: String,
      enum: ["note", "assignment", "reading", "video", "other"],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    content: { type: String, default: "" }, // rich text or markdown content
    attachments: [attachmentSchema],
    // For assignments: due date and grading
    dueDate: { type: Date },
    maxScore: { type: Number },
    // For read-ahead notifications
    isReadAhead: { type: Boolean, default: false },
    readAheadDate: { type: Date },
    // Visibility
    published: { type: Boolean, default: true },
    publishedAt: { type: Date },
    // For OCR-captured notes
    ocrSource: {
      imageUrl: { type: String },
      ocrText: { type: String },
      confidence: { type: Number },
    },
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

classResourceSchema.index({ schoolId: 1, classArm: 1, subject: 1, createdAt: -1 });
classResourceSchema.index({ schoolId: 1, teacherId: 1, createdAt: -1 });

const ClassResource =
  mongoose.models.ClassResource ||
  mongoose.model("ClassResource", classResourceSchema);

export default ClassResource;
