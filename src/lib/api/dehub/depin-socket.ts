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
 * Usage:
 *   const socket = connectDepinSocket(walletAddress);
 *   const unsub = onDepinAssign((assignment) => { ... });
 *   return () => { unsub(); disconnectDepinSocket(); };
 */

import { io, Socket } from 'socket.io-client';
import { DEHUB_API_BASE, getAuthToken } from './core';

// ─── Socket event payload types ───────────────────────────────────────────────

export interface DepinRegisterPayload {
  walletAddress: string;
}

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
  nodeId: string;
  sha256: string;
}

export interface DepinChallengeData {
  assetKey: string;
  byteStart: number;
  byteEnd: number;
}

/** `lost: true` tells the server the local copy is gone (evicted, quota pressure) so it can reassign instead of waiting out a timeout. */
export interface DepinChallengeResponsePayload {
  assetKey: string;
  hash?: string;
  lost?: true;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let depinSocket: Socket | null = null;

/** Open (or return the existing) `/depin` socket, authenticated as `walletAddress`. */
export function connectDepinSocket(walletAddress: string): Socket {
  if (depinSocket) return depinSocket;

  const token = getAuthToken();
  const handshakeAuth: Record<string, string> = { address: walletAddress.toLowerCase() };
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

export function emitDepinRegister(payload: DepinRegisterPayload): void {
  depinSocket?.emit('depin:register', payload);
}

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
