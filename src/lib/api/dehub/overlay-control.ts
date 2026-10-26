/**
 * Kept out of stream-presence: that module is on the boot path through the
 * live card, and only Live Studio and the OBS page ever open this room.
 */
import {
  acquireStreamSocket,
  releaseStreamSocket,
  roomUser,
  type LiveRoomEvent,
  type StreamPresence,
} from './stream-presence';
import { parseRuleFired, type RuleFired } from '@/lib/live-overlay/rules';
import { parsePoll, type LivePoll } from '@/lib/live-overlay/polls';
import { parseHypeTrain, type HypeTrain } from './live-hype';

/**
 * A creator's overlay control room, `overlay:<token>`.
 *
 * Only the server writes into it, and only the creator's own surfaces — Live
 * Studio and their OBS page — listen. It carries what must never reach the
 * stream's viewers: test alerts, and the signal that the overlay changed.
 * `surface: 'obs'` is what lights "OBS connected" in Live Studio.
 */
export interface OverlayControlHandlers {
  /** A test alert, already shaped like the room events it imitates. */
  onTest?: (events: LiveRoomEvent[]) => void;
  onUpdated?: (version: number) => void;
  /** The token was rotated; this connection no longer means anything. */
  onRevoked?: () => void;
  /** A stream rule tested from Live Studio: what it shows, plays and reads. */
  onRule?: (fired: RuleFired) => void;
  /** The creator's subathon started, moved or stopped. */
  onSubathon?: (update: SubathonUpdate) => void;
  /** The creator's live poll opened, moved or closed. */
  onPoll?: (poll: LivePoll) => void;
  /** The server's answer to each join: false means the token is not (or no longer) real. */
  onJoined?: (ok: boolean) => void;
}

export function watchOverlayControl(
  token: string,
  surface: 'studio' | 'obs',
  handlers: OverlayControlHandlers,
): StreamPresence {
  if (!token) return { leave: () => undefined };

  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;

  // Joined on every connect: a socket that reconnects is a new socket to the
  // server, and its rooms are gone until it asks again.
  const join = () => {
    if (left) return;
    s.emit('overlay.join', { token, surface }, (ack: { ok?: boolean } | undefined) => {
      if (!left) handlers.onJoined?.(!!ack?.ok);
    });
  };

  const onTest = (data: any) => {
    const user = roomUser(data?.user);
    const at = String(data?.at || Date.now());
    switch (data?.kind) {
      case 'tip': {
        const amount = Number(data?.amount) || 1000;
        const transactionHash = `test-${at}`;
        // Both halves, so a widget that waits for the chain still plays.
        handlers.onTest?.([
          { type: 'tip', amount, user, message: data?.message || undefined, transactionHash },
          { type: 'tipConfirmed', paidAmount: amount, address: user.address || '', transactionHash },
        ]);
        return;
      }
      case 'follow':
      case 'share':
      case 'join':
        handlers.onTest?.([{ type: data.kind, user }]);
        return;
      case 'subscribe':
        handlers.onTest?.([{ type: 'subscribe', user, planName: data?.planName || undefined }]);
        return;
      default:
        return;
    }
  };
  const onUpdated = (data: any) => handlers.onUpdated?.(Number(data?.version) || 0);
  const onRevoked = () => handlers.onRevoked?.();
  // Only events without a stream id: the control room's copy. The stream room's copy names its stream.
  const onSubathon = (data: any) => {
    if (data?.streamId == null) handlers.onSubathon?.(parseSubathonUpdate(data));
  };
  const onPoll = (data: any) => {
    const poll = parsePoll(data);
    if (poll) handlers.onPoll?.(poll);
  };
  const onRule = (data: any) => {
    const fired = parseRuleFired(data);
    if (fired) handlers.onRule?.(fired);
  };

  // An OBS page says it is still open, so the badge in Live Studio stays lit.
  const ping = surface === 'obs' ? window.setInterval(() => s.emit('overlay.ping', { token }), 60_000) : 0;

  s.on('connect', join);
  s.on('overlay.test', onTest);
  s.on('overlay.updated', onUpdated);
  s.on('overlay.revoked', onRevoked);
  s.on('overlay.rule', onRule);
  if (handlers.onPoll) s.on('stream.poll', onPoll);
  if (handlers.onSubathon) s.on('stream.subathon', onSubathon);
  if (s.connected) join();

  return {
    leave: () => {
      if (left) return;
      left = true;
      if (ping) window.clearInterval(ping);
      s.emit('overlay.leave', { token });
      s.off('connect', join);
      s.off('overlay.test', onTest);
      s.off('overlay.updated', onUpdated);
      s.off('overlay.revoked', onRevoked);
      s.off('overlay.rule', onRule);
      s.off('stream.poll', onPoll);
      s.off('stream.subathon', onSubathon);
      releaseStreamSocket(conn);
    },
  };
}

/**
 * A stream's fired rules, `stream.rule.fired` in its room — for the surfaces
 * that play them (the overlay over a viewer's player, and the OBS page). Here
 * rather than in stream-presence for the same boot-path reason as above.
 */
export function watchStreamRules(streamId: string, onRule: (fired: RuleFired) => void): StreamPresence {
  if (!streamId) return { leave: () => undefined };

  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;

  const join = () => {
    if (!left) s.emit('stream.join.room', { streamId });
  };
  const onFired = (data: any) => {
    if (String(data?.streamId ?? '') !== streamId) return;
    const fired = parseRuleFired(data);
    if (fired) onRule(fired);
  };

  s.on('connect', join);
  s.on('stream.rule.fired', onFired);
  if (s.connected) join();

  return {
    leave: () => {
      if (left) return;
      left = true;
      s.off('connect', join);
      s.off('stream.rule.fired', onFired);
      releaseStreamSocket(conn);
    },
  };
}

/**
 * A stream's live poll, `stream.poll` in its room — the whole poll on open,
 * as votes come in, and on close. For the overlay over a viewer's player and
 * the OBS page; here for the same boot-path reason as above.
 */
export function watchStreamPoll(streamId: string, onPoll: (poll: LivePoll) => void): StreamPresence {
  if (!streamId) return { leave: () => undefined };

  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;

  const join = () => {
    if (!left) s.emit('stream.join.room', { streamId });
  };
  const onEvent = (data: any) => {
    const poll = parsePoll(data);
    if (poll && poll.streamId === streamId) onPoll(poll);
  };

  s.on('connect', join);
  s.on('stream.poll', onEvent);
  if (s.connected) join();

  return {
    leave: () => {
      if (left) return;
      left = true;
      s.off('connect', join);
      s.off('stream.poll', onEvent);
      releaseStreamSocket(conn);
    },
  };
}

/** A subathon moving: `stream.subathon` in the stream's room. Null when it stopped. */
export type SubathonUpdate = { running: boolean; endsAt: string | null; addedSec?: number };

function parseSubathonUpdate(data: any): SubathonUpdate {
  return {
    running: !!data?.running && typeof data?.endsAt === 'string',
    endsAt: typeof data?.endsAt === 'string' ? data.endsAt : null,
    addedSec: Number.isFinite(Number(data?.addedSec)) ? Number(data.addedSec) : undefined,
  };
}

export function watchStreamSubathon(streamId: string, onUpdate: (update: SubathonUpdate) => void): StreamPresence {
  if (!streamId) return { leave: () => undefined };

  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;

  const join = () => {
    if (!left) s.emit('stream.join.room', { streamId });
  };
  const onEvent = (data: any) => {
    if (String(data?.streamId ?? '') !== streamId) return;
    onUpdate(parseSubathonUpdate(data));
  };

  s.on('connect', join);
  s.on('stream.subathon', onEvent);
  if (s.connected) join();

  return {
    leave: () => {
      if (left) return;
      left = true;
      s.off('connect', join);
      s.off('stream.subathon', onEvent);
      releaseStreamSocket(conn);
    },
  };
}

/** A hype train starting, moving or ending: `stream.hype` in the stream's room. */
export function watchStreamHype(streamId: string, onUpdate: (train: HypeTrain) => void): StreamPresence {
  if (!streamId) return { leave: () => undefined };

  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;

  const join = () => {
    if (!left) s.emit('stream.join.room', { streamId });
  };
  const onEvent = (data: any) => {
    if (String(data?.streamId ?? '') !== streamId) return;
    const train = parseHypeTrain(data);
    if (train) onUpdate(train);
  };

  s.on('connect', join);
  s.on('stream.hype', onEvent);
  if (s.connected) join();

  return {
    leave: () => {
      if (left) return;
      left = true;
      s.off('connect', join);
      s.off('stream.hype', onEvent);
      releaseStreamSocket(conn);
    },
  };
}
