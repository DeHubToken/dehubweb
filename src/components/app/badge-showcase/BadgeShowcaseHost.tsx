import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Mounted once in the app shell. Renders nothing until a badge is clicked,
 * then loads and shows the matching showcase. Living up here rather than
 * inside each badge keeps the showcase out of the card it was opened from,
 * so clicks inside it never bubble into a post or profile row.
 */
import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import {
  closeBadgeShowcase,
  preloadBadgeShowcase,
  preloadStreamerShowcase,
  useBadgeShowcaseRequest,
} from '@/lib/badge-showcase';

const BadgeShowcase = lazyWithRetry(preloadBadgeShowcase);
const StreamerShowcase = lazyWithRetry(preloadStreamerShowcase);

export function BadgeShowcaseHost() {
  const { t: _copy } = _useCopy();
  const request = useBadgeShowcaseRequest();
  if (!request) return null;
  return (
    // A failure here costs a badge its showcase, never the page around it.
    <ErrorBoundary label={_copy("copy.2d1896e3b281", { defaultValue: "BadgeShowcase" })} fallback={null} resetKey={request.id} onError={closeBadgeShowcase}>
      <Suspense fallback={null}>
        {request.kind === 'streamer' ? (
          <StreamerShowcase
            key={request.id}
            badgeId={request.badgeId}
            address={request.address}
            canSelect={request.canSelect}
            anchor={request.anchor}
            onClose={closeBadgeShowcase}
          />
        ) : (
          <BadgeShowcase
            key={request.id}
            tier={request.tier}
            promotedFrom={request.promotedFrom}
            anchor={request.anchor}
            onClose={closeBadgeShowcase}
          />
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
