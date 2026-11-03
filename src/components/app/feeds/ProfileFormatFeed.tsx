/**
 * Profile Format Feed
 * ===================
 * Under a post opened from a profile tab: the rest of that tab's list, in the
 * tab's order, starting right after this post. Reads the same query as the
 * profile (see lib/profile-feed-origin), so the pages the profile already
 * downloaded show at once and the next ones load on scroll.
 *
 * If the post is not in the list (a repost on the All tab, say), the ordinary
 * related feed takes its place.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useDeHubUserContent, separateUserContent } from '@/hooks/use-dehub-profile';
import type { UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { PostCard } from '@/components/app/cards/PostCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import {
  ProfileFeedOriginContext,
  type ProfileFeedOrigin,
  type ProfileFeedSource,
} from '@/lib/profile-feed-origin';

/** Pages read past the profile's own while looking for the opened post. */
const MAX_SEARCH_PAGES = 5;

function tokenIdOf(item: UnifiedFeedItem): string {
  const raw = item as { tokenId?: string | number; id?: string | number };
  return String(raw.tokenId ?? raw.id ?? '');
}

function FeedEntry({ item, index }: { item: UnifiedFeedItem; index: number }) {
  const { posts, images, videos, lives } = separateUserContent([item]);
  if (posts[0]) {
    return (
      <div data-feed-item data-cinematic="post" className="rounded-xl bg-white/[0.03] p-3">
        <PostCard post={posts[0]} />
      </div>
    );
  }
  if (images[0]) {
    return (
      <div data-feed-item data-cinematic="image" className="rounded-xl bg-white/[0.03] p-3">
        <ImageCard post={images[0]} />
      </div>
    );
  }
  const video = videos[0] ?? lives[0];
  if (!video) return null;
  return (
    <div data-feed-item data-cinematic="video" className="rounded-xl bg-white/[0.03] p-3">
      <VideoCard video={video} disableAutoplay aboveFold={index < 2} />
    </div>
  );
}

export function ProfileFormatFeed({ origin, currentPostId, fallback }: {
  origin: ProfileFeedOrigin;
  currentPostId: string;
  /** Shown when this post is not part of the profile list. */
  fallback?: ReactNode;
}) {
  const { data, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useDeHubUserContent({
    ...origin.query,
    enabled: !!origin.query.userId,
  });

  const items = useMemo(() => data?.pages.flatMap((page) => (page.data || []) as UnifiedFeedItem[]) ?? [], [data]);
  const currentId = String(currentPostId);
  const index = useMemo(() => items.findIndex((item) => tokenIdOf(item) === currentId), [items, currentId]);

  // The opened post can sit past the pages loaded so far: keep reading until
  // it turns up, within reason.
  const searched = useRef(0);
  useEffect(() => {
    searched.current = 0;
  }, [currentId]);
  const stillSearching = !!data && index < 0 && !!hasNextPage && searched.current < MAX_SEARCH_PAGES;
  useEffect(() => {
    if (!stillSearching || isFetchingNextPage) return;
    searched.current += 1;
    fetchNextPage();
  }, [stillSearching, isFetchingNextPage, fetchNextPage]);

  const after = useMemo(() => {
    if (index < 0) return [];
    const seen = new Set([currentId]);
    return items.slice(index + 1).filter((item) => {
      const id = tokenIdOf(item);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [items, index, currentId]);

  // Cards in this feed open their posts into the same list again.
  const source = useRef<ProfileFeedSource>({ current: origin });
  source.current.current = origin;

  const sentinel = useRef<HTMLDivElement>(null);
  const pagingState = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
  pagingState.current = { hasNextPage, isFetchingNextPage, fetchNextPage };
  useEffect(() => {
    const el = sentinel.current;
    if (!el || index < 0 || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      const s = pagingState.current;
      if (entries[0].isIntersecting && s.hasNextPage && !s.isFetchingNextPage) s.fetchNextPage();
    }, { rootMargin: '800px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [index, hasNextPage, isFetchingNextPage]);

  if (isError || (!!data && index < 0 && !stillSearching && !isFetchingNextPage)) return <>{fallback ?? null}</>;

  if (index < 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <ProfileFeedOriginContext.Provider value={source.current}>
      <div data-feed-root data-profile-format-feed={origin.tab} className="flex flex-col gap-4 pt-[30px]">
        {after.map((item, i) => (
          <FeedEntry key={tokenIdOf(item)} item={item} index={i} />
        ))}
        <div ref={sentinel} className="h-20 flex items-center justify-center">
          {isFetchingNextPage && <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />}
        </div>
      </div>
    </ProfileFeedOriginContext.Provider>
  );
}
