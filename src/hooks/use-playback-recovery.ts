import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { attachPlaybackRecovery } from '@/lib/browser-playback-recovery';
import type { PlaybackPhase } from '@/lib/playback-recovery';

export function usePlaybackRecovery(ref: RefObject<HTMLVideoElement | null>, source: string | undefined, active: boolean, options: {
  allowed: () => boolean; postId: string; component: string;
}) {
  const latest = useRef(options);
  latest.current = options;
  const [phase, setPhase] = useState<PlaybackPhase>('idle');
  // Handoff refs can change without changing source. Inspect after every commit,
  // but retain the controller while the same owner holds the same element.
  const held = useRef<{ video: HTMLVideoElement; source?: string; detach: () => void }>();
  useLayoutEffect(() => {
    const video = active ? ref.current : null;
    if (!held.current && !video) return;
    if (held.current?.video === video && held.current?.source === source) return;
    held.current?.detach();
    held.current = undefined;
    setPhase('idle');
    if (video && source) held.current = { video, source, detach: attachPlaybackRecovery(video, {
      ...latest.current, changed: setPhase,
      allowed: () => ref.current === video && latest.current.allowed(),
    }) };
  });
  useLayoutEffect(() => () => { held.current?.detach(); held.current = undefined; }, []);
  return phase;
}
