import express from "express";
import authMiddleware from "../middleware/auth.js";
import Memory from "../models/Memory.js";

const router = express.Router();

router.post("/", authMiddleware, async (req, res) => {
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
});

router.get("/me", authMiddleware, async (req, res) => {
  const memories = await Memory.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
  return res.json({ memories });
});

router.get("/public/feed", authMiddleware, async (req, res) => {
  // Get user ID if authenticated, otherwise exclude user's own memories check
  const userId = req.user?.id;
  
  const query = {
    status: "completed",
    $or: [{ isPublic: true }, { isPublic: { $exists: false } }]
  };
  
  // Exclude current user's memories if authenticated
  if (userId) {
    query.userId = { $ne: userId };
  }
  
  const memories = await Memory.find(query)
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();
  return res.json({ memories });
});

router.patch("/:id/visibility", authMiddleware, async (req, res) => {
  const { isPublic } = req.body;
  const memory = await Memory.findById(req.params.id);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });
  memory.isPublic = Boolean(isPublic);
  await memory.save();
  return res.json({ memory });
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const memory = await Memory.findById(req.params.id);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });
  await memory.deleteOne();
  return res.json({ ok: true });
});

router.get("/public/story/:id", async (req, res) => {
  const memory = await Memory.findById(req.params.id).lean();
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  const canViewPublic = (memory.isPublic ?? true) && memory.status === "completed";
  if (!canViewPublic) return res.status(403).json({ message: "Not public" });
  return res.json({ memory });
});

router.get("/:id", authMiddleware, async (req, res) => {
  const memory = await Memory.findById(req.params.id).lean();
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  const isOwner = memory.userId.toString() === req.user.id;
  const canViewPublic = (memory.isPublic ?? true) && memory.status === "completed";
  if (!isOwner && !canViewPublic) return res.status(403).json({ message: "Forbidden" });
  return res.json({ memory });
});

export default router;
