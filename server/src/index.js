import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.routes.js";
import chainRoutes from "./routes/chain.routes.js";
import memoryRoutes from "./routes/memory.routes.js";
import uploadRoutes from "./routes/upload.routes.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/memories", memoryRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/chain", chainRoutes);
app.use((err, _req, res, _next) => {
  console.error("API error:", err?.message || err);
  return res.status(500).json({ message: "Server error", detail: err?.message || "Unknown error" });
});

const port = process.env.PORT || 8080;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(port, () => {
      console.log(`API running on ${port}`);
    });
  })
  .catch((err) => {
    console.error("Mongo connection failed", err);
    process.exit(1);
  });
