/**
 * Media job progress
 * ==================
 * The API's JobGateway reports transcoding on the default namespace, one event
 * per job named after it: `<tokenId>` for a published post and
 * `draft:<draftId>` for a video still sitting in the composer, each carrying
 * `{ progress, stage }`. Nothing has to be joined — the events are broadcast —
 * so this keeps one shared connection open for as long as anything is
 * listening, and closes it when the last listener goes.
 *
 * socket.io-client is imported on first use, so a page that never follows a
 * job never loads it.
 */

import type { Socket } from 'socket.io-client';
import { DEHUB_API_BASE, getAuthToken } from './core';

export interface JobProgressEvent {
  progress?: number;
  stage?: string;
}

type Listener = (event: JobProgressEvent) => void;

const listeners = new Map<string, Set<Listener>>();
let socket: Socket | null = null;
let connecting = false;

function dispatch(channel: string, payload: unknown) {
  const set = listeners.get(channel);
  if (!set) return;
  const event: JobProgressEvent =
    payload && typeof payload === 'object' ? (payload as JobProgressEvent) : {};
  set.forEach((listener) => listener(event));
}

function connect() {
  if (socket || connecting || typeof window === 'undefined') return;
  connecting = true;
  import('socket.io-client')
    .then(({ io }) => {
      // Everyone may have left while the library loaded.
      if (listeners.size === 0 || socket) return;
      const token = getAuthToken();
      const identity = token ? { token } : {};
      socket = io(DEHUB_API_BASE, {
        auth: identity,
        query: identity,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 5_000,
      });
      socket.onAny((event: string, payload: unknown) => dispatch(event, payload));
    })
    .catch(() => {
      // No socket is fine: every follower also polls.
    })
    .finally(() => {
      connecting = false;
    });
}

/** Listen to one job channel. Returns the unsubscribe. */
export function subscribeJobChannel(channel: string, listener: Listener): () => void {
  let set = listeners.get(channel);
  if (!set) {
    set = new Set();
    listeners.set(channel, set);
  }
  set.add(listener);
  connect();
  return () => {
    const current = listeners.get(channel);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(channel);
    if (listeners.size === 0 && socket) {
      socket.disconnect();
      socket = null;
    }
  };
}
