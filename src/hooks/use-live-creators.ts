import { useMemo } from 'react';
import { useDeHubLive, DEFAULT_DEHUB_LIVE_QUERY_OPTIONS, mapApiLiveStreamToLocal } from '@/hooks/use-dehub-feed';
import { useLiveSpacesUnordered } from '@/contexts/StageContext';

/** Where to send someone who taps a live person's avatar. */
export interface LiveTarget {
  kind: 'stream' | 'stage';
  id: string;
}

/** Route that opens a live target: the stream's post page, or the Stage deep link. */
export function liveTargetPath(target: LiveTarget): string {
  return target.kind === 'stream' ? `/app/post/${target.id}` : `/stage/${target.id}`;
}

/**
 * Everyone broadcasting right now, keyed by lowercased wallet address and
 * username, with the stream or Stage they are on: creators of on-air video
 * streams plus hosts of live Stages.
 *
 * Reads the same /api/live query as the Live feed, home carousel and side
 * panel (same key, so the cache is shared and the 60s poll is not doubled),
 * and the Stage store the realtime channel already keeps current.
 */
export function useLiveTargets(): Map<string, LiveTarget> {
  const { data } = useDeHubLive(DEFAULT_DEHUB_LIVE_QUERY_OPTIONS);
  const stages = useLiveSpacesUnordered();

  return useMemo(() => {
    const targets = new Map<string, LiveTarget>();
    const add = (value: string | null | undefined, target: LiveTarget) => {
      const key = value?.toLowerCase();
      if (key && !targets.has(key)) targets.set(key, target);
    };
    (data?.pages ?? []).forEach(page => {
      (page.data || []).forEach((stream, index) => {
        const local = mapApiLiveStreamToLocal(stream, index);
        if (!local.isLive) return;
        const target: LiveTarget = { kind: 'stream', id: String(local.id) };
        add(local.creatorId, target);
        add(local.creatorUsername, target);
      });
    });
    stages.forEach(stage => {
      if (stage?.id) add(stage.host_wallet_address, { kind: 'stage', id: String(stage.id) });
    });
    return targets;
  }, [data, stages]);
}

/** Lowercased addresses and usernames of everyone live right now. */
export function useLiveCreators(): Set<string> {
  const targets = useLiveTargets();
  return useMemo(() => new Set(targets.keys()), [targets]);
}

/** The stream or Stage the first matching address / username is live on, if any. */
export function useLiveTarget(...ids: Array<string | null | undefined>): LiveTarget | null {
  const targets = useLiveTargets();
  for (const id of ids) {
    const target = id ? targets.get(id.replace(/^@/, '').toLowerCase()) : undefined;
    if (target) return target;
  }
  return null;
}

/** True when any of the given address / username values belongs to someone live. */
export function useIsLive(...ids: Array<string | null | undefined>): boolean {
  return useLiveTarget(...ids) !== null;
}
