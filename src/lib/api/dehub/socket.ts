/**
 * DeHub LiveChat Socket.IO client
 * 
 * Connects to root namespace with polling transport.
 * Uses non-prefixed event names (sendMessage, joinRoom, etc.)
 * with redundant payload fields for API compatibility.
 */

import { io, Socket } from 'socket.io-client';
import { DEHUB_API_BASE, getAuthToken } from './core';

let socket: Socket | null = null;
let currentToken: string | null = null;

/** Get or create the livechat socket connection */
export function getSocket(): Socket {
  const token = getAuthToken();

  // Reconnect if token changed
  if (socket && currentToken !== token) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    socket = io(DEHUB_API_BASE, {
      auth: { token: token || undefined },
      query: { token: token || undefined },
      transports: ['polling'],
      upgrade: false,
      forceNew: true,
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 20,
      timeout: 20000,
    });

    currentToken = token;

    socket.on('connect', () => {
      console.log('[LiveChat Socket] Connected:', socket?.id);
      // Auto-join on connect
      socket?.emit('joinRoom');
    });

    socket.on('disconnect', (reason) => {
      console.log('[LiveChat Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[LiveChat Socket] Connection error:', err.message);
    });

    // Handle pong (both prefixed and non-prefixed)
    const pongHandler = (data: any) => {
      console.log('[LiveChat Socket] Pong:', data);
      if (data?.connected) {
        socket?.emit('joinRoom');
      }
    };
    socket.on('pong', pongHandler);
    socket.on('livechat:pong', pongHandler);

    // Handle errors (both prefixed and non-prefixed)
    const errorHandler = (data: any) => {
      console.error('[LiveChat Socket] Error:', data);
    };
    socket.on('error', errorHandler);
    socket.on('livechat:error', errorHandler);
  }

  return socket;
}

/** Join the global livechat room */
export function joinRoom(_roomId?: string) {
  const s = getSocket();
  console.log('[LiveChat Socket] Joining room');
  s.emit('joinRoom');
}

/** Leave the livechat room */
export function leaveRoom(_roomId?: string) {
  if (socket) {
    socket.emit('leaveRoom');
  }
}

/** Send a livechat message */
export function emitSendMessage(payload: {
  roomId?: string;
  content: string;
  messageType?: 'text' | 'media' | 'gif';
  imageUrl?: string;
  replyTo?: string;
  mentions?: Array<{ address: string; username?: string }>;
}) {
  const s = getSocket();

  // Redundant fields for API compatibility
  const sendPayload: Record<string, unknown> = {
    content: payload.content,
    message: payload.content,
    text: payload.content,
    messageType: payload.messageType || 'text',
    type: payload.messageType || 'text',
  };

  if (payload.replyTo) sendPayload.replyTo = payload.replyTo;
  if (payload.mentions?.length) sendPayload.mentions = payload.mentions;
  if (payload.imageUrl) {
    sendPayload.media = [{
      url: payload.imageUrl,
      type: 'image',
    }];
  }

  console.log('[LiveChat Socket] Sending message:', sendPayload);
  s.emit('sendMessage', sendPayload);
}

/** Subscribe to new messages. Returns unsubscribe fn. */
export function onLiveChatMessage(cb: (msg: unknown) => void): () => void {
  const s = getSocket();
  const handler = (data: unknown) => cb(data);
  // Listen on both prefixed and non-prefixed
  s.on('newMessage', handler);
  s.on('livechat:newMessage', handler);
  return () => {
    s.off('newMessage', handler);
    s.off('livechat:newMessage', handler);
  };
}

/** Subscribe to room joined event (initial data). Returns unsubscribe fn. */
export function onRoomJoined(cb: (data: {
  room: unknown;
  messages: unknown[];
  yourUser: unknown;
  isBanned: boolean;
  canSendMessages: boolean;
}) => void): () => void {
  const s = getSocket();
  // Listen on both prefixed and non-prefixed
  s.on('roomJoined', cb);
  s.on('livechat:roomJoined', cb);
  return () => {
    s.off('roomJoined', cb);
    s.off('livechat:roomJoined', cb);
  };
}

/** Subscribe to message deleted events */
export function onMessageDeleted(cb: (data: { messageId: string }) => void): () => void {
  const s = getSocket();
  s.on('messageDeleted', cb);
  s.on('livechat:messageDeleted', cb);
  return () => {
    s.off('messageDeleted', cb);
    s.off('livechat:messageDeleted', cb);
  };
}

/** Subscribe to reaction updates */
export function onReactionUpdated(cb: (data: unknown) => void): () => void {
  const s = getSocket();
  s.on('reactionUpdated', cb);
  s.on('livechat:reactionUpdated', cb);
  return () => {
    s.off('reactionUpdated', cb);
    s.off('livechat:reactionUpdated', cb);
  };
}

/** Subscribe to ban/unban events */
export function onUserBanned(cb: (data: { message: string }) => void): () => void {
  const s = getSocket();
  s.on('userBanned', cb);
  s.on('livechat:userBanned', cb);
  return () => {
    s.off('userBanned', cb);
    s.off('livechat:userBanned', cb);
  };
}

export function onUserUnbanned(cb: (data: { message: string }) => void): () => void {
  const s = getSocket();
  s.on('userUnbanned', cb);
  s.on('livechat:userUnbanned', cb);
  return () => {
    s.off('userUnbanned', cb);
    s.off('livechat:userUnbanned', cb);
  };
}

/** Add/remove reactions */
export function emitAddReaction(messageId: string, emoji: string) {
  const s = getSocket();
  s.emit('addReaction', { messageId, emoji });
}

export function emitRemoveReaction(messageId: string, emoji: string) {
  const s = getSocket();
  s.emit('removeReaction', { messageId, emoji });
}

/** Typing indicator */
export function emitTyping(isTyping: boolean) {
  const s = getSocket();
  s.emit('typing', { isTyping });
}

/** Ping keep-alive */
export function emitPing() {
  const s = getSocket();
  s.emit('ping');
}

/** Subscribe to all socket events for debugging. Returns unsubscribe fn. */
export function debugSocketEvents(): () => void {
  const s = getSocket();
  s.onAny((eventName: string, ...args: unknown[]) => {
    console.log(`[LiveChat DEBUG] Event: "${eventName}"`, args.length > 0 ? args[0] : '');
  });
  return () => { s.offAny(); };
}

/** Disconnect and clear the singleton */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('[LiveChat Socket] Disconnected and cleared');
  }
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
