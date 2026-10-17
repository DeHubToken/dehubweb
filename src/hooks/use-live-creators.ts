import { useMemo } from 'react';
import { useDeHubLive, DEFAULT_DEHUB_LIVE_QUERY_OPTIONS, mapApiLiveStreamToLocal } from '@/hooks/use-dehub-feed';
import { useLiveSpacesUnordered } from '@/contexts/StageContext';

/**
 * Everyone broadcasting right now, as lowercased wallet addresses and
 * usernames: creators of on-air video streams plus hosts of live Stages.
 *
 * Reads the same /api/live query as the Live feed, home carousel and side
 * panel (same key, so the cache is shared and the 60s poll is not doubled),
 * and the Stage store the realtime channel already keeps current.
 */
export function useLiveCreators(): Set<string> {
  const { data } = useDeHubLive(DEFAULT_DEHUB_LIVE_QUERY_OPTIONS);
  const stages = useLiveSpacesUnordered();

  return useMemo(() => {
    const ids = new Set<string>();
    const add = (value?: string | null) => {
      if (value) ids.add(value.toLowerCase());
    };
    (data?.pages ?? []).forEach(page => {
      (page.data || []).forEach((stream, index) => {
        const local = mapApiLiveStreamToLocal(stream, index);
        if (!local.isLive) return;
        add(local.creatorId);
        add(local.creatorUsername);
      });
    });
    stages.forEach(stage => add(stage?.host_wallet_address));
    return ids;
  }, [data, stages]);
}

/** True when any of the given address / username values belongs to someone live. */
export function useIsLive(...ids: Array<string | null | undefined>): boolean {
  const live = useLiveCreators();
  return ids.some(id => !!id && live.has(id.replace(/^@/, '').toLowerCase()));
}
