/**
 * Pair Socket Singleton
 * =====================
 * Persistent Socket.io connection to the /pair namespace — matchmaking and
 * WebRTC signalling for random 1:1 chat. Separate from the livechat socket in
 * socket.ts and the DM socket in dm-socket.ts.
 *
 * The server relays SDP and ICE only; media goes directly between peers.
 *
 * Usage:
 *   const unsub = onPairMatched((m) => { ... });
 *   emitPairEnqueue();
 *   return () => unsub();
 */

import { io, Socket } from 'socket.io-client';
import { DEHUB_API_BASE, getAuthToken } from './core';

// ─── Event names (must match dehub-stream-backend src/pair/pair.types.ts) ────

export const PairEvent = {
  enqueue: 'pair:enqueue',
  dequeue: 'pair:dequeue',
  next: 'pair:next',
  endSession: 'pair:endSession',
  signal: 'pair:signal',
  queued: 'pair:queued',
  matched: 'pair:matched',
  peerLeft: 'pair:peerLeft',
  error: 'pair:error',
  ping: 'pair:ping',
  pong: 'pair:pong',
} as const;

// ─── Payload types ───────────────────────────────────────────────────────────

export type SignalKind = 'offer' | 'answer' | 'candidates';

export interface PairIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PairQueued {
  iceServers: PairIceServer[];
}

export interface PairMatched {
  sessionId: string;
  role: 'caller' | 'callee';
  peer: { username: string | null };
}

export interface PairSignal {
  sessionId: string;
  kind: SignalKind;
  payload: any;
}

export interface PairPeerLeft {
  sessionId: string;
  reason: 'next' | 'ended' | 'disconnect' | 'timeout';
}

export interface PairSocketError {
  msg?: string;
  message?: string;
  code?: string;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let pairSocket: Socket | null = null;
let currentToken: string | null = null;

type AnyFn = (...args: any[]) => void;
const persistentListeners: Map<string, Set<AnyFn>> = new Map();

/** Register a listener that survives socket replacement on token refresh. */
function addPersistentListener(event: string, cb: AnyFn): () => void {
  if (!persistentListeners.has(event)) persistentListeners.set(event, new Set());
  persistentListeners.get(event)!.add(cb);
  getPairSocket().on(event, cb);
  return () => {
    persistentListeners.get(event)?.delete(cb);
    pairSocket?.off(event, cb);
  };
}

export function getPairSocket(): Socket {
  const token = getAuthToken();

  if (pairSocket && currentToken !== token) {
    pairSocket.disconnect();
    pairSocket = null;
  }

  if (!pairSocket) {
    currentToken = token;
    const address = typeof window !== 'undefined' ? localStorage.getItem('dehub_wallet') : null;

    const handshakeAuth: Record<string, string> = {};
    const tokenTrim = token?.replace(/^Bearer\s+/i, '').trim();
    if (tokenTrim) handshakeAuth.token = `Bearer ${tokenTrim}`;
    if (address) handshakeAuth.address = address.toLowerCase();

    pairSocket = io(`${DEHUB_API_BASE}/pair`, {
      auth: handshakeAuth,
      query: handshakeAuth,
      path: '/socket.io',
      // Unlike /dm, the websocket upgrade is left enabled. Signalling is
      // latency-sensitive — every SDP and ICE message on long-polling is a
      // full HTTP round trip, and setup time is what a skip-driven surface is
      // judged on. Socket.io falls back to polling on its own if the upgrade
      // fails, so this is strictly better where websockets do work.
      transports: ['websocket', 'polling'],
      upgrade: true,
      forceNew: true,
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 20,
      timeout: 20000,
    });

    for (const [event, cbs] of persistentListeners) {
      for (const cb of cbs) pairSocket.on(event, cb);
    }

    pairSocket.on('connect', () => {
      console.log('[Pair Socket] Connected', pairSocket?.id);
    });

    pairSocket.on('disconnect', (reason) => {
      console.log('[Pair Socket] Disconnected:', reason);
    });

    pairSocket.on('connect_error', (err) => {
      console.warn('[Pair Socket] Connection error:', err.message);
    });

    if (import.meta.env.DEV) {
      pairSocket.onAny((event, ...args) => {
        console.log('[Pair Socket] ← server event:', event, args);
      });
    }
  }

  return pairSocket;
}

// ─── Emitters ────────────────────────────────────────────────────────────────

export function emitPairEnqueue(): void {
  getPairSocket().emit(PairEvent.enqueue);
}

export function emitPairDequeue(): void {
  getPairSocket().emit(PairEvent.dequeue);
}

export function emitPairNext(sessionId?: string): void {
  getPairSocket().emit(PairEvent.next, { sessionId });
}

export function emitPairSignal(sessionId: string, kind: SignalKind, payload: any): void {
  getPairSocket().emit(PairEvent.signal, { sessionId, kind, payload });
}

export function emitPairEndSession(
  sessionId: string,
  stats?: { connected?: boolean; relayUsed?: boolean },
): void {
  getPairSocket().emit(PairEvent.endSession, { sessionId, ...stats });
}

// ─── Listeners (all return an unsubscribe fn for useEffect cleanup) ──────────

export function onPairQueued(cb: (data: PairQueued) => void): () => void {
  return addPersistentListener(PairEvent.queued, cb as AnyFn);
}

export function onPairMatched(cb: (data: PairMatched) => void): () => void {
  return addPersistentListener(PairEvent.matched, cb as AnyFn);
}

export function onPairSignal(cb: (data: PairSignal) => void): () => void {
  return addPersistentListener(PairEvent.signal, cb as AnyFn);
}

export function onPairPeerLeft(cb: (data: PairPeerLeft) => void): () => void {
  return addPersistentListener(PairEvent.peerLeft, cb as AnyFn);
}

export function onPairError(cb: (err: PairSocketError) => void): () => void {
  return addPersistentListener(PairEvent.error, cb as AnyFn);
}

// ─── Connection management ───────────────────────────────────────────────────

export function disconnectPairSocket(): void {
  if (pairSocket) {
    pairSocket.disconnect();
    pairSocket = null;
    currentToken = null;
  }
}
