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
      transports: ['polling'],
      upgrade: false,
      forceNew: true,
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 20,
      timeout: 20000,
      extraHeaders: { 'X-Client-Type': 'web', 'X-Platform': 'web' },
    });

    currentToken = token;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    socket.on('sendMessageResponse', (data: unknown) => {
      console.log('[Socket] sendMessageResponse:', data);
    });

    socket.on('error', (data: unknown) => {
      console.error('[Socket] Server error event:', data);
    });

    socket.on('sendMessageError', (err: unknown) => {
      console.error('[Socket] sendMessageError event:', err);
    });
  }

  return socket;
}

/** Join the global livechat room. */
export function joinRoom(roomId: string) {
  const s = getSocket();
  console.log('[Socket] Joining room:', roomId);
  s.emit('joinRoom', { roomId });
  s.emit('join-room', { roomId });
}

/** Leave a livechat room. */
export function leaveRoom(roomId: string) {
  if (socket) {
    socket.emit('leaveRoom', { roomId });
    socket.emit('leave-room', { roomId });
  }
}

/** Send a livechat message via socket. */
export async function emitSendMessage(payload: {
  roomId: string;
  content: string;
  messageType?: 'text' | 'image' | 'gif' | 'voice';
  imageUrl?: string;
}) {
  const address = typeof window !== 'undefined' ? localStorage.getItem('dehub_wallet') : null;
  const token = getAuthToken();
  const fullPayload = {
    roomId: payload.roomId,
    content: payload.content,
    message: payload.content,
    text: payload.content,
    messageType: payload.messageType || 'text',
    type: payload.messageType || 'text',
    ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    ...(address ? { address: address.toLowerCase(), sender: address.toLowerCase(), senderAddress: address.toLowerCase() } : {}),
    ...(token ? { token: `Bearer ${token}` } : {}),
  };
  
  const s = getSocket();
  
  // Try emitWithAck on sendMessage to get server response
  const eventNames = ['sendMessage', 'send-message', 'chatMessage', 'chat-message', 'message', 'new-message'];
  
  for (const evt of eventNames) {
    try {
      const response = await s.timeout(3000).emitWithAck(evt, fullPayload);
      console.log(`[Socket] "${evt}" response:`, response);
      return;
    } catch (err: any) {
      console.log(`[Socket] "${evt}" - no ack (${err?.message || 'timeout'})`);
    }
  }
  
  console.warn('[Socket] No event got a server ack.');
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
    console.log('[Socket] Disconnected and cleared');
  }
  currentToken = null;
}

/** Possible server-side event names for incoming messages. */
export const MSG_EVENTS = ['message', 'newMessage', 'chatMessage', 'roomMessage', 'chat', 'msg'] as const;

/** Possible server-side event names for presence/online-users updates. */
export const PRESENCE_EVENTS = ['roomUsers', 'onlineUsers', 'presence', 'userList'] as const;
