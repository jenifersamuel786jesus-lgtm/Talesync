import mongoose from "mongoose";

const memorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, required: true },
    title: { type: String, default: "" },
    audioUrl: { type: String },
    audioMimeType: { type: String, default: "audio/webm" },
    audioDurationSec: { type: Number, default: 0 },
    audioStorage: { type: String, enum: ["cloudinary", "local", "legacy"], default: "legacy" },
    audioPublicId: { type: String, default: "" },
    audioFileName: { type: String, default: "" },
    transcript: { type: String, default: "" },
    entities: {
      people: [{ type: String }],
      places: [{ type: String }],
      dates: [{ type: String }]
    },
    topic: { type: String, default: "" },
    embedding: [{ type: Number }],
    relatedMemoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Memory" }],
    isPublic: { type: Boolean, default: true },
    processingError: { type: String, default: "" },
    status: {
      type: String,
      enum: ["uploaded", "processing", "completed", "failed"],
      default: "uploaded"
    }
  },
  { timestamps: true }
);

memorySchema.index({ transcript: "text", topic: 1 });

export default mongoose.model("Memory", memorySchema);
