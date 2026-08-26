import mongoose from "mongoose";

const healthMetricSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["api_response", "error", "db_size", "memory", "cpu"],
      required: true,
      index: true,
    },
    endpoint: { type: String, default: null },
    method: { type: String, default: null },
    value: { type: Number, default: null },
    statusCode: { type: Number, default: null },
    errorMessage: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
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

healthMetricSchema.index({ createdAt: -1 });
healthMetricSchema.index({ type: 1, createdAt: -1 });

const HealthMetric =
  mongoose.models.HealthMetric ||
  mongoose.model("HealthMetric", healthMetricSchema);

export default HealthMetric;
