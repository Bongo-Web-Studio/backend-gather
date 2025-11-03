// config.ts
import dotenv from "dotenv";
dotenv.config();
/**
 * config
 * - Small, friendly place to read settings from environment variables (.env).
 * - Think of these as the app's instruction sheet: ports, secrets, database addresses, etc.
 */
export const config = {
    // Where the server listens (port + host)
    port: Number(process.env.PORT || 8443), // default 8443 if not set
    host: process.env.HOST || "0.0.0.0",
    // TLS files for HTTPS. If empty, the server will run plain HTTP (not safe for real apps).
    tls: {
        cert: process.env.TLS_CERT_PATH || "", // path to TLS certificate file
        key: process.env.TLS_KEY_PATH || "", // path to TLS private key file
    },
    // JWT (login token) settings
    jwtSecret: process.env.JWT_SECRET || "dev-secret", // keep secret in production!
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d", // how long tokens last
    // Database addresses (put your real URLs in env variables)
    databaseUrl: process.env.DATABASE_URL || "",
    mongoUri: process.env.MONGO_URI || "",
    // AWS keys for S3 (keep these secret)
    aws: {
        region: process.env.AWS_REGION || undefined,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || undefined,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || undefined,
    },
    // mediasoup settings. Router codecs can be provided as a JSON string in env.
    mediasoup: {
        workerMaxHeap: Number(process.env.MEDIASOUP_WORKER_MAX_HEAP || 200),
        routerMediaCodecs: (() => {
            // Try to parse MEDIA CODECS from env. If it fails, fall back to a safe default.
            const fallback = [
                { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
            ];
            try {
                const raw = process.env.MEDIASOUP_ROUTER_MEDIA_CODECS;
                if (!raw)
                    return fallback;
                return JSON.parse(raw);
            }
            catch {
                // If the JSON is broken, use the fallback so the app still runs.
                return fallback;
            }
        })(),
    },
    // Optional TURN server info for better WebRTC connectivity (leave empty if not using)
    turn: {
        url: process.env.TURN_URL || undefined,
        username: process.env.TURN_USERNAME || undefined,
        password: process.env.TURN_PASSWORD || undefined,
    },
};
