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
  message?: string;
  msg?: string;
  code?: string;
  fee?: number;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let dmSocket: Socket | null = null;
let currentToken: string | null = null;

// Persistent listener registry — survives socket replacement on token refresh.
// Maps event name → set of callbacks that must always be attached to the active socket.
type AnyFn = (...args: any[]) => void;
const persistentListeners: Map<string, Set<AnyFn>> = new Map();

/** Register a persistent listener that auto-reattaches to new socket instances. */
function addPersistentListener(event: string, cb: AnyFn): () => void {
  if (!persistentListeners.has(event)) persistentListeners.set(event, new Set());
  persistentListeners.get(event)!.add(cb);
  getDmSocket().on(event, cb);
  return () => {
    persistentListeners.get(event)?.delete(cb);
    dmSocket?.off(event, cb); // use current dmSocket at cleanup time
  };
}

function getDmSocket(): Socket {
  const token = getAuthToken();

  if (dmSocket && currentToken !== token) {
    dmSocket.disconnect();
    dmSocket = null;
  }

  if (!dmSocket) {
    currentToken = token;
    loadPendingReceipts();
    const address = typeof window !== 'undefined' ? localStorage.getItem('dehub_wallet') : null;

    const handshakeAuth: Record<string, string> = {};
    const tokenTrim = token?.replace(/^Bearer\s+/i, '').trim();
    if (tokenTrim) handshakeAuth.token = `Bearer ${tokenTrim}`;
    if (address) handshakeAuth.address = address.toLowerCase();
    // Include MongoDB _id so the server can register the Redis session under user:{_id},
    // which is the key it uses when looking up who to push readReceipt events to.
    try {
      const userJson = typeof window !== 'undefined' ? localStorage.getItem('dehub_user') : null;
      if (userJson) {
        const userObj = JSON.parse(userJson);
        const userId = userObj?._id || userObj?.id;
        if (userId) handshakeAuth.userId = String(userId);
      }
    } catch { /* ignore parse errors */ }

    dmSocket = io(`${DEHUB_API_BASE}/dm`, {
      auth: handshakeAuth,
      query: handshakeAuth,
      path: '/socket.io',
      // Polling-only: websocket upgrade to api.dehub.io often fails in browsers (see console wss errors);
      // paid/pending messages depend on a stable /dm socket.
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

    // Re-attach all persistent listeners to the new socket instance
    for (const [event, cbs] of persistentListeners) {
      for (const cb of cbs) {
        dmSocket.on(event, cb);
      }
    }

    dmSocket.on('connect', () => {
      console.log('[DM Socket] Connected', dmSocket?.id);
      // Flush any queued read receipts from previous sessions
      if (dmSocket) flushReadReceiptQueue(dmSocket);
    });

    dmSocket.on('disconnect', (reason) => {
      console.log('[DM Socket] Disconnected:', reason);
    });

    dmSocket.on('connect_error', (err) => {
      // Suppress noisy logs after repeated failures
      console.warn('[DM Socket] Connection error:', err.message);
    });

    // Debug: log all incoming events from server (stringify error payload for visibility)
    dmSocket.onAny((event, ...args) => {
      if (event === 'error') {
        const err = args[0];
        console.warn('[DM Socket] ← server error:', typeof err === 'object' ? JSON.stringify(err) : err);
      } else {
        console.log('[DM Socket] ← server event:', event, args);
      }
    });
  }

  return dmSocket;
}

// ─── Emitters ─────────────────────────────────────────────────────────────────

/** In-flight createAndStart promises keyed by userId — prevents duplicate socket.once registrations. */
const inFlightCreateAndStart = new Map<string, Promise<DmConversation>>();

const CREATE_AND_START_TIMEOUT_MS = 25000;
const SOCKET_CONNECT_WAIT_MS = 12000;

/** Wait for DM socket to be connected before emitting. Rejects if not connected within timeout. */
function waitForSocketConnection(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
      reject(new Error('DM socket connection timeout'));
    }, SOCKET_CONNECT_WAIT_MS);
    const onConnect = () => {
      clearTimeout(timeoutId);
      socket.off('connect_error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      clearTimeout(timeoutId);
      socket.off('connect', onConnect);
      reject(err);
    };
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

/**
 * Emit createAndStart to get/create a DM conversation with a user.
 * Concurrent calls for the same userId share a single in-flight promise.
 * Waits for socket connection before emitting. Returns a Promise that resolves with the DmConversation data including dmFee.
 */
export function emitCreateAndStart(userId: string): Promise<DmConversation> {
  const existing = inFlightCreateAndStart.get(userId);
  if (existing) {
    console.log('[DM Socket] createAndStart deduped for', userId);
    return existing;
  }

  const promise = (async () => {
    const socket = getDmSocket();
    try {
      await waitForSocketConnection(socket);
    } catch (err) {
      inFlightCreateAndStart.delete(userId);
      throw err;
    }

    return new Promise<DmConversation>((resolve, reject) => {
      let settled = false;

      const settle = (conversation: DmConversation | null, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        socket.off('createAndStart', onEvent);
        socket.off('error', onErrorEvent);
        inFlightCreateAndStart.delete(userId);
        if (error) reject(error);
        else resolve(conversation!);
      };

      const timeoutId = setTimeout(() => {
        settle(null, new Error('createAndStart timeout'));
      }, CREATE_AND_START_TIMEOUT_MS);

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
  })();

  inFlightCreateAndStart.set(userId, promise);
  return promise;
}

export function emitSendMessage(payload: SendMessagePayload): void {
  getDmSocket().emit('sendMessage', payload);
}

// ─── Read-receipt queue (survives disconnect/reconnect) ──────────────────────

const pendingReadReceipts = new Set<string>();
const PENDING_RR_KEY = 'dehub-pending-read-receipts';

function loadPendingReceipts(): void {
  try {
    const raw = localStorage.getItem(PENDING_RR_KEY);
    if (raw) {
      const ids = JSON.parse(raw) as string[];
      ids.forEach(id => pendingReadReceipts.add(id));
    }
  } catch { /* ignore */ }
}

function savePendingReceipts(): void {
  try {
    localStorage.setItem(PENDING_RR_KEY, JSON.stringify([...pendingReadReceipts]));
  } catch { /* storage full */ }
}

function flushReadReceiptQueue(socket: Socket): void {
  if (!socket.connected || pendingReadReceipts.size === 0) return;
  for (const dmId of pendingReadReceipts) {
    socket.emit('readReceipt', { dmId });
  }
  pendingReadReceipts.clear();
  savePendingReceipts();
}

export function emitReadReceipt(dmId: string): void {
  const socket = getDmSocket();
  pendingReadReceipts.add(dmId);
  savePendingReceipts();

  console.log('[DM Socket] emitReadReceipt', { dmId, connected: socket.connected });
  if (socket.connected) {
    flushReadReceiptQueue(socket);
  }
  // Queue will be flushed on next 'connect' event (see getDmSocket connect handler)
}

export function emitDeleteMessage(dmId: string, messageId: string): void {
  getDmSocket().emit('deleteMessage', { dmId, messageId });
}

export function emitDownloadReceipt(dmId: string, messageId: string): void {
  getDmSocket().emit('downloadReceipt', { dmId, messageId });
}

// ─── Event listeners (all return an unsubscribe fn for useEffect cleanup) ─────

export function onDmSendMessage(cb: (msg: DmMessage) => void): () => void {
  return addPersistentListener('sendMessage', cb as AnyFn);
}

export function onEditMessage(cb: (data: EditedMessage) => void): () => void {
  return addPersistentListener('editMessage', cb as AnyFn);
}

export function onDmDeleteMessage(cb: (data: DeletedMessage) => void): () => void {
  return addPersistentListener('deleteMessage', cb as AnyFn);
}

export function onReadReceipt(cb: (data: ReadReceiptData) => void): () => void {
  return addPersistentListener('readReceipt', cb as AnyFn);
}

export function onConversationDeleted(cb: (data: ConversationDeletedData) => void): () => void {
  return addPersistentListener('conversationDeleted', cb as AnyFn);
}

export function onFeeConfirmed(cb: (data: FeeConfirmedData) => void): () => void {
  return addPersistentListener('feeConfirmed', cb as AnyFn);
}

/** Revalidated message (e.g. after media upload completes). */
export interface ReValidateMessageData {
  dmId: string;
  message: DmMessage;
}

export function onReValidateMessage(cb: (data: ReValidateMessageData) => void): () => void {
  return addPersistentListener('ReValidateMessage', cb as AnyFn);
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
