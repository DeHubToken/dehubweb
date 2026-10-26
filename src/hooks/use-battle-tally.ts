/**
 * The host's battle tally.
 *
 * Only the host's broadcaster runs this. It listens to both streams for
 * gifts the chain has confirmed (`streamer.tip.confirmed` — never the
 * sender's unpaid claim, which anyone can forge) and writes the running
 * totals to the room every few seconds, which is where every viewer and the
 * partner read them from.
 *
 * A reload mid-round picks up from the totals already saved rather than from
 * zero. Confirmations that land a few seconds after the bell still count:
 * the gift was sent while the round was running.
 */
import { useEffect, useRef } from 'react';
import { watchStreamGifts } from '@/lib/api/dehub/stream-presence';
import { battleSides, reportBattleScores, type CoStreamState } from '@/lib/live/costream-api';
import { createLogger } from '@/lib/logger';

const logger = createLogger('BattleTally');

const WRITE_MS = 3000;
const LATE_CONFIRM_MS = 15_000;

export function useBattleTally(wallet: string | null | undefined, state: CoStreamState | null, isHost: boolean) {
  const sides = isHost ? battleSides(state) : null;
  const room = state?.room;
  const round = room && sides && room.battle_started_at && room.battle_ends_at
    ? {
        id: room.id,
        key: `${room.id}:${room.battle_round}`,
        endsAt: Date.parse(room.battle_ends_at),
        hostStream: sides.host.streamId,
        guestStream: sides.guest.streamId,
      }
    : null;
  const savedRef = useRef({ host: 0, guest: 0 });
  savedRef.current = { host: sides?.host.score ?? 0, guest: sides?.guest.score ?? 0 };

  const roundKey = round?.key ?? null;
  const live = round ? Date.now() < round.endsAt + LATE_CONFIRM_MS : false;

  useEffect(() => {
    if (!round || !live || !wallet) return;
    const me = wallet.toLowerCase();
    // Start from whatever this round already has saved.
    const tally = { host: savedRef.current.host, guest: savedRef.current.guest };
    const seen = new Set<string>();
    let dirty = false;

    const count = (side: 'host' | 'guest') => (gift: { paidAmount: number; transactionHash?: string }) => {
      if (Date.now() > round.endsAt + LATE_CONFIRM_MS) return;
      const id = gift.transactionHash || `${side}:${Date.now()}:${gift.paidAmount}`;
      if (seen.has(id)) return;
      seen.add(id);
      tally[side] += gift.paidAmount;
      dirty = true;
    };
    const hostWatch = watchStreamGifts(round.hostStream, () => undefined, count('host'));
    const guestWatch = watchStreamGifts(round.guestStream, () => undefined, count('guest'));

    const flush = () => {
      if (!dirty) return;
      dirty = false;
      void reportBattleScores(me, round.id, tally.host, tally.guest).catch((error) => {
        dirty = true;
        logger.warn('Battle score write failed', error);
      });
    };
    const timer = window.setInterval(flush, WRITE_MS);
    const stopAt = window.setTimeout(flush, Math.max(0, round.endsAt + LATE_CONFIRM_MS - Date.now()));
    return () => {
      flush();
      window.clearInterval(timer);
      window.clearTimeout(stopAt);
      hostWatch.leave();
      guestWatch.leave();
    };
    // The round, not the room object: the room is re-read every few seconds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, live, wallet]);
}
