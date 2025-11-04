"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importStar(require("jsonwebtoken"));
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
if (!JWT_ACCESS_SECRET) {
    throw new Error("Missing required environment variable: JWT_ACCESS_SECRET");
}
function requireAuth(req, res, next) {
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
        const decoded = jsonwebtoken_1.default.verify(token, JWT_ACCESS_SECRET);
        // If payload is a string (unlikely in our usage) or missing userId, reject.
        if (typeof decoded === "string") {
            return res.status(401).json({ ok: false, error: "Invalid token" });
        }
        const userId = decoded.userId;
        if (!userId) {
            return res.status(401).json({ ok: false, error: "Invalid token" });
        }
        req.userId = userId;
        return next();
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.TokenExpiredError) {
            return res.status(401).json({ ok: false, error: "Token expired" });
        }
        // Generic invalid token response (do not leak details)
        return res.status(401).json({ ok: false, error: "Invalid or expired token" });
    }
}
exports.default = requireAuth;
