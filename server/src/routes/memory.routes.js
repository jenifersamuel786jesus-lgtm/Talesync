import express from "express";
import mongoose from "mongoose";
import authMiddleware from "../middleware/auth.js";
import optionalAuth from "../middleware/optionalAuth.js";
import Memory from "../models/Memory.js";
import asyncHandler from "../utils/asyncHandler.js";
import { buildAudioPlaybackUrl } from "../utils/audioAccess.js";

const router = express.Router();

function mapMemoryForResponse(memory, req, exposeAudio = true) {
  const output = { ...memory };
  output.audioUrl = buildAudioPlaybackUrl(memory, req, { expose: exposeAudio });
  return output;
}

router.post("/", authMiddleware, asyncHandler(async (req, res) => {
  const { title, isPublic } = req.body || {};
  const memory = await Memory.create({
    userId: req.user.id,
    userName: req.user.name,
    title: (title || "").trim().slice(0, 120),
    isPublic: typeof isPublic === "boolean" ? isPublic : true,
    status: "uploaded",
    processingError: "",
    entities: { people: [], places: [], dates: [] }
  });

  return res.status(201).json({ memoryId: memory._id.toString() });
}));

router.get("/me", authMiddleware, asyncHandler(async (req, res) => {
  const memories = await Memory.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
  return res.json({ memories: memories.map((m) => mapMemoryForResponse(m, req, true)) });
}));

router.get("/public/feed", optionalAuth, asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const query = {
    status: "completed",
    $or: [{ isPublic: true }, { isPublic: { $exists: false } }]
  };

  if (userId) {
    query.userId = { $ne: userId };
  }

  const memories = await Memory.find(query)
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  return res.json({ memories: memories.map((m) => mapMemoryForResponse(m, req, true)) });
}));

router.patch("/:id/visibility", authMiddleware, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid memory id" });
  }

  const { isPublic } = req.body;
  const memory = await Memory.findById(req.params.id);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });

  memory.isPublic = Boolean(isPublic);
  await memory.save();

  const raw = memory.toObject();
  raw.audioUrl = buildAudioPlaybackUrl(raw, req, { expose: true });
  return res.json({ memory: raw });
}));

router.delete("/:id", authMiddleware, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid memory id" });
  }

  const memory = await Memory.findById(req.params.id);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });

  await memory.deleteOne();
  return res.json({ ok: true });
}));

router.get("/public/story/:id", asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid memory id" });
  }

  const memory = await Memory.findById(req.params.id).lean();
  if (!memory) return res.status(404).json({ message: "Memory not found" });

  const canViewPublic = (memory.isPublic ?? true) && memory.status === "completed";
  if (!canViewPublic) return res.status(403).json({ message: "Not public" });

  return res.json({ memory: mapMemoryForResponse(memory, req, true) });
}));

router.get("/:id", authMiddleware, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid memory id" });
  }

  const memory = await Memory.findById(req.params.id).lean();
  if (!memory) return res.status(404).json({ message: "Memory not found" });

  const isOwner = memory.userId.toString() === req.user.id;
  const canViewPublic = (memory.isPublic ?? true) && memory.status === "completed";
  if (!isOwner && !canViewPublic) return res.status(403).json({ message: "Forbidden" });

  return res.json({ memory: mapMemoryForResponse(memory, req, true) });
}));

export default router;
