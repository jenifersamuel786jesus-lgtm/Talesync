import express from "express";
import fs from "fs/promises";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import authMiddleware from "../middleware/auth.js";
import Memory from "../models/Memory.js";
import { uploadAudioBuffer } from "../services/cloudinary.js";
import { updateMemoryChain } from "../services/memoryChain.js";

const router = express.Router();
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "../../uploads");

async function callWorker(memoryId, audioUrl) {
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) {
    throw new Error("Worker URL is not configured. Set WORKER_URL in server/.env");
  }
  if (!process.env.WORKER_SECRET) {
    throw new Error("Worker secret is not configured. Set WORKER_SECRET in server/.env");
  }

  const call = async (baseUrl) => {
    const response = await fetch(`${baseUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": process.env.WORKER_SECRET
      },
      body: JSON.stringify({ memoryId, audioUrl })
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
    // On some Windows setups Node resolves "localhost" to IPv6 (::1)
    // while uvicorn binds only IPv4 (0.0.0.0), which causes fetch failed.
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

router.post("/audio", authMiddleware, upload.single("audio"), asyncHandler(async (req, res) => {
  const { memoryId } = req.body;
  if (!memoryId) return res.status(400).json({ message: "memoryId is required" });
  if (!req.file) return res.status(400).json({ message: "audio file is required" });

  const memory = await Memory.findById(memoryId);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });

  try {
    const uploaded = await uploadAudioBuffer(req.file.buffer, {
      folder: `talesync/memories/${req.user.id}`,
      publicId: memory._id.toString(),
      mimeType: req.file.mimetype
    });

    return res.json({
      audioUrl: uploaded.secure_url,
      audioMimeType: req.file.mimetype || "audio/webm",
      storage: "cloudinary"
    });
  } catch (cloudErr) {
    await fs.mkdir(uploadsDir, { recursive: true });
    const ext = req.file.mimetype?.includes("mp4") ? "m4a" : req.file.mimetype?.includes("ogg") ? "ogg" : "webm";
    const fileName = `${memory._id.toString()}.${ext}`;
    const diskPath = path.join(uploadsDir, fileName);
    await fs.writeFile(diskPath, req.file.buffer);

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return res.json({
      audioUrl: `${baseUrl}/uploads/${fileName}`,
      audioMimeType: req.file.mimetype || "audio/webm",
      storage: "local-fallback",
      warning: `Cloudinary failed: ${cloudErr.message}`
    });
  }
}));

router.post("/complete", authMiddleware, asyncHandler(async (req, res) => {
  const { memoryId, audioUrl, audioMimeType, audioDurationSec } = req.body;
  const memory = await Memory.findById(memoryId);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });

  memory.audioUrl = audioUrl;
  memory.audioMimeType = audioMimeType || "audio/webm";
  memory.audioDurationSec = audioDurationSec || 0;
  memory.status = "processing";
  memory.processingError = "";
  await memory.save();

  callWorker(memory._id.toString(), memory.audioUrl).catch((err) => {
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

  const { transcript, entities, topic, embedding, status, processingError } = req.body;

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
  const memory = await Memory.findById(req.params.memoryId);
  if (!memory) return res.status(404).json({ message: "Memory not found" });
  if (memory.userId.toString() !== req.user.id) return res.status(403).json({ message: "Forbidden" });
  if (!memory.audioUrl) return res.status(400).json({ message: "Missing audio URL" });

  memory.status = "processing";
  memory.processingError = "";
  await memory.save();

  callWorker(memory._id.toString(), memory.audioUrl).catch((err) => {
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
