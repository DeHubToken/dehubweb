/**
 * DM Socket Singleton
 * ===================
 * Manages a persistent Socket.io connection to the /dm namespace.
 * Separate from the livechat socket in socket.ts.
 *
 * Usage:
 *   import { emitCreateAndStart, onDmSendMessage } from './dm-socket';
 *   const unsub = onDmSendMessage((msg) => { ... });
 *   return () => unsub();
 */

import { io, Socket } from 'socket.io-client';
import { DEHUB_API_BASE, getAuthToken } from './core';
import type { DmMessage, DmConversation, DmMsgType } from './dm';

/** Get wallet address from localStorage (set on login). */
function getWalletAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dehub_wallet');
}

// ─── Socket event payload types ───────────────────────────────────────────────

export interface SendMessagePayload {
  dmId: string;
  content: string;
  type: DmMsgType;
  gif?: string;
  replyTo?: string;
  txHash?: string;
  tipTxHash?: string;
  voiceDuration?: number;
}

export interface EditedMessage {
  _id: string;
  dmId: string;
  content: string;
  editedAt: string;
}

export interface DeletedMessage {
  _id: string;
  dmId: string;
}

export interface ReadReceiptData {
  dmId: string;
  userId: string;
  readAt: string;
}

export interface ConversationDeletedData {
  dmId: string;
}

export interface FeeConfirmedData {
  dmId: string;
  messageId: string;
  txHash: string;
}

export interface DmSocketError {
  message: string;
  code?: string;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let dmSocket: Socket | null = null;
let currentToken: string | null = null;

function getDmSocket(): Socket {
  const token = getAuthToken();

  if (dmSocket && currentToken !== token) {
    dmSocket.disconnect();
    dmSocket = null;
  }

  if (!dmSocket) {
    currentToken = token;
    const address = getWalletAddress();
    const handshakeAuth: Record<string, string> = {};
    if (token) handshakeAuth.token = `Bearer ${token}`;
    if (address) handshakeAuth.address = address.toLowerCase();
    handshakeAuth.clientType = 'web';
    handshakeAuth.platform = 'web';

    dmSocket = io(`${DEHUB_API_BASE}/dm`, {
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

    dmSocket.on('connect', () => {
      console.log('[DM Socket] Connected', dmSocket?.id);
    });

    dmSocket.on('disconnect', (reason) => {
      console.log('[DM Socket] Disconnected:', reason);
    });

    dmSocket.on('connect_error', (err) => {
      // Suppress noisy logs after repeated failures
      console.warn('[DM Socket] Connection error:', err.message);
    });

    // Debug: log all incoming events from server
    dmSocket.onAny((event, ...args) => {
      console.log('[DM Socket] ← server event:', event, args);
    });
  }

  return dmSocket;
}

// ─── Emitters ─────────────────────────────────────────────────────────────────

/**
 * Emit createAndStart to get/create a DM conversation with a user.
 * Returns a Promise that resolves with the DmConversation data including dmFee.
 */
export function emitCreateAndStart(userId: string): Promise<DmConversation> {
  return new Promise((resolve, reject) => {
    const socket = getDmSocket();
    let settled = false;

    const settle = (conversation: DmConversation | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socket.off('createAndStart', onEvent);
      socket.off('error', onErrorEvent);
      if (error) reject(error);
      else resolve(conversation!);
    };

    const timeoutId = setTimeout(() => {
      settle(null, new Error('createAndStart timeout'));
    }, 15000);

    const onEvent = (response: { data?: DmConversation } | DmConversation) => {
      // Server responds with { msg, data: { ...dm, dmFee } }
      const conversation: DmConversation = (response as { data?: DmConversation })?.data || (response as DmConversation);
      settle(conversation);
    };

    const onErrorEvent = (err: DmSocketError) => {
      settle(null, new Error(err.message || 'DM socket error'));
    };

    socket.once('createAndStart', onEvent);
    socket.once('error', onErrorEvent);
    console.log('[DM Socket] → createAndStart emit', { _id: userId });
    // Emit with ACK callback — some NestJS gateways return via ACK instead of a separate event
    socket.emit('createAndStart', { _id: userId }, (ackResponse: { data?: DmConversation; error?: string; message?: string; status?: string } | DmConversation | null) => {
      if (!ackResponse) return; // server doesn't use ACK for this event
      const ack = ackResponse as { error?: string; message?: string; status?: string; data?: DmConversation };
      if (ack?.error || ack?.status === 'error') {
        settle(null, new Error(ack.error || ack.message || 'ACK error'));
      } else {
        const conversation: DmConversation = ack?.data || (ackResponse as DmConversation);
        settle(conversation);
      }
    });
  });
}

export function emitSendMessage(payload: SendMessagePayload): void {
  getDmSocket().emit('sendMessage', payload);
}

export function emitReadReceipt(dmId: string): void {
  getDmSocket().emit('readReceipt', { dmId });
}

export function emitDeleteMessage(dmId: string, messageId: string): void {
  getDmSocket().emit('deleteMessage', { dmId, messageId });
}

export function emitDownloadReceipt(dmId: string, messageId: string): void {
  getDmSocket().emit('downloadReceipt', { dmId, messageId });
}

// ─── Event listeners (all return an unsubscribe fn for useEffect cleanup) ─────

export function onDmSendMessage(cb: (msg: DmMessage) => void): () => void {
  const socket = getDmSocket();
  socket.on('sendMessage', cb);
  return () => socket.off('sendMessage', cb);
}

export function onEditMessage(cb: (data: EditedMessage) => void): () => void {
  const socket = getDmSocket();
  socket.on('editMessage', cb);
  return () => socket.off('editMessage', cb);
}

export function onDmDeleteMessage(cb: (data: DeletedMessage) => void): () => void {
  const socket = getDmSocket();
  socket.on('deleteMessage', cb);
  return () => socket.off('deleteMessage', cb);
}

export function onReadReceipt(cb: (data: ReadReceiptData) => void): () => void {
  const socket = getDmSocket();
  socket.on('readReceipt', cb);
  return () => socket.off('readReceipt', cb);
}

export function onConversationDeleted(cb: (data: ConversationDeletedData) => void): () => void {
  const socket = getDmSocket();
  socket.on('conversationDeleted', cb);
  return () => socket.off('conversationDeleted', cb);
}

export function onFeeConfirmed(cb: (data: FeeConfirmedData) => void): () => void {
  const socket = getDmSocket();
  socket.on('feeConfirmed', cb);
  return () => socket.off('feeConfirmed', cb);
}

export function onDmError(cb: (err: DmSocketError) => void): () => void {
  const socket = getDmSocket();
  socket.on('error', cb);
  return () => socket.off('error', cb);
}

// ─── Connection management ────────────────────────────────────────────────────

/** Reconnect with the latest auth token (call after login). */
export function reconnectDmSocket(): void {
  if (dmSocket) {
    dmSocket.disconnect();
    dmSocket = null;
    currentToken = null;
  }
  getDmSocket();
  console.log('[DM Socket] Reconnected with new token');
}

/** Fully close the connection (call on logout). */
export function disconnectDmSocket(): void {
  if (dmSocket) {
    dmSocket.disconnect();
    dmSocket = null;
    currentToken = null;
    console.log('[DM Socket] Disconnected and cleared');
  }
}
