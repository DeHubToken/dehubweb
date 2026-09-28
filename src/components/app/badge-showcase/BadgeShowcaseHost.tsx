/**
 * Mounted once in the app shell. Renders nothing until a badge is clicked,
 * then loads and shows the showcase. Living up here rather than inside each
 * BadgeIcon keeps the showcase out of the card it was opened from, so clicks
 * inside it never bubble into a post or profile row.
 */
import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import { closeBadgeShowcase, preloadBadgeShowcase, useBadgeShowcaseRequest } from '@/lib/badge-showcase';

const BadgeShowcase = lazyWithRetry(preloadBadgeShowcase);

export function BadgeShowcaseHost() {
  const request = useBadgeShowcaseRequest();
  if (!request) return null;
  return (
    // A failure here costs a badge its showcase, never the page around it.
    <ErrorBoundary label="BadgeShowcase" fallback={null} resetKey={request.id} onError={closeBadgeShowcase}>
      <Suspense fallback={null}>
        <BadgeShowcase
          key={request.id}
          tier={request.tier}
          anchor={request.anchor}
          onClose={closeBadgeShowcase}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
