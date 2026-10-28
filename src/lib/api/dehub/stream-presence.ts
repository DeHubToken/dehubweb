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
import { liveReactionType, type LiveReactionType } from '@/lib/live/reaction-flow';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import { reviveOnReturn } from '@/lib/socket-revive';

/** Matches LivestreamEvents on the backend. These strings are the contract. */
const EVENT = {
  reaction: 'stream.reaction',
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
  /** A gift landed. The same event the mobile viewer plays its tiers off. */
  tipStreamer: 'streamer.tip',
  /** The chain paid for a gift. Carries the paid amount, never the claim. */
  tipConfirmed: 'streamer.tip.confirmed',
  follow: 'stream.follow',
  subscribe: 'stream.subscribe',
  /** Subscriptions bought for other people. One event per checkout. */
  giftSub: 'stream.giftSub',
  share: 'stream.share',
  /** The live creator saved their overlay; redraw it. */
  overlayUpdated: 'stream.overlay.updated',
} as const;

export interface StreamReactionBroadcast {
  reactionType: LiveReactionType;
  weight: number;
  isOwnReaction: boolean;
  /** Who reacted, lower-cased, when the gateway resolved them. */
  address: string | null;
}

export function watchStreamPlayback(streamId: string, onPaused: (paused: boolean) => void): StreamPresence {
  const conn = acquireStreamSocket();
  const socket = conn.socket;
  const join = () => socket.emit(EVENT.joinRoom, { streamId });
  const update = (paused: boolean) => (data: { streamId?: string }) => {
    if (data?.streamId === streamId) onPaused(paused);
  };
  const pause = update(true);
  const resume = update(false);
  socket.on('connect', join);
  socket.on('stream.paused', pause);
  socket.on('stream.resumed', resume);
  socket.on('stream.start', resume);
  if (socket.connected) join();
  let left = false;
  return { leave: () => {
    if (left) return;
    left = true;
    socket.off('connect', join);
    socket.off('stream.paused', pause);
    socket.off('stream.resumed', resume);
    socket.off('stream.start', resume);
    releaseStreamSocket(conn);
  } };
}

export function watchStreamReactions(streamId: string, onReaction: (event: StreamReactionBroadcast) => void): StreamPresence {
  const conn = acquireStreamSocket();
  const socket = conn.socket;
  let left = false;
  const join = () => { if (!left) socket.emit(EVENT.joinRoom, { streamId }); };
  const receive = (data: { streamId?: string; sourceSocketId?: string; reactionType?: unknown; weight?: number; user?: { address?: unknown } }) => {
    // One connection can watch several cards. Never leak applause into another room.
    if (data?.streamId !== streamId) return;
    const reactionType = liveReactionType(data.reactionType);
    const raw = data.user?.address;
    const address = typeof raw === 'string' && raw ? raw.toLowerCase() : null;
    if (reactionType) onReaction({ reactionType, weight: data.weight ?? 1, address,
      isOwnReaction: !!data.sourceSocketId && data.sourceSocketId === socket.id });
  };
  socket.on('connect', join);
  socket.on(EVENT.reaction, receive);
  if (socket.connected) join();
  return { leave: () => {
    if (left) return;
    left = true;
    socket.off('connect', join);
    socket.off(EVENT.reaction, receive);
    releaseStreamSocket(conn);
  } };
}

/** Broadcast a tap; the sender already plays its animation optimistically. */
export function sendStreamReaction(streamId: string, value: unknown): void {
  const reactionType = liveReactionType(value);
  if (!reactionType || !getAuthToken()) return;
  // Reactions are ephemeral: don't buffer old clicks over a disconnect.
  if (active?.socket.connected && active.token === getAuthToken()) {
    active.socket.emit(EVENT.reaction, { streamId, reactionType });
  }
}

export interface StreamConnection {
  socket: Socket;
  /** The session token its handshake was built with. */
  token: string | null;
  /** How many presences are still holding it. */
  refs: number;
  viewers: Map<string, { refs: number; join: () => void }>;
}

/** The connection new presences are handed. Retired ones are not tracked here. */
let active: StreamConnection | null = null;

/**
 * Take a share of the root-namespace socket every stream in this tab uses. A
 * rotated token gets a new socket and RETIRES the old one — closed once its
 * last holder leaves, never disconnected under presences still holding it.
 */
export function acquireStreamSocket(): StreamConnection {
  const token = getAuthToken();

  // Retire, don't close. Whoever still holds it keeps a working socket.
  if (active && active.token !== token) active = null;

  if (!active) {
    active = {
      token,
      refs: 0,
      viewers: new Map(),
      socket: io(DEHUB_API_BASE, {
        // Read the token at every handshake. Logins rotate every 15 minutes,
        // and a socket that reconnected after an idle spell still offered the
        // token it was built with: the gateway refused its rejoin as expired
        // and the viewer read "0 here" while still watching.
        auth: token ? (cb) => cb({ token: getAuthToken() || token }) : {},
        query: token ? { token } : {},
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 20000,
      }),
    };
    const socket = active.socket;
    // socket.io never retries a disconnect the server started on its own.
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') socket.connect();
    });
    reviveOnReturn(socket);
  }

  active.refs += 1;
  return active;
}

/** Give a share back. The socket closes when the last one is returned. */
export function releaseStreamSocket(conn: StreamConnection): void {
  conn.refs -= 1;
  if (conn.refs > 0) return;
  if (active === conn) active = null;
  conn.socket.disconnect();
}

/**
 * Is this count update about the stream a presence is watching?
 *
 * One socket carries every stream this tab has open, so a handler hears the
 * other streams' updates too. Only a tagged update can safely change this
 * stream's count.
 */
function isForStream(data: { streamId?: string } | undefined, streamId: string): boolean {
  return data?.streamId === streamId;
}

/**
 * Which stream a gift broadcast belongs to.
 *
 * Every other room event carries `streamId` beside its payload. A gift does
 * not: the gateway sends `{ gift: <activity row> }`, and the id is on the row.
 * Checking only the top level — which `isForStream` does, correctly, for
 * counts — threw away every gift a web viewer was sent, so the room saw no
 * celebration and heard no message unless they had sent it themselves.
 */
function giftStreamId(payload: any): string | undefined {
  const id = payload?.streamId ?? payload?.gift?.streamId;
  return id == null ? undefined : String(id);
}

export interface StreamPresence {
  /** Stop counting this tab as a viewer. Safe to call twice. */
  leave: () => void;
}

/** The viewer the gateway names on a join: the account's reference projection. */
export interface StreamJoinUser {
  address?: string;
  username?: string;
  displayName?: string;
  /** Stored path (`avatars/<address>.jpg`), resolved by `buildAvatarUrl`. */
  avatarImageUrl?: string;
}

/** Observe arrivals without registering another viewer. */
export function watchStreamJoins(
  streamId: string,
  onJoin: (user: StreamJoinUser) => void,
): StreamPresence {
  if (!streamId) return { leave: () => undefined };
  const conn = acquireStreamSocket();
  const socket = conn.socket;
  let left = false;
  const join = () => socket.emit(EVENT.joinRoom, { streamId });
  const handleJoin = (data: { streamId?: string; user?: StreamJoinUser }) => {
    if (data?.streamId === streamId && data.user) onJoin(data.user);
  };
  const handleAnonJoin = (data: { streamId?: string }) => {
    if (data?.streamId === streamId) onJoin({ username: _translateCopy("copy.cf9f5896322a", { defaultValue: "Visitor" }) });
  };
  socket.on('connect', join);
  socket.on(EVENT.joinStream, handleJoin);
  socket.on(EVENT.anonJoinStream, handleAnonJoin);
  if (socket.connected) join();
  return { leave: () => {
    if (left) return;
    left = true;
    socket.off('connect', join);
    socket.off(EVENT.joinStream, handleJoin);
    socket.off(EVENT.anonJoinStream, handleAnonJoin);
    releaseStreamSocket(conn);
  } };
}

/**
 * Join a stream as a viewer and report the count back as it changes.
 * `streamId` is the Mongo ObjectId, never the NFT tokenId. Signed-out tabs are
 * counted too, through `stream.join.anon`; the choice is made once, at join.
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

  let viewer = conn.viewers.get(streamId);
  if (!viewer) {
    viewer = { refs: 0, join: () => s.emit(joinEvent, { streamId }) };
    conn.viewers.set(streamId, viewer);
    s.on('connect', viewer.join);
  }
  viewer.refs += 1;

  const handleCount = (data: { viewerCount?: number; streamId?: string }) => {
    if (!isForStream(data, streamId)) return;
    if (typeof data?.viewerCount === 'number') onViewerCount?.(data.viewerCount);
  };

  // Re-join on every connect, not just the first: a reconnect starts a new
  // socket id server-side, and the viewer row was dropped when the old one
  // disconnected. That is doubly true anonymously, where the socket id IS the
  // identity — the old one counts for nothing the moment it drops.
  s.on(EVENT.viewCountUpdate, handleCount);
  s.on(EVENT.joinStream, handleCount);
  s.on(EVENT.leaveStream, handleCount);
  if (s.connected && viewer.refs === 1) viewer.join();

  return {
    leave: () => {
      if (left) return;
      left = true;
      s.off(EVENT.viewCountUpdate, handleCount);
      s.off(EVENT.joinStream, handleCount);
      s.off(EVENT.leaveStream, handleCount);
      // Best-effort: if the socket is already gone the server has dropped this
      // viewer on disconnect anyway, which is the case this design leans on.
      viewer.refs -= 1;
      if (viewer.refs === 0) {
        conn.viewers.delete(streamId);
        s.off('connect', viewer.join);
        if (s.connected) s.emit(leaveEvent, { streamId });
      }
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

/** What the gateway broadcasts when a gift lands. */
export interface StreamGiftBroadcast {
  amount: number;
  /** The tier the sender picked, by its English name. May be absent. */
  selectedTier?: string;
  username?: string;
  message?: string;
  /** Sender's wallet, lowercased, so a card can spot its own gift. */
  address?: string;
  /** The tip's tx hash, lowercased. The one key that says "this is mine"
   *  regardless of which address form the backend stamped on the row. */
  transactionHash?: string;
}

/**
 * A gift the chain has paid, from `streamer.tip.confirmed`. The amount is
 * what moved on chain, never the sender's claim.
 */
export interface StreamPaidGift {
  paidAmount: number;
  message?: string;
  address?: string;
  transactionHash?: string;
}

/**
 * Hear every gift sent to a stream, so the celebration plays for the whole
 * room rather than only for whoever paid.
 *
 * Subscribes through `stream.join.room` — the unguarded event that only puts
 * the socket in the stream's broadcast room. Presence is deliberately NOT
 * reused here: `joinStreamPresence` adds a viewer row, and the host's own card
 * needs to see gifts without counting themselves in their own audience.
 *
 * The payload is read defensively because two producers write it. The backend
 * nests the record under `gift.meta`, mobile's optimistic echo puts the same
 * fields at the top level, and neither is worth a broken celebration.
 */
export function watchStreamGifts(
  streamId: string,
  onGift: (gift: StreamGiftBroadcast) => void,
  /**
   * Called again once the tip is paid. `streamer.tip` goes out when a gift is
   * recorded, before anything is paid, with whatever the sender typed — so
   * anything a forged tip must not be able to trigger (reading a message out
   * to the room) waits for this.
   */
  onPaid?: (gift: StreamPaidGift) => void,
): StreamPresence {
  if (!streamId) return { leave: () => undefined };

  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;

  const join = () => {
    if (!left) s.emit(EVENT.joinRoom, { streamId });
  };

  const handleGift = (payload: any) => {
    if (giftStreamId(payload) !== streamId) return;
    const meta = payload?.gift?.meta ?? payload?.meta ?? payload?.gift ?? payload ?? {};
    const amount = Number(meta.amount ?? payload?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const account = payload?.gift?.user ?? payload?.gift?.account ?? payload?.user ?? undefined;
    onGift({
      amount,
      selectedTier: meta.selectedTier || undefined,
      username: meta.username || meta.displayName || account?.username || undefined,
      message: meta.message || undefined,
      address: String(meta.address || payload?.gift?.address || payload?.address || '').toLowerCase() || undefined,
      transactionHash: String(meta.transactionHash || payload?.transactionHash || '').toLowerCase() || undefined,
    });
  };

  const handlePaid = (data: any) => {
    if (!onPaid || !isForStream(data, streamId)) return;
    const paidAmount = Number(data?.paidAmount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) return;
    onPaid({
      paidAmount,
      message: typeof data?.message === 'string' && data.message.trim() ? data.message : undefined,
      address: String(data?.address || '').toLowerCase() || undefined,
      transactionHash: String(data?.transactionHash || '').toLowerCase() || undefined,
    });
  };

  s.on('connect', join);
  s.on(EVENT.tipStreamer, handleGift);
  s.on(EVENT.tipConfirmed, handlePaid);
  if (s.connected) join();

  return {
    leave: () => {
      if (left) return;
      left = true;
      s.off('connect', join);
      s.off(EVENT.tipStreamer, handleGift);
      s.off(EVENT.tipConfirmed, handlePaid);
      releaseStreamSocket(conn);
    },
  };
}

/**
 * Everything an overlay reacts to, in one shape.
 *
 * `tip` is the instant event, carrying the amount the sender typed;
 * `tipConfirmed` follows once the chain has paid, with the paid amount. A
 * widget that counts money — a goal, a leaderboard — reads only the second.
 */
export type LiveRoomEvent =
  | {
      type: 'tip';
      amount: number;
      selectedTier?: string;
      user: StreamJoinUser;
      message?: string;
      transactionHash?: string;
    }
  | {
      type: 'tipConfirmed';
      paidAmount: number;
      address: string;
      transactionHash: string;
      user?: StreamJoinUser;
      selectedTier?: string;
      message?: string;
    }
  | { type: 'follow' | 'share' | 'join'; user: StreamJoinUser }
  | { type: 'subscribe'; user: StreamJoinUser; planName?: string }
  | { type: 'giftSub'; user: StreamJoinUser; count: number; recipients: StreamJoinUser[]; planName?: string }
  | { type: 'viewers'; count: number }
  | { type: 'overlayUpdated'; version: number }
  | { type: 'reaction'; reactionType: string; user: StreamJoinUser }
  // From the stream's chat room, which is a different connection (use-overlay-chat).
  | { type: 'chat'; id: string; text: string; user: StreamJoinUser }
  | { type: 'chatDeleted'; id: string };

export function roomUser(raw: any): StreamJoinUser {
  const user = raw && typeof raw === 'object' ? raw : {};
  return {
    address: user.address ? String(user.address).toLowerCase() : undefined,
    username: user.username || undefined,
    displayName: user.displayName || undefined,
    avatarImageUrl: user.avatarImageUrl || undefined,
  };
}

/**
 * Hear a stream's room for its overlay, without counting the listener as a
 * viewer — the same unguarded room join the gift and reaction watchers use, so
 * the host's own preview and an OBS page see everything and inflate nothing.
 */
export function watchLiveRoomEvents(streamId: string, onEvent: (event: LiveRoomEvent) => void): StreamPresence {
  if (!streamId) return { leave: () => undefined };

  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;

  const join = () => {
    if (!left) s.emit(EVENT.joinRoom, { streamId });
  };

  const onTip = (payload: any) => {
    if (giftStreamId(payload) !== streamId) return;
    const meta = payload?.gift?.meta ?? payload?.meta ?? {};
    const amount = Number(meta.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    onEvent({
      type: 'tip',
      amount,
      selectedTier: meta.selectedTier || undefined,
      user: roomUser({
        address: meta.address || payload?.gift?.address,
        username: meta.username,
        displayName: meta.displayName,
        avatarImageUrl: meta.avatarImageUrl,
      }),
      message: meta.message || undefined,
      transactionHash: String(meta.transactionHash || '').toLowerCase() || undefined,
    });
  };

  const onTipConfirmed = (data: any) => {
    if (!isForStream(data, streamId)) return;
    const paidAmount = Number(data?.paidAmount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) return;
    onEvent({
      type: 'tipConfirmed',
      paidAmount,
      address: String(data?.address || '').toLowerCase(),
      transactionHash: String(data?.transactionHash || '').toLowerCase(),
      user: data?.user ? roomUser(data.user) : undefined,
      selectedTier: data?.selectedTier || undefined,
      message: data?.message || undefined,
    });
  };

  const onReaction = (data: any) => {
    if (!isForStream(data, streamId) || typeof data?.reactionType !== 'string') return;
    onEvent({ type: 'reaction', reactionType: data.reactionType, user: roomUser(data.user) });
  };

  const person = (type: 'follow' | 'share') => (data: any) => {
    if (!isForStream(data, streamId)) return;
    onEvent({ type, user: roomUser(data?.user) });
  };
  const onFollow = person('follow');
  const onShare = person('share');

  const onSubscribe = (data: any) => {
    if (!isForStream(data, streamId)) return;
    onEvent({ type: 'subscribe', user: roomUser(data?.user), planName: data?.planName || undefined });
  };

  const onGiftSub = (data: any) => {
    if (!isForStream(data, streamId)) return;
    const count = Math.max(1, Math.floor(Number(data?.count) || 1));
    const recipients = Array.isArray(data?.recipients) ? data.recipients.slice(0, 10).map(roomUser) : [];
    onEvent({ type: 'giftSub', user: roomUser(data?.user), count, recipients, planName: data?.planName || undefined });
  };

  // The gateway re-sends a viewer's join on every reconnect; telling a real
  // arrival from a returning socket is the widget's job, by address.
  const onJoin = (data: any) => {
    if (!isForStream(data, streamId)) return;
    if (data?.user?.address) onEvent({ type: 'join', user: roomUser(data.user) });
    if (typeof data?.viewerCount === 'number') onEvent({ type: 'viewers', count: data.viewerCount });
  };

  const onCount = (data: any) => {
    if (!isForStream(data, streamId)) return;
    if (typeof data?.viewerCount === 'number') onEvent({ type: 'viewers', count: data.viewerCount });
  };

  const onOverlay = (data: any) => {
    if (!isForStream(data, streamId)) return;
    onEvent({ type: 'overlayUpdated', version: Number(data?.version) || 0 });
  };

  const handlers: Array<[string, (data: any) => void]> = [
    [EVENT.tipStreamer, onTip],
    [EVENT.tipConfirmed, onTipConfirmed],
    [EVENT.follow, onFollow],
    [EVENT.share, onShare],
    [EVENT.subscribe, onSubscribe],
    [EVENT.giftSub, onGiftSub],
    [EVENT.joinStream, onJoin],
    [EVENT.viewCountUpdate, onCount],
    [EVENT.leaveStream, onCount],
    [EVENT.overlayUpdated, onOverlay],
    [EVENT.reaction, onReaction],
  ];

  s.on('connect', join);
  for (const [event, handler] of handlers) s.on(event, handler);
  if (s.connected) join();

  return {
    leave: () => {
      if (left) return;
      left = true;
      s.off('connect', join);
      for (const [event, handler] of handlers) s.off(event, handler);
      releaseStreamSocket(conn);
    },
  };
}
