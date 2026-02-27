import express from "express";
import authMiddleware from "../middleware/auth.js";
import Memory from "../models/Memory.js";

const router = express.Router();

router.get("/:id", authMiddleware, async (req, res) => {
  const memory = await Memory.findById(req.params.id).lean();
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  const isOwner = memory.userId.toString() === req.user.id;
  const canViewPublic = (memory.isPublic ?? true) && memory.status === "completed";
  if (!isOwner && !canViewPublic) return res.status(403).json({ message: "Forbidden" });

  const related = await Memory.find({
    _id: { $in: memory.relatedMemoryIds || [] },
    status: "completed",
    $or: [{ userId: req.user.id }, { isPublic: true }, { isPublic: { $exists: false } }]
  })
    .select("topic transcript entities userName createdAt")
    .lean();

  return res.json({ related });
});

export default router;
