import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id.toString(), email: user.email, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });
}

router.post("/signup", asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

  const normalizedEmail = String(email).toLowerCase();
  const exists = await User.findOne({ email: normalizedEmail });
  if (exists) return res.status(409).json({ message: "Email already exists" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email: normalizedEmail, passwordHash });
  const token = signToken(user);

  return res.status(201).json({
    token,
    user: { id: user._id, name: user.name, email: user.email }
  });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "Missing fields" });

  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ message: "Invalid credentials" });

  const token = signToken(user);
  return res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
}));

export default router;
