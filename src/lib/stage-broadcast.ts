/**
 * Stage changes, as the database broadcasts them
 * ==============================================
 * A trigger on audio_spaces sends every insert, update and delete to the
 * private `stages` topic. This replaced a postgres_changes subscription per
 * open session, which on its own kept Realtime's change poller querying the
 * database twice a second around the clock.
 *
 * The payload keeps the postgres_changes shape — `eventType`, the full `new`
 * row — so handlers written for it carry over unchanged. `old` is richer than
 * before: it always carries `status`, so a stage going live can be told apart
 * from a headcount tick.
 *
 * Several hooks listen at once (the stage lists, the open room, the live
 * alert), and realtime-js hands every caller of `channel('stages')` the same
 * object, so the channel is leased rather than opened per hook.
 *
 * Broadcast has no backlog: anything sent while this client was not joined is
 * gone. `onJoin` fires on the first join and on every rejoin after a dropped
 * socket, and is where a holder that keeps state re-reads it.
 */
import { leaseChannel } from '@/lib/realtime-channel-lease';
import type { AudioSpace } from '@/types/audio-spaces.types';

export interface StageChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: AudioSpace | null;
  old: Pick<AudioSpace, 'id' | 'status'> | null;
}

export function watchStages(onChange: (change: StageChange) => void, onJoin?: () => void): () => void {
  const lease = leaseChannel('stages', {
    config: { private: true },
    listen: [{
      type: 'broadcast',
      filter: { event: 'change' },
      handler: (message: { payload?: StageChange }) => {
        if (message.payload) onChange(message.payload);
      },
    }],
    onJoin: onJoin ? () => onJoin() : undefined,
  });
  return lease.release;
}
