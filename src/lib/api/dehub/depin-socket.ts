/**
 * DePin Socket
 * ============
 * Manages a Socket.io connection to the `/depin` namespace, used by the
 * browser-based backup/pinning node while a visitor is opted in on the DePin
 * page. Unlike the DM socket (always-on singleton for the whole session),
 * this connection is intentionally short-lived: it is opened when the user
 * opts in and closed again on opt-out or unmount — there is no background
 * persistence beyond the open tab.
 *
 * The node's identity is never sent from here. The server reads the wallet
 * out of the signed session presented on the handshake and refuses the
 * connection without one, so there is no register message and no way for a
 * client to claim a wallet that is not its own.
 *
 * Usage:
 *   const socket = connectDepinSocket();
 *   const unsub = onDepinAssign((assignment) => { ... });
 *   return () => { unsub(); disconnectDepinSocket(); };
 */

import { io, Socket } from 'socket.io-client';
import { DEHUB_API_BASE, ensureFreshToken, getAuthToken } from './core';

// ─── Socket event payload types ───────────────────────────────────────────────

export interface DepinRegisteredData {
  nodeId: string;
}

export interface DepinAssignData {
  assetKey: string;
  tokenId?: string;
  url: string;
  sha256?: string;
}

export interface DepinStoredPayload {
  assetKey: string;
  sha256: string;
}

/**
 * Byte ranges to hash, INCLUSIVE of both `start` and `end` — the server
 * hashes the canonical copy with an HTTP Range header, which is inclusive.
 * `Blob.slice` is not, so a reader has to add 1 to `end`.
 */
export interface DepinChallengeData {
  assetKey: string;
  ranges: { start: number; end: number }[];
}

/** `lost: true` tells the server the local copy is gone (evicted, quota pressure) so it can reassign instead of waiting out a timeout. */
export interface DepinChallengeResponsePayload {
  assetKey: string;
  hash?: string;
  lost?: true;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let depinSocket: Socket | null = null;

/**
 * Open (or return the existing) `/depin` socket, authenticated by the current
 * session.
 *
 * The token is refreshed first, not read straight out of storage. Access
 * tokens last 15 minutes, the server refuses a handshake it cannot verify,
 * and the handshake happens once — so a stored token that expired while the
 * page sat open means the socket is dropped the instant it connects, and the
 * node waits on a `depin:registered` that is never coming. `apiCall` already
 * refreshes for the same reason; this has to as well.
 */
export async function connectDepinSocket(): Promise<Socket> {
  if (depinSocket) return depinSocket;

  let token: string | null = null;
  try {
    token = await ensureFreshToken();
  } catch {
    // Signed out or unrefreshable — fall back to whatever is stored so the
    // server gets to make the call, and the caller sees the refusal.
    token = getAuthToken();
  }
  const handshakeAuth: Record<string, string> = {};
  const tokenTrim = token?.replace(/^Bearer\s+/i, '').trim();
  if (tokenTrim) handshakeAuth.token = `Bearer ${tokenTrim}`;

  depinSocket = io(`${DEHUB_API_BASE}/depin`, {
    auth: handshakeAuth,
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
  });

  depinSocket.on('connect', () => {
    console.log('[DePin Socket] Connected', depinSocket?.id);
  });
  depinSocket.on('disconnect', (reason) => {
    console.log('[DePin Socket] Disconnected:', reason);
  });
  depinSocket.on('connect_error', (err) => {
    console.warn('[DePin Socket] Connection error:', err.message);
  });

  return depinSocket;
}

/** Fully close the connection (call on opt-out / page unmount). */
export function disconnectDepinSocket(): void {
  if (depinSocket) {
    depinSocket.removeAllListeners();
    depinSocket.disconnect();
    depinSocket = null;
    console.log('[DePin Socket] Disconnected and cleared');
  }
}

export function isDepinSocketConnected(): boolean {
  return !!depinSocket?.connected;
}

// ─── Emitters ─────────────────────────────────────────────────────────────────

export function emitDepinStored(payload: DepinStoredPayload): void {
  depinSocket?.emit('depin:stored', payload);
}

export function emitDepinChallengeResponse(payload: DepinChallengeResponsePayload): void {
  depinSocket?.emit('depin:challenge-response', payload);
}

// ─── Listeners (all return an unsubscribe fn for useEffect cleanup) ───────────

function onEvent<T>(event: string, cb: (data: T) => void): () => void {
  if (!depinSocket) return () => {};
  const socket = depinSocket;
  socket.on(event, cb as (...args: unknown[]) => void);
  return () => socket.off(event, cb as (...args: unknown[]) => void);
}

export function onDepinRegistered(cb: (data: DepinRegisteredData) => void): () => void {
  return onEvent('depin:registered', cb);
}

export function onDepinAssign(cb: (data: DepinAssignData) => void): () => void {
  return onEvent('depin:assign', cb);
}

export function onDepinChallenge(cb: (data: DepinChallengeData) => void): () => void {
  return onEvent('depin:challenge', cb);
}

/**
 * The server drops a handshake it cannot verify, so a refused session shows
 * up here and nowhere else. Without watching for it the node sits on
 * "connecting" forever, which is indistinguishable from a slow network.
 */
export function onDepinDisconnect(cb: (reason: string) => void): () => void {
  return onEvent('disconnect', cb);
}

export function onDepinConnectError(cb: (err: Error) => void): () => void {
  return onEvent('connect_error', cb);
}
