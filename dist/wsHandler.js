// ws.ts
import { WebSocketServer } from "ws";
import { joinRoom, leaveRoom, createTransportForPeer, handleProduce } from "./roomManager";
import { logger } from "./logger";
/**
 * setupWebSocket
 * - Creates the WebSocket server and wires up simple message handlers.
 * - This is intentionally simple and clear so a kid can understand.
 */
export function setupWebSocket(server) {
    const wss = new WebSocketServer({ server });
    // Helper: send JSON safely
    function safeSend(ws, msg) {
        try {
            if (ws.readyState === 1)
                ws.send(JSON.stringify(msg));
        }
        catch (e) {
            // ignore send errors for now
        }
    }
    wss.on("connection", (wsRaw, req) => {
        const ws = wsRaw;
        ws.id = undefined;
        ws.room = undefined;
        // When a text message arrives
        ws.on("message", async (raw) => {
            let data;
            try {
                data = JSON.parse(raw.toString());
            }
            catch (e) {
                // invalid JSON — ignore
                return;
            }
            // --------------------
            // JOIN: a peer joins a room
            // --------------------
            if (data.type === "join") {
                const { room, id, name } = data;
                ws.id = id;
                ws.room = room;
                // add to in-memory room and DBs
                const players = await joinRoom(room, id, name, ws);
                // send current players to the new peer
                safeSend(ws, { type: "players", players });
                // tell everyone else in the server that a new peer joined
                // (production: you might want to only notify peers in the same room)
                wss.clients.forEach((c) => {
                    const client = c;
                    if (client !== ws && client.readyState === 1) {
                        safeSend(client, { type: "peerJoined", peer: { id, name } });
                    }
                });
                logger.info({ room, id }, "peer joined (ws)");
                return;
            }
            // --------------------
            // LEAVE: a peer leaves the room
            // --------------------
            if (data.type === "leave") {
                if (ws.room && ws.id) {
                    leaveRoom(ws.room, ws.id);
                    // notify others in the room (naive broadcast)
                    wss.clients.forEach((c) => {
                        const client = c;
                        if (client !== ws && client.readyState === 1) {
                            safeSend(client, { type: "peerLeft", id: ws.id });
                        }
                    });
                }
                return;
            }
            // --------------------
            // POS: someone moved — broadcast their position
            // --------------------
            if (data.type === "pos") {
                // naive broadcast to everyone (except sender)
                wss.clients.forEach((c) => {
                    const client = c;
                    if (client !== ws && client.readyState === 1) {
                        safeSend(client, { type: "pos", ...data });
                    }
                });
                return;
            }
            // --------------------
            // createTransport: create mediasoup transport for a peer
            // --------------------
            if (data.type === "createTransport") {
                const { room, peerId } = data;
                try {
                    const transportInfo = await createTransportForPeer(room, peerId);
                    safeSend(ws, { type: "transportCreated", transportInfo });
                }
                catch (err) {
                    safeSend(ws, { type: "error", message: String(err) });
                }
                return;
            }
            // --------------------
            // connectTransport: client asks server to connect DTLS on transport
            // --------------------
            if (data.type === "connectTransport") {
                // Implementation depends on how you store transports per peer.
                // For now, we acknowledge the message and point to how-to:
                // In production: find the peer's transport (in roomManager) then call transport.connect(dtlsParameters)
                safeSend(ws, { type: "error", message: "connectTransport not fully implemented on server" });
                return;
            }
            // --------------------
            // produce: peer sends audio/video to server (create a producer)
            // --------------------
            if (data.type === "produce") {
                try {
                    const producerId = await handleProduce(data.room, data.peerId, data);
                    safeSend(ws, { type: "produced", producerId });
                }
                catch (err) {
                    safeSend(ws, { type: "error", message: String(err) });
                }
                return;
            }
            // --------------------
            // offer / answer / ice: simple forwarding to target peer
            // --------------------
            if (data.type === "offer" || data.type === "answer" || data.type === "ice") {
                // We expect messages like: { type, from, to, ... }
                const targetId = data.to;
                if (!targetId) {
                    safeSend(ws, { type: "error", message: "missing 'to' field" });
                    return;
                }
                // Find the target socket by scanning clients (simple approach)
                let found = false;
                wss.clients.forEach((c) => {
                    const client = c;
                    if (client.readyState === 1 && client.id === targetId) {
                        safeSend(client, data); // forward the whole message
                        found = true;
                    }
                });
                if (!found) {
                    safeSend(ws, { type: "error", message: `target ${targetId} not connected` });
                }
                return;
            }
            // Unknown message type -> ignore or reply
            safeSend(ws, { type: "error", message: "unknown message type" });
        });
        // When the socket closes, make the peer leave the room
        ws.on("close", () => {
            if (ws.room && ws.id) {
                leaveRoom(ws.room, ws.id);
                // tell others that this peer left
                wss.clients.forEach((c) => {
                    const client = c;
                    if (client !== ws && client.readyState === 1) {
                        safeSend(client, { type: "peerLeft", id: ws.id });
                    }
                });
            }
        });
    });
    return wss;
}
