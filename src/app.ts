import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import compression from "compression";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// -----------------------------
// Config
// -----------------------------
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const TOKEN_EXPIRY = "7d";

// -----------------------------
// App + middleware
// -----------------------------
export const app = express();
app.use(helmet());
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const apiLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// -----------------------------
// In-memory stores (replace with DB in production)
// -----------------------------
interface User {
  id: string;
  username: string;
  passwordHash: string;
  characterId?: string | null;
  mapId?: string | null;
}

interface Space {
  id: string;
  name: string;
  ownerId: string;
  mapId: string;
  createdAt: number;
  participants: Set<string>; // user ids
}

const users = new Map<string, User>();
const usersByUsername = new Map<string, User>();
const spaces = new Map<string, Space>();

// Predefined characters and maps (4 each)
const CHARACTERS = [
  { id: "char-1", name: "Explorer", avatar: "/avatars/explorer.png" },
  { id: "char-2", name: "Scholar", avatar: "/avatars/scholar.png" },
  { id: "char-3", name: "Gamer", avatar: "/avatars/gamer.png" },
  { id: "char-4", name: "Artist", avatar: "/avatars/artist.png" },
];

const MAPS = [
  { id: "map-1", name: "Campus", thumbnail: "/maps/campus.png" },
  { id: "map-2", name: "Warehouse", thumbnail: "/maps/warehouse.png" },
  { id: "map-3", name: "Park", thumbnail: "/maps/park.png" },
  { id: "map-4", name: "Conference", thumbnail: "/maps/conference.png" },
];

// -----------------------------
// Helpers
// -----------------------------
function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string; iat: number; exp: number };
  } catch (e) {
    return null;
  }
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return res.status(401).json({ error: "Invalid Authorization format" });
  const payload = verifyToken(parts[1]);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  const user = users.get(payload.sub);
  if (!user) return res.status(401).json({ error: "User not found" });
  (req as any).user = user;
  next();
}

// -----------------------------
// Auth routes
// -----------------------------
app.post("/api/v1/auth/register", async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  if (usersByUsername.has(username)) return res.status(409).json({ error: "username taken" });

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  const id = uuidv4();
  const user: User = { id, username, passwordHash: hash };
  users.set(id, user);
  usersByUsername.set(username, user);

  const token = signToken(id);
  res.status(201).json({ token, user: { id: user.id, username: user.username } });
});

app.post("/api/v1/auth/login", async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  const user = usersByUsername.get(username);
  if (!user) return res.status(401).json({ error: "invalid credentials" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid credentials" });
  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, username: user.username } });
});

// Get current user
app.get("/api/v1/me", authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  res.json({ id: user.id, username: user.username, characterId: user.characterId ?? null, mapId: user.mapId ?? null });
});

// -----------------------------
// Characters & maps
// -----------------------------
app.get("/api/v1/characters", (_req: Request, res: Response) => {
  res.json(CHARACTERS);
});

app.post("/api/v1/character/select", authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { characterId } = req.body || {};
  if (!characterId || !CHARACTERS.find((c) => c.id === characterId)) return res.status(400).json({ error: "invalid characterId" });
  user.characterId = characterId;
  users.set(user.id, user);
  res.json({ success: true, characterId });
});

app.get("/api/v1/maps", (_req: Request, res: Response) => {
  res.json(MAPS);
});

app.post("/api/v1/map/select", authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { mapId } = req.body || {};
  if (!mapId || !MAPS.find((m) => m.id === mapId)) return res.status(400).json({ error: "invalid mapId" });
  user.mapId = mapId;
  users.set(user.id, user);
  res.json({ success: true, mapId });
});

// -----------------------------
// Dashboard / Spaces (create / join)
// -----------------------------
// Create a space: user selects from 4 maps
app.post("/api/v1/spaces/create", authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { name, mapId } = req.body || {};
  if (!mapId || !MAPS.find((m) => m.id === mapId)) return res.status(400).json({ error: "invalid mapId" });
  const id = uuidv4();
  const space: Space = { id, name: name || `Space ${id}`, ownerId: user.id, mapId, createdAt: Date.now(), participants: new Set([user.id]) };
  spaces.set(id, space);

  // return a join link (frontend will construct full url)
  const link = `/spaces/${id}`;
  res.status(201).json({ id, name: space.name, mapId: space.mapId, link });
});

// Join a space by link or id
app.post("/api/v1/spaces/join", authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { spaceId } = req.body || {};
  if (!spaceId) return res.status(400).json({ error: "spaceId required" });
  const space = spaces.get(spaceId);
  if (!space) return res.status(404).json({ error: "space not found" });
  space.participants.add(user.id);
  spaces.set(space.id, space);
  res.json({ success: true, id: space.id, name: space.name, mapId: space.mapId });
});

app.get("/api/v1/spaces/:id", authMiddleware, (req: Request, res: Response) => {
  const space = spaces.get(req.params.id);
  if (!space) return res.status(404).json({ error: "space not found" });
  res.json({ id: space.id, name: space.name, ownerId: space.ownerId, mapId: space.mapId, participantCount: space.participants.size, participants: Array.from(space.participants) });
});

// List spaces for dashboard (owned or joined)
app.get("/api/v1/spaces", authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const list = Array.from(spaces.values()).filter((s) => s.ownerId === user.id || s.participants.has(user.id)).map((s) => ({ id: s.id, name: s.name, mapId: s.mapId, participantCount: s.participants.size }));
  res.json(list);
});

// Leave space
app.post("/api/v1/spaces/:id/leave", authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const id = req.params.id;
  const space = spaces.get(id);
  if (!space) return res.status(404).json({ error: "space not found" });
  space.participants.delete(user.id);
  // optionally delete if empty
  if (space.participants.size === 0) spaces.delete(id);
  else spaces.set(id, space);
  res.json({ success: true });
});

// -----------------------------
// Health & misc routes
// -----------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.get("/", (_req: Request, res: Response) => {
  res.send("Gather-clone backend running (auth + character/map + spaces)");
});

// 404 for unknown API routes
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "API route not found" });
});

// -----------------------------
// Global error handler
// -----------------------------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err?.status || err?.statusCode || 500;
  const message = err?.message || "Internal Server Error";
  const payload: Record<string, any> = { message };
  if (process.env.NODE_ENV !== "production") {
    payload.stack = err?.stack;
    payload.meta = err?.meta;
  }
  // eslint-disable-next-line no-console
  console.error("[error]", { status, message, stack: err?.stack });
  res.status(status).json(payload);
});

// -----------------------------
// Start server when run directly
// -----------------------------
if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  const server = createServer(app);

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${PORT} (env=${process.env.NODE_ENV || "development"})`);
  });
}

export default app;

/*
  Next steps when you're ready to add WebRTC / media:
  - Add a TURN server for reliable NAT traversal (coturn) and provide ICE servers to clients.
  - Implement signaling (socket.io) or switch to an SFU (mediasoup, Janus, Jitsi) for larger rooms.
  - Persist users and spaces in a database (Postgres/Prisma or Mongo), and share state with Redis for horizontal scaling.
*/
