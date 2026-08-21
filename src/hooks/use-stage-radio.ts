/**
 * useStageRadioNowPlaying — what the host has on the room's radio
 * ===============================================================
 *
 * The audio itself arrives mixed into the host's Agora track and needs no
 * subscription; this is only the label. The host announces the station on a
 * realtime broadcast channel — on change and on a 10s heartbeat — so a listener
 * who joins mid-song still learns what they are hearing.
 *
 * A broadcast has no history, so the heartbeat is also the liveness signal:
 * three missed beats and the label clears. That is what covers a host whose tab
 * dies without stopping the radio cleanly, where no stop event is ever sent.
 *
 * Not for the host's own screen — a host reads their station from StageContext,
 * and a second subscription to the same topic from the same client is refused.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { StageRadioLabel } from '@/lib/stage-radio';

/** Three missed heartbeats. */
const STALE_MS = 35_000;

export function useStageRadioNowPlaying(
  spaceId: string | null | undefined,
): StageRadioLabel | null {
  const [station, setStation] = useState<StageRadioLabel | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!spaceId) {
      setStation(null);
      return;
    }

    const channel = supabase
      .channel(`stage-radio:${spaceId}`)
      .on('broadcast', { event: 'now-playing' }, ({ payload }) => {
        const next = (payload?.station as StageRadioLabel | null) ?? null;
        setStation(next);

        if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
        staleTimerRef.current = next
          ? setTimeout(() => setStation(null), STALE_MS)
          : null;
      })
      .subscribe();

    return () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
      supabase.removeChannel(channel);
      setStation(null);
    };
  }, [spaceId]);

  return station;
}
