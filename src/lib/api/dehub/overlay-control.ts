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

  // An OBS page says it is still open, so the badge in Live Studio stays lit.
  const ping = surface === 'obs' ? window.setInterval(() => s.emit('overlay.ping', { token }), 60_000) : 0;

  s.on('connect', join);
  s.on('overlay.test', onTest);
  s.on('overlay.updated', onUpdated);
  s.on('overlay.revoked', onRevoked);
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
      releaseStreamSocket(conn);
    },
  };
}
