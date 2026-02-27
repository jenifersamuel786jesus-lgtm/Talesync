import express from "express";
import mongoose from "mongoose";
import authMiddleware from "../middleware/auth.js";
import Memory from "../models/Memory.js";
import asyncHandler from "../utils/asyncHandler.js";
import { cosineSimilarity } from "../utils/vector.js";

const router = express.Router();

router.get("/:id", authMiddleware, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid memory id" });
  }

  const memory = await Memory.findById(req.params.id).lean();
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  const isOwner = memory.userId.toString() === req.user.id;
  const canViewPublic = (memory.isPublic ?? true) && memory.status === "completed";
  if (!isOwner && !canViewPublic) return res.status(403).json({ message: "Forbidden" });

  let related = [];
  const hasStoredChain = Array.isArray(memory.relatedMemoryIds) && memory.relatedMemoryIds.length > 0;

  if (hasStoredChain) {
    related = await Memory.find({
      _id: { $in: memory.relatedMemoryIds || [] },
      status: "completed",
      $or: [{ userId: req.user.id }, { isPublic: true }, { isPublic: { $exists: false } }]
    })
      .select("topic transcript entities userName createdAt")
      .lean();
  }

  // Fallback for older memories that never had relatedMemoryIds backfilled.
  if (!related.length && Array.isArray(memory.embedding) && memory.embedding.length > 0) {
    const candidates = await Memory.find({
      _id: { $ne: memory._id },
      status: "completed",
      embedding: { $exists: true, $not: { $size: 0 } },
      $or: [{ userId: req.user.id }, { isPublic: true }, { isPublic: { $exists: false } }]
    })
      .select("topic transcript entities userName createdAt embedding")
      .limit(120)
      .lean();

    related = candidates
      .map((item) => ({ item, score: cosineSimilarity(memory.embedding, item.embedding || []) }))
      .filter((entry) => entry.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => {
        const output = { ...entry.item };
        delete output.embedding;
        return output;
      });
  }

  return res.json({ related });
}));

export default router;
