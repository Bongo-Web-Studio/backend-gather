// src/server.ts
import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, User } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use(cookieParser());

// env & helpers
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
const COOKIE_NAME = process.env.COOKIE_NAME ?? "token";
const COOKIE_MAX_AGE = Number(process.env.COOKIE_MAX_AGE ?? 7 * 24 * 60 * 60 * 1000); // ms
const IS_PROD = process.env.NODE_ENV === "production";

function createToken(userId: number) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

function setTokenCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD, // set true in production (requires HTTPS)
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

function clearTokenCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
  });
}

// types
type AuthRequest = Request & { user?: Partial<User> };

// Authentication middleware - reads token from cookie and sets req.user
async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return next();

    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    if (!payload?.userId) return next();

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (user) {
      // do not expose password
      const { password, ...safe } = (user as any);
      req.user = safe;
    }
    return next();
  } catch (err) {
    // invalid token - silently ignore and continue as unauthenticated
    return next();
  }
}

app.use(authMiddleware);

/**
 * POST /api/v1/signup
 * Body: { email, password, username? }
 */
app.post("/api/v1/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, username } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already in use." });
    }

    if (username) {
      const usernameExists = await prisma.user.findUnique({ where: { username } });
      if (usernameExists) {
        return res.status(409).json({ error: "Username already in use." });
      }
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashed,
      },
    });

    const token = createToken(user.id);
    setTokenCookie(res, token);

    const { password: _pw, ...safeUser } = (user as any);
    return res.status(201).json({ user: safeUser });
  } catch (err) {
    console.error("signup error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/v1/login
 * Body: { email, password }
 */
app.post("/api/v1/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = createToken(user.id);
    setTokenCookie(res, token);

    const { password: _pw, ...safeUser } = (user as any);
    return res.json({ user: safeUser });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/v1/me
 * Returns current logged-in user or 401
 */
app.get("/api/v1/me", (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated." });
  return res.json({ user: req.user });
});

/**
 * POST /api/v1/logout
 * Clears auth cookie
 */
app.post("/api/v1/logout", (_req: Request, res: Response) => {
  clearTokenCookie(res);
  return res.json({ ok: true });
});

// optional: protected route example
app.get("/api/v1/protected", (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated." });
  res.json({ msg: `Hello ${req.user.email}` });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
