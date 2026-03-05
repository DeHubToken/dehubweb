/**
 * Shared DeHub Socket.io singleton.
 *
 * - One persistent connection per session (lazy-created on first use)
 * - Auth via JWT Bearer token; re-connects automatically when token changes
 * - Rooms joined/left explicitly by callers
 *
 * Server events we listen for (livechat):
 *   "message" | "newMessage" | "chatMessage"  — new message in a room
 *   "roomUsers" | "onlineUsers" | "presence"  — online user list update
 *
 * Client events we emit:
 *   "joinRoom"    { roomId }
 *   "leaveRoom"   { roomId }
 *   "sendMessage" { roomId, content, messageType, ... }
 */

import { io, Socket } from 'socket.io-client';
import { DEHUB_API_BASE, getAuthToken } from './core';

let socket: Socket | null = null;
let currentToken: string | null = null;

function getWalletAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dehub_wallet');
}

/** Lazily create (or reuse) the socket connection. */
export function getSocket(): Socket {
  const token = getAuthToken();

  // Reconnect if token changed
  if (socket && currentToken !== token) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    currentToken = token;
    const address = getWalletAddress();
    const handshakeAuth: Record<string, string> = {};
    if (token) handshakeAuth.token = `Bearer ${token}`;
    if (address) handshakeAuth.address = address.toLowerCase();
    handshakeAuth.clientType = 'web';
    handshakeAuth.platform = 'web';

    socket = io(DEHUB_API_BASE, {
      auth: Object.keys(handshakeAuth).length ? handshakeAuth : undefined,
      query: handshakeAuth,
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      forceNew: true,
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 20,
      timeout: 20000,
      extraHeaders: {
        'X-Client-Type': 'web',
        'X-Platform': 'web',
      },
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to DeHub', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });
  }

  return socket;
}

/** Join the global livechat room. */
export function joinRoom(roomId: string) {
  const s = getSocket();
  console.log('[Socket] Joining room:', roomId);
  s.emit('joinRoom', { roomId });
}

/** Leave a livechat room. */
export function leaveRoom(roomId: string) {
  if (!socket) return;
  console.log('[Socket] Leaving room:', roomId);
  socket.emit('leaveRoom', { roomId });
}

/** Send a livechat message via socket. */
export function emitSendMessage(payload: {
  roomId: string;
  content: string;
  messageType?: 'text' | 'image' | 'gif' | 'voice';
  imageUrl?: string;
}) {
  const s = getSocket();
  console.log('[Socket] Sending message (connected:', s.connected, '):', payload);
  // Primary event name for the DeHub livechat gateway
  s.emit('sendMessage', payload, (ack: unknown) => {
    console.log('[Socket] sendMessage ack:', ack);
  });
}

/** Request message history via socket. Returns promise with messages. */
export function requestMessageHistory(roomId: string, limit = 200): Promise<unknown[]> {
  const s = getSocket();
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('[Socket] Message history request timed out');
        resolve([]);
      }
    }, 5000);

    // Listen for history response on multiple possible event names
    const historyEvents = ['messageHistory', 'chatHistory', 'messages', 'roomMessages', 'history', 'previousMessages'];
    const cleanup = () => {
      for (const evt of historyEvents) {
        s.off(evt, handler);
      }
    };
    const handler = (data: unknown) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      cleanup();
      const msgs = Array.isArray(data) ? data : 
        (data && typeof data === 'object' && 'messages' in (data as any)) ? (data as any).messages :
        (data && typeof data === 'object' && 'result' in (data as any)) ? (data as any).result :
        (data && typeof data === 'object' && 'data' in (data as any)) ? (data as any).data :
        [];
      resolve(Array.isArray(msgs) ? msgs : []);
    };
    for (const evt of historyEvents) {
      s.on(evt, handler);
    }

    // Emit history request on multiple possible event names
    s.emit('getMessages', { roomId, limit });
    s.emit('getChatHistory', { roomId, limit });
    s.emit('messageHistory', { roomId, limit });
    s.emit('fetchMessages', { roomId, limit });
  });
}

/** Subscribe to incoming livechat messages. Returns unsubscribe fn. */
export function onLiveChatMessage(cb: (msg: unknown) => void): () => void {
  const s = getSocket();
  const handler = (data: unknown) => cb(data);
  for (const evt of MSG_EVENTS) {
    s.on(evt, handler);
  }
  return () => {
    for (const evt of MSG_EVENTS) {
      s.off(evt, handler);
    }
  };
}

/** Subscribe to all socket events for debugging. Returns unsubscribe fn. */
export function debugSocketEvents(): () => void {
  const s = getSocket();
  const handler = (...args: unknown[]) => {
    // onAny handler
  };
  s.onAny((eventName: string, ...args: unknown[]) => {
    console.log(`[Socket DEBUG] Event: "${eventName}"`, args.length > 0 ? args[0] : '');
  });
  return () => {
    s.offAny();
  };
}

/** Disconnect and clear the singleton (e.g. on logout). */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
    console.log('[Socket] Disconnected and cleared');
  }
}

/** Possible server-side event names for incoming messages. */
export const MSG_EVENTS = ['message', 'newMessage', 'chatMessage', 'roomMessage', 'chat', 'msg'] as const;

/** Possible server-side event names for presence/online-users updates. */
export const PRESENCE_EVENTS = ['roomUsers', 'onlineUsers', 'presence', 'userList'] as const;
