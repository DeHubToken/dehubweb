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
      transports: ['polling'],
      upgrade: false,
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

/** Join a livechat room and start receiving its events. */
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
export const MSG_EVENTS = ['message', 'newMessage', 'chatMessage', 'roomMessage'] as const;

/** Possible server-side event names for presence/online-users updates. */
export const PRESENCE_EVENTS = ['roomUsers', 'onlineUsers', 'presence', 'userList'] as const;
