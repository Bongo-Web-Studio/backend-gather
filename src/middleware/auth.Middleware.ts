import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload, TokenExpiredError } from "jsonwebtoken"

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
if (!JWT_ACCESS_SECRET) {
  throw new Error("Missing required environment variable: JWT_ACCESS_SECRET");
}


declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}


export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  // Accept "Bearer <token>" case-insensitively and tolerate extra whitespace
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const token = match[1];

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET!) as JwtPayload | string;

    // If payload is a string (unlikely in our usage) or missing userId, reject.
    if (typeof decoded === "string") {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    const userId = (decoded as JwtPayload & { userId?: string }).userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    req.userId = userId;
    return next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return res.status(401).json({ ok: false, error: "Token expired" });
    }
    // Generic invalid token response (do not leak details)
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

export default requireAuth;
