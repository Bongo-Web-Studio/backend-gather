import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Express, type  Request, type Response } from "express";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "";

export function registerAuthRoutes(app: Express) {
  // SIGNUP
  // Creates a new user
  app.post("/api/v1/signup", async function (req: Request, res: Response) {
    try {
      const { email, password, username } = req.body;

      // validation
      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "Email and password are required." });
      }

      // Check if user exists
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing)
        return res.status(409).json({ error: "Email already registered." });

      // Hash password
      const hashed = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: { email, password: hashed, username: username || null },
      });

      // Create token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET);

     //return token 
      res.status(201).json({
        ok: true,
        message: "Signup successful.",
        token,
      });
    } catch (err) {
      console.error("Signup failed:", err);
      res.status(500).json({ error: "Signup failed" });
    }
  });

  // --- LOGIN ---
  // Authenticates a user and returns a token
  app.post("/api/v1/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password)
        return res
          .status(400)
          .json({ error: "Email and password are required." });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.password)
        return res.status(401).json({ error: "Invalid credentials." });

      const valid = await bcrypt.compare(password, user.password);
      if (!valid)
        return res.status(401).json({ error: "Invalid credentials." });

      const token = jwt.sign({ userId: user.id }, JWT_SECRET);

      res.json({
        user: { id: user.id, email: user.email, username: user.username },
        token,
      });
    } catch (err) {
      console.error("Login failed:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // --- GET ME ---
  // Fetch authenticated user's info
  app.get("/api/v1/me", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer "))
        return res.status(401).json({ error: "Unauthorized" });

      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, username: true, createdAt: true },
      });

      if (!user) return res.status(404).json({ error: "User not found" });

      res.json({ user });
    } catch (err) {
      console.error("GetMe failed:", err);
      res.status(401).json({ error: "Invalid or expired token" });
    }
  });
}
