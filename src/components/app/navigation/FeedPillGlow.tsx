import type { CSSProperties } from 'react';
import { PULL_REFRESH_THRESHOLD } from '@/lib/pill-pull-motion';
import { useFeedRefresh } from '@/lib/feed-refresh';

/** Soft light under the feed tab pill while the feed is pulled or refreshing.
 *  Brightens with the pull, then breathes until the new posts land. The
 *  immersive capsule draws its own curved rim. */
export function FeedPillGlow({ distance, refreshing, pulling }: { distance?: number; refreshing: boolean; pulling?: boolean }) {
  const motion = useFeedRefresh();
  const strength = Math.max(Math.min(1, (distance ?? motion.distance ?? 0) / PULL_REFRESH_THRESHOLD), refreshing ? .4 : 0);
  return (
    // Phones: pinned to the pill's true bottom edge, below its inner padding,
    // so the light starts on the bottom line instead of partway up the pill.
    <div className="relative h-0 max-sm:absolute max-sm:inset-x-0 max-sm:bottom-0" aria-hidden="true">
      <span data-feed-pill-glow data-refreshing={refreshing ? '' : undefined} data-pulling={(pulling ?? motion.pulling) ? '' : undefined} style={{ '--pull-glow': strength.toFixed(3) } as CSSProperties}>
        <span data-feed-pill-glow-light>
          <span data-feed-pill-glow-halo />
          <span data-feed-pill-glow-rim />
        </span>
      </span>
    </div>
  );
}
