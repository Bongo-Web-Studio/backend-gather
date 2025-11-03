import { getOrCreateRouter, createWebRtcTransport } from "./mediasoupWorker";
import { prisma } from "./db";
import { mongoClient } from "./db";
import { logger } from "./logger";

/**
 * Simple analogies for a kid:
 * - room  = a playground where friends meet
 * - peer  = a kid who joins the playground
 * - transport = a door the kid uses to send/receive audio/video
 * - producer = a kid's microphone/camera stream
 * - consumer = a kid listening to another kid's stream
 */

/* A Peer is one person in a room. */
type Peer = {
  id: string;
  name: string;
  socket: any; // the websocket connection for that peer
  transport?: any; // mediasoup transport object (the "door")
  producerIds: Record<string, string>; // track producers by id
};

/* rooms maps roomId -> map of peerId -> Peer */
const rooms = new Map<string, Map<string, Peer>>();

/**
 * joinRoom
 * - Add a peer to the in-memory room map.
 * - Save a record in Postgres and a presence record in MongoDB.
 * - Return the list of peers currently in the room (id + name).
 */
export async function joinRoom(
  roomId: string,
  peerId: string,
  name: string,
  socket: any
): Promise<Array<{ id: string; name: string }>> {
  // create the room map if missing
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  const room = rooms.get(roomId)!;

  // add the peer to the room
  room.set(peerId, { id: peerId, name, socket, producerIds: {} });

  // persist participant in Postgres (best-effort; don't crash the server if it fails)
  try {
    await prisma.participant.create({
      data: { roomId, name, userId: undefined },
    });
  } catch (err) {
    logger.warn("Prisma participant create failed", err);
  }

  // persist ephemeral presence in MongoDB (best-effort)
  try {
    const col = mongoClient.db("gather").collection("presence");
    await col.updateOne(
      { roomId },
      {
        $setOnInsert: { roomId },
        $push: { participants: { id: peerId, name, joinedAt: new Date() } },
      },
      { upsert: true }
    );
  } catch (err) {
    logger.warn("Mongo presence update failed", err);
  }

  logger.info({ roomId, peerId }, "peer joined room");

  // return simple list of peers for the caller
  return Array.from(room.values()).map((p) => ({ id: p.id, name: p.name }));
}

/**
 * leaveRoom
 * - Remove a peer from the in-memory room.
 * - Close their transport if it exists.
 * - Update Mongo and Postgres to show they left (best-effort).
 */
export function leaveRoom(roomId: string, peerId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const peer = room.get(peerId);
  if (!peer) return;

  // try to close the transport (safe-guarded)
  try {
    if (peer.transport) peer.transport.close();
  } catch (err) {
    // ignore errors on close
  }

  // remove from in-memory map
  room.delete(peerId);

  // update Mongo presence (best-effort)
  const col = mongoClient.db("gather").collection("presence");
  col.updateOne({ roomId }, { $pull: { participants: { id: peerId } } }).catch(() => {});

  // mark participant as left in Postgres (best-effort)
  prisma.participant
    .updateMany({
      where: { roomId, name: peer.name, leftAt: null },
      data: { leftAt: new Date() },
    })
    .catch(() => {});

  logger.info({ roomId, peerId }, "peer left room");
}

/**
 * getRoomPeers
 * - Return a simple list of peers currently in the room.
 */
export function getRoomPeers(roomId: string): Array<{ id: string; name: string }> {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.values()).map((p) => ({ id: p.id, name: p.name }));
}

/**
 * createTransportForPeer
 * - Create a mediasoup transport (door) for a peer to use.
 * - Save the transport on the peer object so later we can produce/consume.
 * - Return the minimal data the client needs to connect their WebRTC peer.
 */
export async function createTransportForPeer(roomId: string, peerId: string) {
  const router = await getOrCreateRouter(roomId);
  const transport = await createWebRtcTransport(router);

  const room = rooms.get(roomId);
  if (!room) throw new Error("room not found");

  const peer = room.get(peerId);
  if (!peer) throw new Error("peer not found");

  peer.transport = transport;

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

/**
 * handleProduce
 * - Called when a peer starts sending media (mic/camera).
 * - We create a producer on their transport and then try to create consumers
 *   for every other peer in the room so they can hear/see this producer.
 * - This is the simplest approach (every other peer gets a consumer).
 */
export async function handleProduce(roomId: string, peerId: string, producerParams: any) {
  const room = rooms.get(roomId);
  if (!room) throw new Error("room not found");

  const peer = room.get(peerId);
  if (!peer || !peer.transport) throw new Error("peer or transport not found");

  // create the producer (this peer's media stream)
  const producer = await peer.transport.produce({
    kind: producerParams.kind,
    rtpParameters: producerParams.rtpParameters,
  });

  // store producer id so we know what this peer is producing
  peer.producerIds[producer.id] = producer.id;

  // For each other peer in the room, try to create a consumer
  for (const [otherId, otherPeer] of room) {
    if (otherId === peerId) continue; // skip the producer themself
    try {
      if (otherPeer.transport) {
        // otherPeer.transport.consume will create a consumer that receives the producer's media
        const consumer = await otherPeer.transport.consume({
          producerId: producer.id,
          rtpCapabilities: otherPeer.transport.rtpCapabilities || {},
        });

        // tell the other peer about the new consumer over their websocket
        otherPeer.socket.send(
          JSON.stringify({
            type: "newConsumer",
            from: peerId,
            consumerId: consumer.id,
            kind: producer.kind,
            producerId: producer.id,
            rtpParameters: consumer.rtpParameters,
          })
        );
      }
    } catch (err) {
      logger.warn({ err, peerId, otherId }, "create consumer failed");
    }
  }

  return producer.id;
}
