/**
 * Text Feed
 * =========
 * The phone "Text" tab: text-only posts, newest first, as the same cards the
 * Home feed shows. It took the Videos tab's place on phones once the Shorts
 * tab started showing wide videos too.
 *
 * @module components/app/feeds/TextFeed
 */

import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import RefreshCw from '@/components/ui/cut-icons/refresh';
import { PostCard } from '@/components/app/cards/PostCard';
import { WindowedFeedItem } from '@/components/app/feeds/WindowedFeedItem';
import { RetainedPostSurface } from '@/components/app/feeds/RetainedPostSurface';
import { FeedBodySkeleton } from '@/components/app/PageSkeletons';
import { AppState } from '@/components/app/AppState';
import { useUnifiedFeed, mapToTextPost } from '@/hooks/use-unified-feed';
import { flattenFeedPages } from '@/lib/feed-pages';

/** The frame Home gives each feed card, so themes style text posts the same here. */
function frameFor(id: string | number) {
  const frame = {
    'data-feed-item': true,
    'data-feed-token-id': id,
    'data-cinematic': 'post',
    className: 'rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3',
  };
  return frame;
}

interface TextFeedProps {
  refreshKey?: number;
}

export function TextFeed({ refreshKey = 0 }: TextFeedProps) {
  const { t } = useTranslation();
  const loaderRef = useRef<HTMLDivElement>(null);
  const feed = useUnifiedFeed({
    postType: 'feed-simple',
    limit: 12,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    status: 'all',
  });
  const { fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = feed;

  const posts = useMemo(
    () => flattenFeedPages(feed.data?.pages).map((item, index) => mapToTextPost(item, index)),
    [feed.data],
  );

  useEffect(() => {
    if (refreshKey > 0) refetch();
  }, [refreshKey, refetch]);

  useEffect(() => {
    const node = loaderRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (feed.isLoading) return <FeedBodySkeleton />;
  if (!posts.length) {
    return (
      <AppState
        icon={feed.isError ? 'notifications' : 'search'}
        title={feed.isError ? t('textFeed.errorTitle', 'Posts could not load') : t('textFeed.emptyTitle', 'No text posts yet')}
        description={feed.isError ? t('textFeed.errorBody', 'Try loading the text feed again.') : t('textFeed.emptyBody', 'Text posts will appear here.')}
        kind={feed.isError ? 'error' : 'empty'}
        size="page"
        primaryAction={feed.isError ? { label: t('common.tryAgain', 'Try again'), onClick: () => refetch(), icon: <RefreshCw /> } : undefined}
      />
    );
  }

  return (
    <div data-feed-root data-text-feed className="flex flex-col gap-2 px-2 pb-2 sm:gap-3 sm:px-3 sm:pb-3">
      {posts.map((post, index) => (
        <WindowedFeedItem
          key={`text-${post.id}`}
          eager={index < 3}
          estimatedHeight={320}
          vanishOnDislike={post.id}
        >
          {/* Same frame the Home feed gives a text post, and the same move to its own page on tap. */}
          <RetainedPostSurface
            id={String(post.id)}
            frameProps={frameFor(post.id)}
          >
            <PostCard post={post} />
          </RetainedPostSurface>
        </WindowedFeedItem>
      ))}
      <div ref={loaderRef} className="flex justify-center py-6">
        {isFetchingNextPage && <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />}
      </div>
    </div>
  );
}
