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
    dmSocket = io(`${DEHUB_API_BASE}/dm`, {
      auth: token ? { token: `Bearer ${token}` } : undefined,
      // Start with polling (better CORS compat), then upgrade to WebSocket
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 15000,
      // Limit retries — if /dm namespace isn't on server, don't spam
      reconnectionAttempts: 3,
      timeout: 15000,
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

    const timeout = setTimeout(() => {
      socket.off('createAndStart', onSuccess);
      socket.off('error', onError);
      reject(new Error('createAndStart timeout'));
    }, 15000);

    const onSuccess = (response: any) => {
      clearTimeout(timeout);
      socket.off('error', onError);
      // Server responds with { msg, data: { ...dm, dmFee } }
      const conversation: DmConversation = response?.data || response;
      resolve(conversation);
    };

    const onError = (err: DmSocketError) => {
      clearTimeout(timeout);
      socket.off('createAndStart', onSuccess);
      reject(new Error(err.message || 'DM socket error'));
    };

    socket.once('createAndStart', onSuccess);
    socket.once('error', onError);
    socket.emit('createAndStart', { _id: userId });
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
