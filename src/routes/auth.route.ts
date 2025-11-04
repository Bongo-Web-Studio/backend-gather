// src/routes/authRoutes.ts
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import requireAuth from "../middleware/auth.Middleware";


const router = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("Missing environment variable: JWT_SECRET");
}

/**
 * @route POST /api/v1/signup
 * @desc Register a new user and return a JWT token
 * @access Public
 */
router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Email and password are required." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ ok: false, error: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, username: username || null },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      ok: true,
      message: "Signup successful.",
      token,
      user: { id: user.id, email: user.email, username: user.username },
    });
  } catch (err) {
    console.error("Signup failed:", err);
    res.status(500).json({ ok: false, error: "Signup failed." });
  }
});

/**
 * @route POST /api/v1/login
 * @desc Authenticate a user and return a JWT token
 * @access Public
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Email and password are required." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return res.status(401).json({ ok: false, error: "Invalid credentials." });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ ok: false, error: "Invalid credentials." });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      ok: true,
      message: "Login successful.",
      token,
      user: { id: user.id, email: user.email, username: user.username },
    });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ ok: false, error: "Login failed." });
  }
});

/**
 * @route GET /api/v1/me
 * @desc Get the authenticated user's profile
 * @access Private
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, createdAt: true },
    });

    if (!user) return res.status(404).json({ ok: false, error: "User not found." });

    res.json({ ok: true, user });
  } catch (err) {
    console.error("Get /me failed:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch user." });
  }
});

export default router;
