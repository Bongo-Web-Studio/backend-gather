"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: process.env.PORT || 3000,
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    jwtSecret: process.env.JWT_SECRET || 'please-change',
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    auth0: {
        clientId: process.env.AUTH0_CLIENT_ID,
        clientSecret: process.env.AUTH0_CLIENT_SECRET,
        issuerBaseUrl: process.env.AUTH0_ISSUER_BASE_URL,
        baseUrl: process.env.AUTH0_BASE_URL || 'http://localhost:3000',
    },
    aws: {
        region: process.env.AWS_REGION,
        s3Bucket: process.env.S3_BUCKET,
    },
    mediasoup: {
        minWorkers: Number(process.env.MEDIASOUP_WORKER_MIN || 1),
        maxWorkers: Number(process.env.MEDIASOUP_WORKER_MAX || 2),
    }
};
exports.default = exports.config;
