"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/authRoutes.ts
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_Middleware_1 = __importDefault(require("../middleware/auth.Middleware"));
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("Missing environment variable: JWT_SECRET");
}
/**
 * @route POST /api/v1/signup
 * @desc Register a new user and return a JWT token
 * @access Public
 */
router.post("/signup", async (req, res) => {
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
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, password: hashedPassword, username: username || null },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
        res.status(201).json({
            ok: true,
            message: "Signup successful.",
            token,
            user: { id: user.id, email: user.email, username: user.username },
        });
    }
    catch (err) {
        console.error("Signup failed:", err);
        res.status(500).json({ ok: false, error: "Signup failed." });
    }
});
/**
 * @route POST /api/v1/login
 * @desc Authenticate a user and return a JWT token
 * @access Public
 */
router.post("/login", async (req, res) => {
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
        const isValid = await bcryptjs_1.default.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ ok: false, error: "Invalid credentials." });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
        res.json({
            ok: true,
            message: "Login successful.",
            token,
            user: { id: user.id, email: user.email, username: user.username },
        });
    }
    catch (err) {
        console.error("Login failed:", err);
        res.status(500).json({ ok: false, error: "Login failed." });
    }
});
/**
 * @route GET /api/v1/me
 * @desc Get the authenticated user's profile
 * @access Private
 */
router.get("/me", auth_Middleware_1.default, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId)
            return res.status(401).json({ ok: false, error: "Unauthorized" });
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, username: true, createdAt: true },
        });
        if (!user)
            return res.status(404).json({ ok: false, error: "User not found." });
        res.json({ ok: true, user });
    }
    catch (err) {
        console.error("Get /me failed:", err);
        res.status(500).json({ ok: false, error: "Failed to fetch user." });
    }
});
exports.default = router;
