import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Mounted once in the app shell. Renders nothing until a badge is clicked,
 * then loads and shows the matching showcase. Living up here rather than
 * inside each badge keeps the showcase out of the card it was opened from,
 * so clicks inside it never bubble into a post or profile row.
 */
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import {
  badgeShowcaseJustOpened,
  closeBadgeShowcase,
  preloadBadgeShowcase,
  loadedBadgeShowcase,
  loadedStreamerShowcase,
  setBadgeShowcaseHandoff,
  preloadStreamerShowcase,
  useBadgeShowcaseRequest,
} from '@/lib/badge-showcase';

const LazyBadgeShowcase = lazyWithRetry(preloadBadgeShowcase);
const LazyStreamerShowcase = lazyWithRetry(preloadStreamerShowcase);

/**
 * Shown the moment a badge is tapped, until the showcase chunk arrives. On a
 * page still loading (a profile opened a second ago), that chunk queues
 * behind everything else and took seconds, so the tap looked ignored. This
 * answers at once: the page dims and the tapped badge comes up large.
 */
function ShowcasePending({ anchor }: { anchor: HTMLElement | null }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  // The showcase takes over from here: it keeps the page dimmed and flies the
  // badge on from where this copy stood, so the two read as one opening.
  const artRef = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    setBadgeShowcaseHandoff(artRef.current);
  });
  // `src` is the full-size still; `currentSrc` may be the small one drawn by the name.
  const art = anchor?.querySelector<HTMLImageElement>('img[data-badge-icon]')?.src
    || (anchor instanceof HTMLImageElement ? anchor.currentSrc : null);
  return createPortal(
    <div
      data-badge-showcase-pending
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      className="fixed inset-0 z-[120] grid place-items-center"
      onClick={() => { if (!badgeShowcaseJustOpened()) closeBadgeShowcase(); }}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-300 ease-out"
        style={{ opacity: shown ? 1 : 0 }}
      />
      {art && (
        <img
          ref={artRef}
          src={art}
          alt=""
          aria-hidden
          className="relative h-40 w-40 object-contain transition-[opacity,transform] duration-300 ease-out"
          style={{ opacity: shown ? 1 : 0, transform: shown ? 'scale(1)' : 'scale(0.4)' }}
        />
      )}
      <span className="sr-only">{t('common.loading')}</span>
    </div>,
    document.body,
  );
}

export function BadgeShowcaseHost() {
  const { t: _copy } = _useCopy();
  const request = useBadgeShowcaseRequest();
  // Fetch the showcase once the page has settled, so the first tap opens it
  // straight away. Only the code is fetched: nothing is drawn until a tap.
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /2g/.test(connection?.effectiveType ?? '')) return;
    let idle = 0;
    const fetchNow = () => { void preloadBadgeShowcase().catch(() => {}); };
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(fetchNow, { timeout: 4000 });
      else fetchNow();
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      if (idle) window.cancelIdleCallback?.(idle);
    };
  }, []);
  if (!request) return null;
  const BadgeShowcase = loadedBadgeShowcase() ?? LazyBadgeShowcase;
  const StreamerShowcase = loadedStreamerShowcase() ?? LazyStreamerShowcase;
  return (
    // A failure here costs a badge its showcase, never the page around it.
    <ErrorBoundary label={_copy("copy.2d1896e3b281", { defaultValue: "BadgeShowcase" })} fallback={null} resetKey={request.id} onError={closeBadgeShowcase}>
      <Suspense fallback={<ShowcasePending anchor={request.anchor} />}>
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
