// ws-types.ts

// -------------------------
// Simple message types for our WebSocket chats/playroom
// -------------------------

/**
 * JoinMessage
 * - Sent when a kid joins a room.
 * - room = which playground to join, id = who they are, name = their nickname.
 */
export type JoinMessage = {
  type: "join";
  room: string;
  id: string;
  name: string;
};

/**
 * PosMessage
 * - Sent to tell others where someone is standing/moving in the playground.
 * - x,y,z = position. vx,vy = how fast they are moving.
 * - ts = timestamp (when the position was measured).
 * - name = optional name to show.
 */
export type PosMessage = {
  type: "pos";
  id: string;
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  ts?: number;
  name?: string;
};

/**
 * LeaveMessage
 * - Sent when someone leaves the room.
 * - id = who left.
 */
export type LeaveMessage = {
  type: "leave";
  id: string;
};

/**
 * SdpMessage
 * - "offer" and "answer" are part of WebRTC (making a direct audio/video call).
 * - from = sender id, to = receiver id, sdp = the handshake data (a blob the browser understands).
 */
export type SdpMessage = {
  type: "offer" | "answer";
  from: string;
  to: string;
  sdp: any;
};

/**
 * IceMessage
 * - Also for WebRTC. These are little network helpers (candidates) that let two browsers find the best route to each other.
 */
export type IceMessage = {
  type: "ice";
  from: string;
  to: string;
  candidate: any;
};

/**
 * ChatMessage
 * - A normal chat line.
 * - from = who sent it, text = the message, ts = optional time.
 */
export type ChatMessage = {
  type: "chat";
  from: string;
  text: string;
  ts?: number;
};

/**
 * WSMessage
 * - The full union of all possible messages we send over the websocket.
 */
export type WSMessage =
  | JoinMessage
  | PosMessage
  | LeaveMessage
  | SdpMessage
  | IceMessage
  | ChatMessage;
