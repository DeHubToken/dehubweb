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
let chatSocket: Socket | null = null;
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

    // Log any error events from the server
    socket.on('error', (err: unknown) => {
      console.error('[Socket] Server error event:', err);
    });
    socket.on('exception', (err: unknown) => {
      console.error('[Socket] Server exception event:', err);
    });
    socket.on('messageError', (err: unknown) => {
      console.error('[Socket] messageError event:', err);
    });
    socket.on('sendMessageError', (err: unknown) => {
      console.error('[Socket] sendMessageError event:', err);
    });
  }

  return socket;
}

/** Get or create a /chat namespace socket for livechat messaging. */
function getChatSocket(): Socket {
  const token = getAuthToken();
  if (chatSocket && currentToken !== token) {
    chatSocket.disconnect();
    chatSocket = null;
  }
  if (!chatSocket) {
    const address = getWalletAddress();
    const handshakeAuth: Record<string, string> = {};
    if (token) handshakeAuth.token = `Bearer ${token}`;
    if (address) handshakeAuth.address = address.toLowerCase();
    handshakeAuth.clientType = 'web';
    handshakeAuth.platform = 'web';

    chatSocket = io(`${DEHUB_API_BASE}/chat`, {
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

    chatSocket.on('connect', () => {
      console.log('[ChatSocket /chat] Connected', chatSocket?.id);
      import('sonner').then(({ toast }) => toast.success(`Chat namespace connected: ${chatSocket?.id}`));
    });
    chatSocket.on('disconnect', (reason) => console.log('[ChatSocket /chat] Disconnected:', reason));
    chatSocket.on('connect_error', (err) => {
      console.warn('[ChatSocket /chat] Connection error:', err.message);
      import('sonner').then(({ toast }) => toast.error(`/chat namespace error: ${err.message}`));
    });
    chatSocket.onAny((eventName: string, ...args: unknown[]) => {
      console.log(`[ChatSocket /chat DEBUG] Event: "${eventName}"`, args.length > 0 ? args[0] : '');
    });
  }
  return chatSocket;
}

/** Join the global livechat room. */
export function joinRoom(roomId: string) {
  // Join on both root and /chat namespace
  const s = getSocket();
  console.log('[Socket] Joining room:', roomId);
  s.emit('joinRoom', { roomId });
  s.emit('join-room', { roomId });
  
  // Also join on /chat namespace
  try {
    const cs = getChatSocket();
    cs.emit('joinRoom', { roomId });
    cs.emit('join-room', { roomId });
  } catch (e) {
    console.warn('[ChatSocket] Failed to join room:', e);
  }
}

/** Leave a livechat room. */
export function leaveRoom(roomId: string) {
  if (socket) {
    socket.emit('leaveRoom', { roomId });
    socket.emit('leave-room', { roomId });
  }
  if (chatSocket) {
    chatSocket.emit('leaveRoom', { roomId });
    chatSocket.emit('leave-room', { roomId });
  }
}

/** Send a livechat message via socket. */
export function emitSendMessage(payload: {
  roomId: string;
  content: string;
  messageType?: 'text' | 'image' | 'gif' | 'voice';
  imageUrl?: string;
}) {
  const address = typeof window !== 'undefined' ? localStorage.getItem('dehub_wallet') : null;
  const fullPayload = {
    roomId: payload.roomId,
    content: payload.content,
    message: payload.content,
    messageType: payload.messageType || 'text',
    type: payload.messageType || 'text',
    ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    ...(address ? { address: address.toLowerCase() } : {}),
  };
  
  // Send on root namespace
  const s = getSocket();
  console.log('[Socket /] Sending (connected:', s.connected, ')');
  s.emit('sendMessage', fullPayload);
  s.emit('send-message', fullPayload);
  
  // Send on /chat namespace
  try {
    const cs = getChatSocket();
    console.log('[Socket /chat] Sending (connected:', cs.connected, ')');
    cs.emit('sendMessage', fullPayload, (ack: unknown) => {
      console.log('[ChatSocket] sendMessage ack:', ack);
      import('sonner').then(({ toast }) => toast.info(`/chat ack: ${JSON.stringify(ack)?.substring(0, 150) || 'none'}`));
    });
    cs.emit('send-message', fullPayload);
    cs.emit('chatMessage', fullPayload);
    cs.emit('chat-message', fullPayload);
    cs.emit('message', fullPayload);
    cs.emit('new-message', fullPayload);
  } catch (e) {
    console.warn('[ChatSocket] Send failed:', e);
  }
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
  // Also listen on /chat namespace
  let cs: Socket | null = null;
  try {
    cs = getChatSocket();
    for (const evt of MSG_EVENTS) {
      cs.on(evt, handler);
    }
  } catch {}
  return () => {
    for (const evt of MSG_EVENTS) {
      s.off(evt, handler);
    }
    if (cs) {
      for (const evt of MSG_EVENTS) {
        cs.off(evt, handler);
      }
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
