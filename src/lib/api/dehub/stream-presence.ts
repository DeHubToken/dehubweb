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
  /** Subscribes the socket to a stream's broadcasts. Counts nobody. */
  joinRoom: 'stream.join.room',
  joinStream: 'stream.join',
  leaveStream: 'stream.left',
  /**
   * The same join and leave for a viewer with no account. Separate events
   * because the signed-in pair is auth-guarded and keyed on a wallet address —
   * which is exactly why a logged-out viewer used to be counted as nobody. The
   * gateway counts these by socket id instead, and refuses one that already
   * authenticated so a tab cannot occupy both seats.
   */
  anonJoinStream: 'stream.join.anon',
  anonLeaveStream: 'stream.left.anon',
  viewCountUpdate: 'stream.viewers.update',
} as const;

interface StreamConnection {
  socket: Socket;
  /** The session token its handshake was built with. */
  token: string | null;
  /** How many presences are still holding it. */
  refs: number;
}

/** The connection new presences are handed. Retired ones are not tracked here. */
let active: StreamConnection | null = null;

/**
 * Take a share of the root-namespace socket, shared by every stream this tab
 * has open.
 *
 * A new session needs a new socket — the gateway reads the viewer's address off
 * the handshake, and a stale token would keep counting the previous account.
 * What it must NOT do is disconnect the old one: this used to, and every
 * presence opened before the token rotated kept a reference to a socket that
 * had just been closed under it. Those viewers stopped being counted, their
 * number froze at whatever it last was, and their `leave` became a no-op —
 * silently, on the very screens these counts exist for. A manual `disconnect()`
 * also cancels reconnection, so the socket never came back.
 *
 * So a rotated token retires the connection instead: it stops being handed out,
 * and closes itself once its last holder leaves.
 */
function acquireStreamSocket(): StreamConnection {
  const token = getAuthToken();

  // Retire, don't close. Whoever still holds it keeps a working socket.
  if (active && active.token !== token) active = null;

  if (!active) {
    active = {
      token,
      refs: 0,
      socket: io(DEHUB_API_BASE, {
        auth: token ? { token } : {},
        query: token ? { token } : {},
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 20,
        timeout: 20000,
      }),
    };
  }

  active.refs += 1;
  return active;
}

/** Give a share back. The socket closes when the last one is returned. */
function releaseStreamSocket(conn: StreamConnection): void {
  conn.refs -= 1;
  if (conn.refs > 0) return;
  if (active === conn) active = null;
  conn.socket.disconnect();
}

/**
 * Is this count update about the stream a presence is watching?
 *
 * One socket carries every stream this tab has open, so a handler hears the
 * other streams' updates too. Permissive when the payload carries no
 * `streamId`: the gateway does not always send one, and dropping those would
 * throw away the only number some surfaces ever get.
 */
function isForStream(data: { streamId?: string } | undefined, streamId: string): boolean {
  return !data?.streamId || data.streamId === streamId;
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
 * Signed in or not, this tab is counted. Which pair of events it uses is the
 * only difference: `stream.join` is auth-guarded and keys the viewer by wallet
 * address, so a logged-out tab used to bail out here and be counted as nobody —
 * a creator whose audience was not signed in read "0 watching" over a stream
 * people were watching. `stream.join.anon` counts by socket id instead.
 *
 * The choice is made once, at join, from whether a token is on disk. It is not
 * re-evaluated if the viewer signs in mid-stream: they keep the anonymous seat
 * until the socket closes, which counts them exactly once either way. Claiming
 * the second seat is the failure worth avoiding, and the gateway refuses it
 * anyway.
 */
export function joinStreamPresence(
  streamId: string,
  onViewerCount?: (count: number) => void,
): StreamPresence {
  if (!streamId) {
    return { leave: () => undefined };
  }

  const identified = !!getAuthToken();
  const joinEvent = identified ? EVENT.joinStream : EVENT.anonJoinStream;
  const leaveEvent = identified ? EVENT.leaveStream : EVENT.anonLeaveStream;

  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;

  const join = () => {
    if (!left) s.emit(joinEvent, { streamId });
  };

  const handleCount = (data: { viewerCount?: number; streamId?: string }) => {
    if (!isForStream(data, streamId)) return;
    if (typeof data?.viewerCount === 'number') onViewerCount?.(data.viewerCount);
  };

  // Re-join on every connect, not just the first: a reconnect starts a new
  // socket id server-side, and the viewer row was dropped when the old one
  // disconnected. That is doubly true anonymously, where the socket id IS the
  // identity — the old one counts for nothing the moment it drops.
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
      if (s.connected) s.emit(leaveEvent, { streamId });
      releaseStreamSocket(conn);
    },
  };
}

/**
 * Read the audience without joining it.
 *
 * A host is not a viewer. `joinStreamPresence` above emits `stream.join`,
 * which adds a viewer row, bumps `totalViews` and moves `peakViewers` — so
 * pointing the broadcaster's own console at it would have the creator counting
 * themselves and inflating their own numbers on every reconnect. The gateway
 * has a separate, unguarded `stream.join.room` that only subscribes the socket
 * to the stream's broadcasts, which is exactly what a spectator of the count
 * needs.
 *
 * The count arrives on the next join or leave, not on subscribe — there is no
 * "tell me now" event — so the caller keeps whatever it had until then.
 */
export function watchStreamPresence(
  streamId: string,
  onViewerCount: (count: number) => void,
): StreamPresence {
  if (!streamId) return { leave: () => undefined };

  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;

  const join = () => {
    if (!left) s.emit(EVENT.joinRoom, { streamId });
  };

  const handleCount = (data: { viewerCount?: number; streamId?: string }) => {
    if (!isForStream(data, streamId)) return;
    if (typeof data?.viewerCount === 'number') onViewerCount(data.viewerCount);
  };

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
      // No counterpart emit: nothing was counted, and the socket leaves the
      // room on disconnect anyway.
      releaseStreamSocket(conn);
    },
  };
}
