import { PrismaClient } from "@prisma/client";
import { MongoClient } from "mongodb";
import { config } from "./config/config.js";
import { logger } from "./logger";
/**
 * prisma
 * - This talks to your Postgres database using Prisma.
 * - Think of it as a phone we use to call Postgres.
 */
export const prisma = new PrismaClient();
/**
 * mongoClient
 * - This talks to your MongoDB database.
 * - We give it the address (config.mongoUri) so it knows where to go.
 */
export const mongoClient = new MongoClient(config.mongoUri);
/**
 * connectDatabases
 * - Call this when the app starts.
 * - It tries to connect to Postgres first, then MongoDB.
 * - If something breaks, it logs the error and stops the program
 *   (we don't want the app running without its databases).
 */
export async function connectDatabases() {
    try {
        // 1) Connect to Postgres (Prisma)
        await prisma.$connect();
        logger.info("Connected to Postgres (Prisma).");
        // 2) Connect to MongoDB
        await mongoClient.connect();
        logger.info("Connected to MongoDB.");
    }
    catch (err) {
        // If anything goes wrong, log the error and quit.
        logger.error({ err }, "Database connection failed");
        process.exit(1);
    }
}
/**
 * disconnectDatabases
 * - Call this when the app is shutting down (clean exit).
 * - It closes both database connections so nothing is left open.
 */
export async function disconnectDatabases() {
    try {
        await mongoClient.close();
        await prisma.$disconnect();
        logger.info("Disconnected from databases.");
    }
    catch (err) {
        logger.warn({ err }, "Error while disconnecting databases");
    }
}
