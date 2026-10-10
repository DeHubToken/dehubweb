import type { CSSProperties } from 'react';
import { useFeedRefresh } from '@/lib/feed-refresh';
import { PULL_REFRESH_THRESHOLD } from '@/lib/pill-pull-motion';

/** Soft light under the feed tab pill while the feed is pulled or refreshing.
 *  Brightens with the pull, then breathes until the new posts land. The
 *  immersive capsule paints its own canvas version of this. */
export function FeedPillGlow() {
  const { distance = 0, refreshing } = useFeedRefresh();
  if (distance <= 0 && !refreshing) return null;
  const strength = Math.min(1, distance / PULL_REFRESH_THRESHOLD);
  return (
    <div className="relative h-0" aria-hidden="true">
      <span data-feed-pill-glow data-refreshing={refreshing ? '' : undefined} style={{ '--pull-glow': strength.toFixed(3) } as CSSProperties}>
        <span data-feed-pill-glow-halo />
        <span data-feed-pill-glow-rim />
      </span>
    </div>
  );
}
