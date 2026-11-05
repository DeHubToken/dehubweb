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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from "lucide-react";
import X from "@/components/ui/cut-icons/close";

import type { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShortsViewer } from '@/components/app/cards/ShortsViewer';
import { prefetchUnifiedFeed, useUnifiedFeed, type UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { useWatchedVideoIds } from '@/hooks/use-watched-videos';
import { mapToShortVideo } from '@/lib/short-video';
import { toReelShorts } from '@/lib/profile-reel';
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
  type BrainrotSession,
  isBrainrotPlayable,
} from '@/lib/brainrot-feed';
import { useDeHubUserContent } from '@/hooks/use-dehub-profile';
import { peekProfileFeedOrigin, type ProfileFeedOrigin } from '@/lib/profile-feed-origin';
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

/**
 * A video opened from a profile tab plays through that tab's videos, in its
 * order, from the one tapped. Anything else gets the ranked mix.
 */
export default function BrainrotFeedHost() {
  const session = useBrainrotSession();
  const origin = useMemo(() => (session?.fromId ? peekProfileFeedOrigin(session.fromId) : null), [session]);
  if (session && origin && session.reel) return <ProfileReelFeed key={session.key} session={session} origin={origin} />;
  if (session && origin) return <ProfileShortsFeed key={session.key} session={session} origin={origin} />;
  return <MixedBrainrotFeed session={session} />;
}

function MixedBrainrotFeed({ session }: { session: BrainrotSession | null }) {
  const { t } = useTranslation();
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
  const ready = !!session && ((allAnswered && !watchedLoading) || (!!session.first && !watchedLoading) || timedOut);

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
      const base = prev.key === session.key ? prev.shorts : session.first ? [session.first] : [];
      const shorts = appendStable(base, next, short => short.id);
      return shorts === prev.shorts ? prev : { key: session.key, shorts };
    });
  }, [session, mix]);
  // A tapped feed video plays at once, before the lists have answered.
  const shorts = session && feed.key === session.key ? feed.shorts : session?.first ? [session.first] : [];

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
          reuseInitialVideo={!!session.first}
          onClose={closeBrainrotFeed}
          onLoadMore={loadMore}
          hasMore={!!waitingOn}
          isLoadingMore={isLoadingMore}
        />
      ) : session ? (
        <BrainrotPlaceholder
          key="brainrot-loading"
          label={emptyForGood ? t('feed.emptyTitle', 'No Content Yet') : undefined}
          closeLabel={t('common.close', 'Close')}
        />
      ) : null}
    </AnimatePresence>
  );
}

/** Pages read past the profile's own while looking for the tapped video. */
const MAX_SEARCH_PAGES = 5;

function ProfileShortsFeed({ session, origin }: { session: BrainrotSession; origin: ProfileFeedOrigin }) {
  const { t } = useTranslation();
  const { data, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useDeHubUserContent({
    ...origin.query,
    enabled: !!origin.query.userId,
  });
  const items = useMemo(() => data?.pages.flatMap(page => (page.data || []) as UnifiedFeedItem[]) ?? [], [data]);
  const fromId = String(session.fromId);
  const index = useMemo(() => items.findIndex(item => String(item.tokenId) === fromId), [items, fromId]);

  const searched = useRef(0);
  const stillSearching = !!data && index < 0 && !!hasNextPage && searched.current < MAX_SEARCH_PAGES;
  useEffect(() => {
    if (!stillSearching || isFetchingNextPage) return;
    searched.current += 1;
    fetchNextPage();
  }, [stillSearching, isFetchingNextPage, fetchNextPage]);

  const shorts = useMemo(() => {
    const first = session.first ? [session.first] : [];
    if (index < 0) return first;
    const seen = new Set([fromId]);
    const next = items.slice(index + 1).filter(item => {
      const id = item.tokenId != null ? String(item.tokenId) : '';
      // The All tab mixes formats; only its videos belong in Shorts.
      if (item.postType !== 'video') return false;
      if (!id || seen.has(id) || !isBrainrotPlayable(item)) return false;
      seen.add(id);
      return true;
    });
    return [...first, ...next.map((item, i) => mapToShortVideo(item, i) as ShortVideo)];
  }, [session.first, items, index, fromId]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Not in the list after all (a repost on the All tab): the ranked mix.
  if (isError || (!!data && index < 0 && !stillSearching && !isFetchingNextPage)) return <MixedBrainrotFeed session={session} />;

  return (
    <AnimatePresence>
      {shorts.length > 0 ? (
        <ShortsViewer
          key={`profile-shorts-${session.key}`}
          shorts={shorts}
          initialIndex={0}
          reuseInitialVideo={!!session.first}
          onClose={closeBrainrotFeed}
          onLoadMore={loadMore}
          hasMore={!!hasNextPage || stillSearching}
          isLoadingMore={isFetchingNextPage}
        />
      ) : (
        <BrainrotPlaceholder key="profile-shorts-loading" closeLabel={t('common.close', 'Close')} />
      )}
    </AnimatePresence>
  );
}

/**
 * A tap on a profile grid tile (phone): the profile's whole list, every kind of
 * post, in its own order, opened at the tapped one. Swiping up goes on to older
 * posts and pages in more as it nears the end; swiping down goes back to newer.
 */
function ProfileReelFeed({ session, origin }: { session: BrainrotSession; origin: ProfileFeedOrigin }) {
  const { t } = useTranslation();
  const { data, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useDeHubUserContent({
    ...origin.query,
    enabled: !!origin.query.userId,
  });
  const fromId = String(session.fromId);
  const bgId = session.reel?.bgId;
  // Fixed at the first answer that holds the tapped post. The viewer is
  // index-based, so later pages may only ever add to the end.
  const [opened, setOpened] = useState<{ start: number } | null>(null);
  const shorts = useMemo(() => {
    const rows = data?.pages.flatMap(page => (page.data || []) as Record<string, any>[]) ?? [];
    return toReelShorts(rows, bgId);
  }, [data, bgId]);
  const index = useMemo(() => shorts.findIndex(short => short.id === fromId), [shorts, fromId]);
  useEffect(() => {
    if (!opened && index >= 0) setOpened({ start: index });
  }, [opened, index]);

  const searched = useRef(0);
  const stillSearching = !!data && index < 0 && !!hasNextPage && searched.current < MAX_SEARCH_PAGES;
  useEffect(() => {
    if (!stillSearching || isFetchingNextPage) return;
    searched.current += 1;
    fetchNextPage();
  }, [stillSearching, isFetchingNextPage, fetchNextPage]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // The tapped post is not in the list after all (an old pinned post, a post
  // with nothing to draw as a slide): open its own page instead of closing to
  // nothing, which read as "the tap did nothing".
  const navigate = useNavigate();
  const lost = isError || (!!data && index < 0 && !stillSearching && !isFetchingNextPage);
  useEffect(() => {
    if (!lost) return;
    closeBrainrotFeed();
    navigate(`/app/post/${fromId}`, { state: { fromFeed: true } });
  }, [lost, navigate, fromId]);

  return (
    <AnimatePresence>
      {opened && shorts.length > 0 ? (
        <ShortsViewer
          key={`profile-reel-${session.key}`}
          shorts={shorts}
          initialIndex={opened.start}
          onClose={closeBrainrotFeed}
          onLoadMore={loadMore}
          hasMore={!!hasNextPage}
          isLoadingMore={isFetchingNextPage}
        />
      ) : (
        <BrainrotPlaceholder key="profile-reel-loading" closeLabel={t('common.close', 'Close')} />
      )}
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
      data-shorts-placeholder
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
