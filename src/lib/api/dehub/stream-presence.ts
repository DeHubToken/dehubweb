/**
 * Live stream presence
 * ====================
 * Tells the backend that this tab is watching a stream, so the creator's
 * "watching" number counts the people actually there.
 *
 * Web viewers were never counted at all. `addViewer` — the thing that bumps
 * `totalViews`, moves `peakViewers` and drives the Redis concurrent count — is
 * reachable only through the root-namespace stream gateway, and there is no
 * HTTP route for it. Only the mobile app ever connected, so production streams
 * show peaks of 0, 1 and 3: every browser viewer in the platform's history is
 * missing from those numbers.
 *
 * This connects to the same gateway mobile uses. Deliberately NOT the
 * `/livechat` namespace: that one carries messages, this one carries presence,
 * and the gateway that owns presence already handles the hard part — a viewer
 * who closes the tab is dropped on socket disconnect, so a count cannot drift
 * upward the way an HTTP join with no matching leave would.
 *
 * The whole module is loaded on demand (see use-stream-presence) so
 * socket.io-client stays off the boot path.
 */
import { io, Socket } from 'socket.io-client';
import { DEHUB_API_BASE, getAuthToken } from './core';

/** Matches LivestreamEvents on the backend. These strings are the contract. */
const EVENT = {
  joinStream: 'stream.join',
  leaveStream: 'stream.left',
  viewCountUpdate: 'stream.viewers.update',
} as const;

let socket: Socket | null = null;
let socketToken: string | null = null;

/**
 * The root-namespace socket, shared by every stream this tab has open.
 *
 * Rebuilt when the session token changes: the gateway reads the viewer's
 * address off the handshake, and a stale token would keep counting the
 * previous account.
 */
function getStreamSocket(): Socket {
  const token = getAuthToken();

  if (socket && socketToken !== token) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    socket = io(DEHUB_API_BASE, {
      auth: token ? { token } : {},
      query: token ? { token } : {},
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 20,
      timeout: 20000,
    });
    socketToken = token;
  }

  return socket;
}

export interface StreamPresence {
  /** Stop counting this tab as a viewer. Safe to call twice. */
  leave: () => void;
}

/**
 * Join a stream as a viewer and report the count back as it changes.
 *
 * `streamId` is the Mongo ObjectId every `/api/live/{id}/*` route takes, never
 * the NFT tokenId — the gateway looks the stream up by it and a tokenId simply
 * matches nothing.
 *
 * Anonymous viewers are not counted: the gateway's join handler is auth-guarded
 * and returns early without an address. Rather than open a socket that will be
 * ignored, this reports that up front by doing nothing.
 */
export function joinStreamPresence(
  streamId: string,
  onViewerCount?: (count: number) => void,
): StreamPresence {
  if (!streamId || !getAuthToken()) {
    return { leave: () => undefined };
  }

  const s = getStreamSocket();
  let left = false;

  const join = () => {
    if (!left) s.emit(EVENT.joinStream, { streamId });
  };

  const handleCount = (data: { viewerCount?: number }) => {
    if (typeof data?.viewerCount === 'number') onViewerCount?.(data.viewerCount);
  };

  // Re-join on every connect, not just the first: a reconnect starts a new
  // socket id server-side, and the viewer row was dropped when the old one
  // disconnected.
  s.on('connect', join);
  s.on(EVENT.viewCountUpdate, handleCount);
  s.on(EVENT.joinStream, handleCount);
  s.on(EVENT.leaveStream, handleCount);
  if (s.connected) join();

  return {
    leave: () => {
      if (left) return;
      left = true;
      s.off('connect', join);
      s.off(EVENT.viewCountUpdate, handleCount);
      s.off(EVENT.joinStream, handleCount);
      s.off(EVENT.leaveStream, handleCount);
      // Best-effort: if the socket is already gone the server has dropped this
      // viewer on disconnect anyway, which is the case this design leans on.
      if (s.connected) s.emit(EVENT.leaveStream, { streamId });
    },
  };
}
