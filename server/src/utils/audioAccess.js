import jwt from "jsonwebtoken";
import { getSignedCloudinaryAudioUrl } from "../services/cloudinary.js";

function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

export function createAudioStreamToken(memoryId, expiresIn = "15m") {
  return jwt.sign({ memoryId, type: "audio-stream" }, process.env.JWT_SECRET, { expiresIn });
}

export function verifyAudioStreamToken(token, memoryId) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload?.type === "audio-stream" && payload?.memoryId === memoryId;
  } catch {
    return false;
  }
}

export function canAccessMemoryAudio(memory, userId) {
  if (!memory) return false;
  const isOwner = userId && memory.userId?.toString() === userId;
  const isPublicCompleted = (memory.isPublic ?? true) && memory.status === "completed";
  return Boolean(isOwner || isPublicCompleted);
}

export function buildAudioPlaybackUrl(memory, req, { expose = false } = {}) {
  if (!memory || !memory._id || !expose) return "";

  if (memory.audioStorage === "cloudinary" && memory.audioPublicId) {
    return getSignedCloudinaryAudioUrl(memory.audioPublicId, 900);
  }

  if (memory.audioStorage === "legacy") {
    const legacyUrl = String(memory.audioUrl || "");
    if (legacyUrl) {
      try {
        const parsed = new URL(legacyUrl);
        const isServerUploadPath = parsed.pathname.startsWith("/uploads/");
        if (!isServerUploadPath) return legacyUrl;
      } catch {
        // If legacy URL is not a full URL, fall back to secure stream route.
      }
    }
  }

  const token = createAudioStreamToken(memory._id.toString());
  return `${getBaseUrl(req)}/api/uploads/stream/${memory._id.toString()}?token=${token}`;
}

export function resolveWorkerAudioUrl(memory, req) {
  if (!memory) return "";

  if (memory.audioStorage === "cloudinary" && memory.audioPublicId) {
    return getSignedCloudinaryAudioUrl(memory.audioPublicId, 3600);
  }

  if (memory.audioStorage === "local" && memory.audioFileName && memory._id) {
    const token = createAudioStreamToken(memory._id.toString(), "2h");
    return `${getBaseUrl(req)}/api/uploads/stream/${memory._id.toString()}?token=${token}`;
  }

  return memory.audioUrl || "";
}

export function isSafeIncomingAudioUrl(value) {
  if (!value || typeof value !== "string") return false;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;

    const host = (url.hostname || "").toLowerCase();
    const privateHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    if (privateHosts.has(host)) return process.env.NODE_ENV !== "production";

    const privateIpPattern = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/;
    if (privateIpPattern.test(host)) return process.env.NODE_ENV !== "production";

    return true;
  } catch {
    return false;
  }
}
