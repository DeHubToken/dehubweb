import type { ReactNode } from 'react';
import { useFeedRefresh } from '@/lib/feed-refresh';

/** Keep refresh feedback centred on the navigation mark. */
export function FeedRefreshLogo({ children }: { children: ReactNode }) {
  const { refreshing, progress } = useFeedRefresh();
  return (
    <span className="relative inline-flex" data-feed-refresh-logo aria-busy={refreshing}>
      {children}
      {(refreshing || progress > 0) && (
        <svg data-feed-refresh-ring aria-hidden="true" width="36" height="36" viewBox="0 0 36 36" className="absolute left-1/2 top-1/2 pointer-events-none" style={{ transform: 'translate(-50%, -50%)' }}>
          <g className={refreshing ? 'animate-spin motion-reduce:animate-none' : undefined} style={{ transformOrigin: '18px 18px' }}>
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="100.531" strokeDashoffset={100.531 * (1 - (refreshing ? 0.72 : Math.max(0, Math.min(1, progress))))} transform="rotate(-90 18 18)" />
          </g>
        </svg>
      )}
    </span>
  );
}
