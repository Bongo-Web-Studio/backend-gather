import express from "express";
import fs from "fs";
import https from "https";
import http from "http";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config/config.js";

import { logger } from "./logger";
import { connectDatabases, disconnectDatabases, prisma } from "./db";
import { setupWebSocket } from "./wsHandler";
import { uploadToS3 } from "./s3";
import { useNavigate } from "react-router-dom";
import { error } from "console";

/**
 * startServer
 * - This sets up the web server and starts listening for requests.
 * - It also connects to databases and handles a clean shutdown.
 */
async function startServer() {
  // 1) Make sure our databases are connected before we start.
  //    If connectDatabases fails, the app will throw and stop.
  await connectDatabases();

  // 2) Create the Express app (this holds our routes and middleware).
  const app = express();

  // Security & helpers:
  app.use(helmet()); // Adds small security protections (like locks on a door).
  app.use(cors()); // Lets browsers talk to our server from other websites.
  app.use(express.json({ limit: "1mb" })); // Parses JSON body up to 1MB.
  app.use(express.urlencoded({ extended: true })); // Parses form posts.
  app.use(express.static("public")); // Serves files in ./public (images, JS, etc).

  // 3) Simple global rate limiter: stops one IP from making too many requests.
  //    This helps protect the server from being flooded.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // max requests per IP per windowMs
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // 4) Basic example routes (skeletons):
  //    - signup: creates a user (very simple; add validation in production).
  app.post("/api/v1/signup", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      //check username and password  are not empty
      if (!username || !password) {
        return res
          .status(400)
          .json({ error: "Usename and password are required" });
      }

      //check username already exists
      const usernameExistOrNot = await prisma.user.findUnique({
        where: { username },
      });

      //if username exist
      if (usernameExistOrNot) {
        return res.status(409).json({ error: "Username already exists" });
      }

      // Create the user in Postgres via Prisma
      const user = await prisma.user.create({
        data: {
          username: username,
          password: password,
        },
      });
      res.json(user);
    } catch (err) {
      logger.error({ err }, "Signup failed");
      res.status(500).json({ error: "Signup failed" });
    }
  });

  //    - upload-avatar: placeholder. In real apps use signed S3 uploads or multer.
  app.post("/api/upload-avatar", async (req, res) => {
    // NOTE: This is intentionally not implemented here.
    // For production, either:
    //  1) have the client request an S3 signed URL and upload directly to S3, OR
    //  2) use multer on the server and then stream to S3.
    res
      .status(501)
      .json({ error: "Not implemented. Use S3 signed upload on client." });
  });

  // 5) Create HTTP or HTTPS server depending on TLS files:
  let server: http.Server | https.Server;
  if (fs.existsSync(config.tls.cert) && fs.existsSync(config.tls.key)) {
    const cert = fs.readFileSync(config.tls.cert);
    const key = fs.readFileSync(config.tls.key);
    server = https.createServer({ key, cert }, app);
    logger.info("Starting HTTPS server");
  } else {
    server = http.createServer(app);
    logger.warn(
      "TLS cert not found; starting HTTP server (not recommended for production)"
    );
  }

  // 6) Attach WebSocket support (if you have it)
  const wss = setupWebSocket(server);

  // 7) Start listening
  server.listen(config.port, config.host, () => {
    logger.info(`Server listening at ${config.host}:${config.port}`);
  });

  // 8) Graceful shutdown helper
  async function gracefulShutdown(signal: string) {
    try {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      // Stop accepting new connections and close existing ones
      server.close((err) => {
        if (err) logger.error(err);
      });

      // Close websockets if your setupWebSocket exposes a close method (optional)
      try {
        // If your ws handler needs explicit close, do it here.
        // Example: wss.close?.();
      } catch (err) {
        logger.warn({ err }, "Error closing websocket server");
      }

      // Disconnect databases cleanly (Prisma + Mongo)
      await disconnectDatabases();

      logger.info("Shutdown complete. Bye!");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  }

  // Listen for signals from the OS (Ctrl+C or docker stop)
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

// Start everything and crash loudly if something goes wrong during startup.
startServer().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
