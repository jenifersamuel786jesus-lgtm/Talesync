import express from "express";
import fs from "fs/promises";
import multer from "multer";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import Memory from "../models/Memory.js";
import { uploadAudioBuffer } from "../services/cloudinary.js";
import { updateMemoryChain } from "../services/memoryChain.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  canAccessMemoryAudio,
  resolveWorkerAudioUrl,
  verifyAudioStreamToken,
  isSafeIncomingAudioUrl
} from "../utils/audioAccess.js";

const router = express.Router();
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "../../uploads");

function getRequesterUserId(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return "";

  try {
    const token = header.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload?.id || "";
  } catch {
    return "";
  }
}

async function callWorker(memory, req) {
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) {
    throw new Error("Worker URL is not configured. Set WORKER_URL in server/.env");
  }
  if (!process.env.WORKER_SECRET) {
    throw new Error("Worker secret is not configured. Set WORKER_SECRET in server/.env");
  }

  const audioUrl = resolveWorkerAudioUrl(memory, req);
  if (!audioUrl || !isSafeIncomingAudioUrl(audioUrl)) {
    throw new Error("Invalid or unsafe worker audio URL");
  }

  const call = async (baseUrl) => {
    const response = await fetch(`${baseUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": process.env.WORKER_SECRET
      },
      body: JSON.stringify({ memoryId: memory._id.toString(), audioUrl })
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      const detail = bodyText ? ` ${bodyText.slice(0, 300)}` : "";
      throw new Error(`Worker HTTP ${response.status}.${detail}`);
    }
  };

  try {
    await call(workerUrl);
  } catch (err) {
    const canRetryIpv4 = workerUrl.includes("://localhost:");
    if (canRetryIpv4) {
      const ipv4WorkerUrl = workerUrl.replace("://localhost:", "://127.0.0.1:");
      try {
        await call(ipv4WorkerUrl);
        return;
      } catch (retryErr) {
        const msg = retryErr?.message || "unknown worker error";
        throw new Error(`Worker unreachable at ${ipv4WorkerUrl}/process: ${msg}`);
      }
    }

    const msg = err?.message || "unknown worker error";
    throw new Error(`Worker unreachable at ${workerUrl}/process: ${msg}`);
  }
}

router.get("/stream/:memoryId", asyncHandler(async (req, res) => {
  const { memoryId } = req.params;
  if (!mongoose.isValidObjectId(memoryId)) {
    return res.status(400).json({ message: "Invalid memory id" });
  }

  const memory = await Memory.findById(memoryId).lean();
  if (!memory) return res.status(404).json({ message: "Memory not found" });

  const tokenAuthorized = verifyAudioStreamToken(String(req.query.token || ""), memoryId);
  const requesterUserId = getRequesterUserId(req);
  const accessAllowed = tokenAuthorized || canAccessMemoryAudio(memory, requesterUserId);
  if (!accessAllowed) return res.status(403).json({ message: "Forbidden" });

  if (memory.audioStorage === "local" && memory.audioFileName) {
    const safeName = path.basename(memory.audioFileName);
    const diskPath = path.join(uploadsDir, safeName);
    return res.sendFile(diskPath);
  }

  if (memory.audioStorage === "legacy" && memory.audioUrl) {
    try {
      const parsed = new URL(memory.audioUrl);
      if (parsed.pathname.startsWith("/uploads/")) {
        const safeName = path.basename(parsed.pathname);
        const diskPath = path.join(uploadsDir, safeName);
        return res.sendFile(diskPath);
      }
      return res.redirect(memory.audioUrl);
    } catch {
      // Ignore parse errors and continue to not-found response.
    }
  }

  return res.status(404).json({ message: "Audio source not found" });
}));

router.post("/audio", authMiddleware, upload.single("audio"), asyncHandler(async (req, res) => {
  const { memoryId } = req.body;
  if (!memoryId || !mongoose.isValidObjectId(memoryId)) return res.status(400).json({ message: "memoryId is required" });
  if (!req.file) return res.status(400).json({ message: "audio file is required" });

  const memory = await Memory.findById(memoryId);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });

  try {
    const uploaded = await uploadAudioBuffer(req.file.buffer, {
      folder: `talesync/memories/${req.user.id}`,
      publicId: memory._id.toString()
    });

    memory.audioUrl = uploaded.secure_url;
    memory.audioStorage = "cloudinary";
    memory.audioPublicId = uploaded.public_id || memory._id.toString();
    memory.audioFileName = "";
    memory.audioMimeType = req.file.mimetype || "audio/webm";
    await memory.save();

    return res.json({
      ok: true,
      audioMimeType: memory.audioMimeType,
      storage: "cloudinary"
    });
  } catch (cloudErr) {
    await fs.mkdir(uploadsDir, { recursive: true });
    const ext = req.file.mimetype?.includes("mp4") ? "m4a" : req.file.mimetype?.includes("ogg") ? "ogg" : "webm";
    const fileName = `${memory._id.toString()}.${ext}`;
    const diskPath = path.join(uploadsDir, fileName);
    await fs.writeFile(diskPath, req.file.buffer);

    memory.audioUrl = `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
    memory.audioStorage = "local";
    memory.audioPublicId = "";
    memory.audioFileName = fileName;
    memory.audioMimeType = req.file.mimetype || "audio/webm";
    await memory.save();

    return res.json({
      ok: true,
      audioMimeType: memory.audioMimeType,
      storage: "local-fallback",
      warning: `Cloudinary failed: ${cloudErr.message}`
    });
  }
}));

router.post("/complete", authMiddleware, asyncHandler(async (req, res) => {
  const { memoryId, audioMimeType, audioDurationSec } = req.body || {};
  if (!memoryId || !mongoose.isValidObjectId(memoryId)) {
    return res.status(400).json({ message: "memoryId is required" });
  }

  const memory = await Memory.findById(memoryId);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });
  if (!memory.audioStorage || (memory.audioStorage === "local" && !memory.audioFileName)) {
    return res.status(400).json({ message: "Audio upload missing. Upload audio first." });
  }

  memory.audioMimeType = audioMimeType || memory.audioMimeType || "audio/webm";
  memory.audioDurationSec = audioDurationSec || 0;
  memory.status = "processing";
  memory.processingError = "";
  await memory.save();

  callWorker(memory, req).catch((err) => {
    console.error("Worker call failed", err.message);
    Memory.findByIdAndUpdate(
      memory._id,
      {
        $set: {
          status: "failed",
          processingError: err.message
        },
        $currentDate: { updatedAt: true }
      }
    ).catch(() => {});
  });

  return res.json({ memory });
}));

router.post("/worker-callback/:memoryId", asyncHandler(async (req, res) => {
  const secret = req.headers["x-worker-secret"];
  if (!secret || secret !== process.env.WORKER_SECRET) return res.status(401).json({ message: "Unauthorized" });
  if (!mongoose.isValidObjectId(req.params.memoryId)) return res.status(400).json({ message: "Invalid memory id" });

  const { transcript, entities, topic, embedding, status, processingError } = req.body || {};

  const memory = await Memory.findByIdAndUpdate(
    req.params.memoryId,
    {
      transcript,
      entities,
      topic,
      embedding,
      processingError: processingError || "",
      status: status || "completed"
    },
    { new: true }
  );

  if (!memory) return res.status(404).json({ message: "Memory not found" });

  if ((status || "completed") === "completed") {
    updateMemoryChain(memory._id).catch((err) => console.error("Chain update failed", err.message));
  }

  return res.json({ ok: true });
}));

router.post("/retry/:memoryId", authMiddleware, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.memoryId)) return res.status(400).json({ message: "Invalid memory id" });

  const memory = await Memory.findById(req.params.memoryId);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });

  const audioUrl = resolveWorkerAudioUrl(memory, req);
  if (!audioUrl || !isSafeIncomingAudioUrl(audioUrl)) {
    return res.status(400).json({ message: "Missing or invalid audio source" });
  }

  memory.status = "processing";
  memory.processingError = "";
  await memory.save();

  callWorker(memory, req).catch((err) => {
    console.error("Worker retry failed", err.message);
    Memory.findByIdAndUpdate(
      memory._id,
      {
        $set: {
          status: "failed",
          processingError: err.message
        },
        $currentDate: { updatedAt: true }
      }
    ).catch(() => {});
  });

  return res.json({ ok: true });
}));

export default router;
