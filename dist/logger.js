// logger.ts
import pino from "pino";
/**
 * logger
 * - This is our app's notebook. We write short notes (logs) about what the app is doing.
 * - Each note has a level: debug, info, warn, error (debug = lots of detail, error = big problem).
 * - To change how chatty it is, set the environment variable LOG_LEVEL (e.g. "debug" or "info").
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || "info",
});
