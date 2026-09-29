/**
 * Brainrot Feed Host
 * ==================
 * Mounted once by the app shell, the first time somebody swipes up out of a
 * fullscreen video on a phone (see lib/brainrot-feed). Loads the five ranked
 * lists, deals them into one feed and plays it in the shorts viewer.
 *
 * Lazy, and so is everything it pulls in: the viewer and its queries cost
 * nothing for anyone who never makes the gesture.
 *
 * @module components/app/BrainrotFeedHost
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import type { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShortsViewer } from '@/components/app/cards/ShortsViewer';
import { prefetchUnifiedFeed, useUnifiedFeed, type UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { useWatchedVideoIds } from '@/hooks/use-watched-videos';
import { mapToShortVideo } from '@/lib/short-video';
import {
  BRAINROT_BUCKETS,
  BRAINROT_PAGE_SIZE,
  BRAINROT_QUERIES,
  appendStable,
  closeBrainrotFeed,
  mixBrainrotFeed,
  useBrainrotSession,
  type BrainrotBucket,
  type BrainrotListInput,
} from '@/lib/brainrot-feed';
import type { ShortVideo } from '@/types/feed.types';

/** Show what has arrived after this long, even if a list is still loading. */
const READY_TIMEOUT_MS = 4000;

/**
 * Warm the first page of every list. Called when a video goes fullscreen on a
 * phone, so the feed is usually ready before the swipe that opens it.
 */
export function prefetchBrainrotFeed(queryClient: QueryClient): void {
  for (const bucket of BRAINROT_BUCKETS) {
    prefetchUnifiedFeed(queryClient, { ...BRAINROT_QUERIES[bucket], limit: BRAINROT_PAGE_SIZE }).catch(() => {});
  }
}

type FeedQuery = ReturnType<typeof useUnifiedFeed>;

function toList(query: FeedQuery): BrainrotListInput<UnifiedFeedItem> {
  const items = query.data?.pages.flatMap(page => page.items || []) ?? [];
  return { items, done: query.isError || (!!query.data && !query.hasNextPage) };
}

export default function BrainrotFeedHost() {
  const { t } = useTranslation();
  const session = useBrainrotSession();
  const enabled = !!session;
  const options = (bucket: BrainrotBucket) => ({ ...BRAINROT_QUERIES[bucket], limit: BRAINROT_PAGE_SIZE, enabled });

  const trending = useUnifiedFeed(options('trending'));
  const fresh = useUnifiedFeed(options('new'));
  const mostViewed = useUnifiedFeed(options('mostViewed'));
  const mostLiked = useUnifiedFeed(options('mostLiked'));
  const mostCommented = useUnifiedFeed(options('mostCommented'));
  const queries: Record<BrainrotBucket, FeedQuery> = {
    trending,
    new: fresh,
    mostViewed,
    mostLiked,
    mostCommented,
  };

  const { watchedIds, isLoading: watchedLoading } = useWatchedVideoIds(enabled);

  const lists = useMemo(
    () => ({
      trending: toList(trending),
      new: toList(fresh),
      mostViewed: toList(mostViewed),
      mostLiked: toList(mostLiked),
      mostCommented: toList(mostCommented),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      trending.data, trending.isError, trending.hasNextPage,
      fresh.data, fresh.isError, fresh.hasNextPage,
      mostViewed.data, mostViewed.isError, mostViewed.hasNextPage,
      mostLiked.data, mostLiked.isError, mostLiked.hasNextPage,
      mostCommented.data, mostCommented.isError, mostCommented.hasNextPage,
    ],
  );

  // Hold the first deal until every list has answered, so the opening clips
  // are a real mix and not whichever list happened to land first.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!session) return;
    const timer = setTimeout(() => setTimedOut(true), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [session]);
  const allAnswered = BRAINROT_BUCKETS.every(bucket => lists[bucket].items.length > 0 || lists[bucket].done);
  const ready = !!session && ((allAnswered && !watchedLoading) || timedOut);

  const mix = useMemo(() => {
    if (!session || !ready) return null;
    return mixBrainrotFeed(lists, {
      seed: session.key,
      excludeIds: session.fromId ? new Set([session.fromId]) : undefined,
      watchedIds,
    });
  }, [session, ready, lists, watchedIds]);

  // What the viewer has been handed only ever grows at the end: it is
  // index-based, so a clip moving under the person would skip them around.
  const [feed, setFeed] = useState<{ key: number; shorts: ShortVideo[] }>({ key: 0, shorts: [] });
  useEffect(() => {
    if (!session || !mix) return;
    const next = mix.items.map((item, index) => mapToShortVideo(item, index) as ShortVideo);
    setFeed(prev => {
      const base = prev.key === session.key ? prev.shorts : [];
      const shorts = appendStable(base, next, short => short.id);
      return shorts === prev.shorts ? prev : { key: session.key, shorts };
    });
  }, [session, mix]);
  const shorts = session && feed.key === session.key ? feed.shorts : [];

  const waitingOn = mix?.waitingOn ?? null;
  const waitingQuery = waitingOn ? queries[waitingOn] : null;
  const isLoadingMore = !!waitingQuery?.isFetchingNextPage;

  const loadMore = useCallback(() => {
    if (waitingQuery && waitingQuery.hasNextPage && !waitingQuery.isFetchingNextPage) {
      waitingQuery.fetchNextPage();
    }
  }, [waitingQuery]);

  // Nothing playable on the first pages (all paid, say): keep paging the list
  // the rotation is stuck on until something turns up or it runs out.
  const dealtNothing = !!mix && mix.items.length === 0;
  useEffect(() => {
    if (dealtNothing) loadMore();
  }, [dealtNothing, loadMore]);

  const emptyForGood = ready && shorts.length === 0 && !waitingOn;

  return (
    <AnimatePresence>
      {session && shorts.length > 0 ? (
        <ShortsViewer
          key={`brainrot-${session.key}`}
          shorts={shorts}
          initialIndex={0}
          onClose={closeBrainrotFeed}
          onLoadMore={loadMore}
          hasMore={!!waitingOn}
          isLoadingMore={isLoadingMore}
        />
      ) : session ? (
        <BrainrotPlaceholder
          key="brainrot-loading"
          label={emptyForGood ? t('shorts.nothingToWatch', 'Nothing to watch right now') : undefined}
          closeLabel={t('common.close', 'Close')}
        />
      ) : null}
    </AnimatePresence>
  );
}

/** Black screen with a spinner (or a message) while the lists come in. */
function BrainrotPlaceholder({ label, closeLabel }: { label?: string; closeLabel: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBrainrotFeed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-busy={!label}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black text-white"
    >
      <button
        type="button"
        onClick={closeBrainrotFeed}
        aria-label={closeLabel}
        className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/10 p-2"
      >
        <X className="h-5 w-5" />
      </button>
      {label ? <p className="px-8 text-center text-sm text-white/70">{label}</p> : <Loader2 className="h-8 w-8 animate-spin text-white/70" />}
    </motion.div>,
    document.body,
  );
}
