/**
 * DeHub LiveChat Socket.IO client
 *
 * Connects to the `/livechat` namespace with polling transport, upgrading to
 * websocket. Uses non-prefixed event names (sendMessage, joinRoom, …) with
 * redundant payload fields for API compatibility.
 *
 * ── One connection per room, and why ──────────────────────────────────────
 * The gateway keeps a SINGLE room per socket: `joinRoom` leaves whatever the
 * connection was in before, and `sendMessage` posts to `socket.data.roomId`,
 * ignoring any room named in the payload (deliberately — otherwise a client
 * could post into a stream it is not watching).
 *
 * So a tab cannot be in two rooms on one connection. It has to be: the
 * platform chat sits in the sidebar while a live stream's own chat is open on
 * the page, and with a shared socket the last surface to join silently stole
 * the room from the other — a line typed under a broadcast landed in the
 * global chat, and platform traffic appeared under the stream. That is the
 * "mixing up two chats" viewers were reporting.
 *
 * Each room therefore gets its own connection, keyed by room id. Listeners are
 * registered per room too, so a live chat never sees the platform's messages.
 */

import { io, Socket } from 'socket.io-client';
import { DEHUB_API_BASE, getAuthToken } from './core';

export const GLOBAL_ROOM = 'global';

/** roomId → its own connection. */
const sockets = new Map<string, Socket>();
let currentToken: string | null = null;

const keyOf = (roomId?: string) => roomId || GLOBAL_ROOM;

/** Get or create the connection that carries one room. */
export function getSocket(roomId?: string): Socket {
  const key = keyOf(roomId);
  const token = getAuthToken();

  // A token change re-authenticates every room, not just the one asked for.
  if (currentToken !== token) {
    for (const s of sockets.values()) s.disconnect();
    sockets.clear();
    currentToken = token;
  }

  const existing = sockets.get(key);
  if (existing) return existing;

  const socket = io(`${DEHUB_API_BASE}/livechat`, {
    auth: token ? { token } : {},
    query: token ? { token } : {},
    transports: ['polling', 'websocket'],
    upgrade: true,
    forceNew: true,
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 20,
    timeout: 20000,
  });

  sockets.set(key, socket);

  socket.on('connect', () => {
    console.log('[LiveChat Socket] Connected:', key, socket.id);
    // A reconnect drops the server-side room membership, so re-join. Only this
    // connection's own room — it can hold no other.
    if (roomRefCounts.get(key)) emitJoin(socket, key);
  });

  socket.on('disconnect', (reason) => {
    console.log('[LiveChat Socket] Disconnected:', key, reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[LiveChat Socket] Connection error:', key, err.message);
  });

  const pongHandler = (data: any) => {
    if (data?.connected && roomRefCounts.get(key)) emitJoin(socket, key);
  };
  socket.on('pong', pongHandler);
  socket.on('livechat:pong', pongHandler);

  const errorHandler = (data: any) => {
    console.error('[LiveChat Socket] Error:', key, data);
  };
  socket.on('error', errorHandler);
  socket.on('livechat:error', errorHandler);

  return socket;
}

// Support both legacy and namespaced event names — the backend listens on both.
function emitJoin(socket: Socket, key: string) {
  socket.emit('joinRoom', { roomId: key });
  socket.emit('livechat:joinRoom', { roomId: key });
}

/**
 * Reference-counted room membership.
 *
 * Several components can render the same room at once (SidebarChat and the
 * public chat page both show `global`), and they share that room's connection,
 * so the join/leave only fires for the first and last of them.
 */
const roomRefCounts = new Map<string, number>();

/** Join a livechat room (ref-counted). */
export function joinRoom(roomId?: string) {
  const key = keyOf(roomId);
  const next = (roomRefCounts.get(key) || 0) + 1;
  roomRefCounts.set(key, next);
  if (next === 1) {
    console.log('[LiveChat Socket] Joining room', key);
    emitJoin(getSocket(key), key);
  }
}

/** Leave the room (ref-counted — only leaves when the last subscriber goes). */
export function leaveRoom(roomId?: string) {
  const key = keyOf(roomId);
  const current = roomRefCounts.get(key) || 0;
  const next = Math.max(0, current - 1);
  if (next === 0) {
    roomRefCounts.delete(key);
    const socket = sockets.get(key);
    if (socket) {
      console.log('[LiveChat Socket] Leaving room', key);
      socket.emit('leaveRoom', { roomId: key });
      // A stream's room is done with when its last viewer surface unmounts, and
      // the tab may open a great many of them over a session. The platform room
      // stays connected: it is opened and closed constantly from the sidebar.
      if (key !== GLOBAL_ROOM) {
        socket.disconnect();
        sockets.delete(key);
      }
    }
  } else {
    roomRefCounts.set(key, next);
  }
}

/** Send a message into one room. */
export function emitSendMessage(payload: {
  roomId?: string;
  content: string;
  messageType?: 'text' | 'media' | 'gif' | 'audio';
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  replyTo?: string;
  mentions?: Array<{ address: string; username?: string }>;
}) {
  const roomId = keyOf(payload.roomId);
  const s = getSocket(roomId);

  // Redundant fields for API compatibility. The server posts to the room this
  // connection joined and ignores these, but older builds read them.
  const sendPayload: Record<string, unknown> = {
    roomId,
    room_id: roomId,
    content: payload.content,
    message: payload.content,
    text: payload.content,
    messageType: payload.messageType || 'text',
    type: payload.messageType || 'text',
  };

  if (payload.replyTo) sendPayload.replyTo = payload.replyTo;
  if (payload.mentions?.length) sendPayload.mentions = payload.mentions;
  if (payload.audioUrl) sendPayload.audioUrl = payload.audioUrl;
  if (payload.audioDuration != null) sendPayload.audioDuration = payload.audioDuration;
  if (payload.imageUrl) {
    sendPayload.media = [{
      url: payload.imageUrl,
      type: 'image',
    }];
  }

  console.log('[LiveChat Socket] Sending message:', sendPayload);
  s.emit('sendMessage', sendPayload);
  s.emit('livechat:sendMessage', sendPayload);
}

/** Subscribe to one room's events on both the prefixed and bare event names. */
function subscribe(roomId: string | undefined, events: string[], cb: (...args: any[]) => void): () => void {
  const s = getSocket(keyOf(roomId));
  for (const e of events) s.on(e, cb);
  return () => { for (const e of events) s.off(e, cb); };
}

/** Subscribe to new messages in a room. Returns unsubscribe fn. */
export function onLiveChatMessage(roomId: string | undefined, cb: (msg: unknown) => void): () => void {
  return subscribe(roomId, ['newMessage', 'livechat:newMessage'], (data: unknown) => cb(data));
}

/** Subscribe to the room-joined event (initial data). Returns unsubscribe fn. */
export function onRoomJoined(roomId: string | undefined, cb: (data: {
  room: unknown;
  messages: unknown[];
  yourUser: unknown;
  isBanned: boolean;
  canSendMessages: boolean;
}) => void): () => void {
  return subscribe(roomId, ['roomJoined', 'livechat:roomJoined'], cb);
}

/**
 * Edit one of your own messages.
 *
 * Author-gated server-side, so there is nothing to check here beyond being
 * signed in; a request for someone else's message comes back on the error
 * channel rather than silently succeeding.
 */
export function emitEditMessage(roomId: string | undefined, messageId: string, content: string) {
  const s = getSocket(keyOf(roomId));
  const payload = { messageId, content };
  s.emit('editMessage', payload);
  s.emit('livechat:editMessage', payload);
}

/** Delete a message — your own, or anyone's if you moderate the room. */
export function emitDeleteMessage(roomId: string | undefined, messageId: string) {
  const s = getSocket(keyOf(roomId));
  const payload = { messageId };
  s.emit('deleteMessage', payload);
  s.emit('livechat:deleteMessage', payload);
}

/** Subscribe to message edited events */
export function onMessageEdited(roomId: string | undefined, cb: (msg: unknown) => void): () => void {
  return subscribe(roomId, ['messageEdited', 'livechat:messageEdited'], (data: unknown) => cb(data));
}

/** Subscribe to message deleted events */
export function onMessageDeleted(roomId: string | undefined, cb: (data: { messageId: string }) => void): () => void {
  return subscribe(roomId, ['messageDeleted', 'livechat:messageDeleted'], cb);
}

/**
 * Subscribe to the gateway's error channel.
 *
 * Edits and deletes are fire-and-forget emits, so a refusal (not your message,
 * message already gone) arrives here or nowhere.
 */
export function onLiveChatError(roomId: string | undefined, cb: (data: { message?: string; code?: string }) => void): () => void {
  return subscribe(roomId, ['error', 'livechat:error'], (data: unknown) =>
    cb((data || {}) as { message?: string; code?: string }),
  );
}

/** Subscribe to reaction updates */
export function onReactionUpdated(roomId: string | undefined, cb: (data: unknown) => void): () => void {
  return subscribe(roomId, ['reactionUpdated', 'livechat:reactionUpdated'], cb);
}

/** Subscribe to ban/unban events */
export function onUserBanned(roomId: string | undefined, cb: (data: { message: string }) => void): () => void {
  return subscribe(roomId, ['userBanned', 'livechat:userBanned'], cb);
}

export function onUserUnbanned(roomId: string | undefined, cb: (data: { message: string }) => void): () => void {
  return subscribe(roomId, ['userUnbanned', 'livechat:userUnbanned'], cb);
}

/** Add/remove reactions — backend may require roomId and namespaced events */
export function emitAddReaction(roomId: string, messageId: string, emoji: string) {
  const key = keyOf(roomId);
  const s = getSocket(key);
  const payload = { roomId: key, room_id: key, messageId, emoji };
  console.log('[LiveChat Socket] Emitting addReaction', payload);
  s.emit('addReaction', payload);
  s.emit('livechat:addReaction', payload);
}

export function emitRemoveReaction(roomId: string, messageId: string, emoji: string) {
  const key = keyOf(roomId);
  const s = getSocket(key);
  const payload = { roomId: key, room_id: key, messageId, emoji };
  s.emit('removeReaction', payload);
  s.emit('livechat:removeReaction', payload);
}

/** Typing indicator */
export function emitTyping(roomId: string | undefined, isTyping: boolean) {
  getSocket(keyOf(roomId)).emit('typing', { isTyping });
}

/** Ping keep-alive */
export function emitPing(roomId?: string) {
  getSocket(keyOf(roomId)).emit('ping');
}

/** Subscribe to all of one room's socket events for debugging. */
export function debugSocketEvents(roomId?: string): () => void {
  const key = keyOf(roomId);
  const s = getSocket(key);
  const handler = (eventName: string, ...args: unknown[]) => {
    console.log(`[LiveChat DEBUG ${key}] Event: "${eventName}"`, args.length > 0 ? args[0] : '');
  };
  s.onAny(handler);
  // Pass the specific handler to offAny so we don't strip other listeners.
  return () => { s.offAny(handler); };
}

/** Disconnect every room's connection. */
export function disconnectSocket() {
  for (const [key, s] of sockets) {
    s.disconnect();
    console.log('[LiveChat Socket] Disconnected and cleared', key);
  }
  sockets.clear();
  roomRefCounts.clear();
  currentToken = null;
}

/** Request message history via REST (socket doesn't have a history event) */
export function requestMessageHistory(_roomId: string, _limit?: number): Promise<unknown[]> {
  // History is fetched via REST API, not socket
  return Promise.resolve([]);
}

// Legacy exports for compatibility
export const MSG_EVENTS = ['newMessage', 'livechat:newMessage'] as const;
export const PRESENCE_EVENTS = ['userJoined', 'userLeft', 'livechat:userJoined', 'livechat:userLeft'] as const;
