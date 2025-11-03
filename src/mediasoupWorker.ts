import * as mediasoup from "mediasoup";
import { config } from "./config/config.js";

import { logger } from "./logger";

/**
 * Quick analogies:
 * - worker  = a small factory that does the heavy media work
 * - router  = a room manager for one meeting/room
 * - transport = a door for a person to send/receive audio/video
 */

/* A map of roomId -> Router */
type RouterMap = Map<string, mediasoup.types.Router>;

/* Keep the worker and the routers together */
type WorkerHolder = {
  worker: mediasoup.types.Worker;
  routers: RouterMap;
};

/* This holds our worker and routers. Starts as null until created. */
let workerHolder: WorkerHolder | null = null;

/**
 * createMediasoupWorker
 * - Make a worker (the little factory) if we don't have one yet.
 * - If the worker dies, we log an error and stop the program (so we can restart clean).
 * - Returns an object with the worker and a map of routers (one router per room).
 */
export async function createMediasoupWorker(): Promise<WorkerHolder> {
  // If we already made the worker, return it (don't make another).
  if (workerHolder) return workerHolder;

  // Create the worker (the mediasoup factory)
  const worker = await mediasoup.createWorker({
    rtcMinPort: 10000,
    rtcMaxPort: 20000,
    logLevel: "warn",
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
  });

  // If the worker process dies for any reason, log and exit soon.
  worker.on("died", () => {
    logger.error("mediasoup worker died, exiting in 2s");
    setTimeout(() => process.exit(1), 2000);
  });

  // Start with no routers; add them when rooms are created.
  const routers: RouterMap = new Map();
  workerHolder = { worker, routers };

  logger.info("mediasoup worker created");
  return workerHolder;
}

/**
 * getOrCreateRouter(roomId)
 * - Each "room" in your app gets a router (the room manager).
 * - If a router already exists for the roomId, return it.
 * - Otherwise create one, save it, and return it.
 */
export async function getOrCreateRouter(roomId: string): Promise<mediasoup.types.Router> {
  const holder = await createMediasoupWorker();
  const routers = holder.routers;

  // If we already made a router for this room, return it.
  if (routers.has(roomId)) return routers.get(roomId)!;

  // Make a new router for this room and save it.
  const router = await holder.worker.createRouter({
    mediaCodecs: config.mediasoup.routerMediaCodecs,
  });
  routers.set(roomId, router);

  logger.info({ roomId }, "Created mediasoup router for room");
  return router;
}

/**
 * createWebRtcTransport(router)
 * - Makes a new WebRTC transport (a "door") so a peer can join and send/receive media.
 * - listenIps: set to "0.0.0.0" to listen on all addresses locally.
 *   If you run this server on the internet, set announcedIp to your public IP or a load balancer IP.
 */
export async function createWebRtcTransport(
  router: mediasoup.types.Router
): Promise<mediasoup.types.WebRtcTransport> {
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: "0.0.0.0", announcedIp: undefined /* set your public IP for internet mode */ }],
    enableTcp: true, // allow TCP fallback
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000, // starting bitrate
  });

  return transport;
}
