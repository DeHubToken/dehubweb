/**
 * Related Posts Feed Component
 * ============================
 * Displays an infinite scroll feed of recent text posts below the main post.
 * First item is always an ad slot, followed by latest text posts with pagination.
 */

import { useRef, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { searchNFTs, getNFTInfo } from '@/lib/api/dehub';
import { mapToTextPost, type UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { PostCard } from '@/components/app/cards/PostCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { buildAvatarUrl, extractAvatarPath, buildImageUrl, buildVideoUrl } from '@/lib/media-url';
import { formatTimeAgo, formatViews } from '@/lib/feed-utils';
import type { VideoItem } from '@/types/feed.types';

const AD_POST_ID = '2008';
const ITEMS_PER_PAGE = 10;

interface RelatedPostsFeedProps {
  currentPostId: string;
}

function adToVideoItem(nft: any): VideoItem {
  const durationSeconds = nft.videoDuration || nft.duration || 0;
  const timestamp = nft.createdAt || nft.created_at || nft.mintedAt || nft.minted_at;
  const formatDuration = (s: number) => {
    if (!s || s <= 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return {
    id: String(nft.tokenId),
    type: 'video',
    thumbnail: buildImageUrl(nft.tokenId, nft.imageUrl) || '/placeholder.svg',
    videoUrl: nft.tokenId ? buildVideoUrl(nft.tokenId) : undefined,
    duration: formatDuration(durationSeconds),
    durationSeconds: typeof durationSeconds === 'number' ? durationSeconds : 0,
    title: nft.title || nft.name || '',
    channel: nft.minterDisplayName || nft.mintername || 'Unknown',
    channelAvatar: buildAvatarUrl(nft.minter, extractAvatarPath(nft)) || '/placeholder.svg',
    verified: false,
    views: formatViews(nft.views || 0),
    uploadedAgo: formatTimeAgo(timestamp),
    creatorId: nft.minter,
    creatorUsername: nft.mintername,
    isLiked: nft.isLiked,
    isDisliked: nft.isDisliked,
    likeCount: nft.totalVotes?.for || 0,
    dislikeCount: nft.totalVotes?.against || 0,
    commentCount: nft.commentCount || nft.comment_count || 0,
    isAd: true,
  };
}

export function RelatedPostsFeed({ currentPostId }: RelatedPostsFeedProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  const { data: adVideo, isLoading: adLoading } = useQuery({
    queryKey: ['ad-video', AD_POST_ID],
    queryFn: () => getNFTInfo(AD_POST_ID),
    staleTime: 1000 * 60 * 30,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: postsLoading,
  } = useInfiniteQuery({
    queryKey: ['related-posts-feed', currentPostId],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await searchNFTs({
        sortMode: 'new',
        status: 'minted',
        postType: 'feed-simple',
        page: pageParam,
        unit: ITEMS_PER_PAGE,
      });

      const rawData = (response as any).result || response.data || [];

      const filtered = rawData.filter((nft: any) => {
        const id = String(nft.tokenId || nft.id);
        return id !== currentPostId && id !== AD_POST_ID;
      });

      return {
        data: filtered,
        page: pageParam,
        hasMore: rawData.length >= ITEMS_PER_PAGE,
      };
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 0,
    staleTime: 1000 * 60 * 5,
  });

  const posts = data?.pages.flatMap((page, pageIndex) =>
    page.data.map((nft: any, index: number) => mapToTextPost(nft as UnifiedFeedItem, pageIndex * ITEMS_PER_PAGE + index))
  ) || [];

  const handleLoadMore = useCallback(() => {
    if (isFetchingRef.current || !hasNextPage || isFetchingNextPage) return;
    isFetchingRef.current = true;
    fetchNextPage().finally(() => {
      isFetchingRef.current = false;
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [handleLoadMore]);

  const isLoading = adLoading || postsLoading;

  if (isLoading && posts.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-[30px]">
      {/* Ad Video - First Slot */}
      {adVideo && (
        <div className="relative rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
          <VideoCard video={adToVideoItem(adVideo)} />
        </div>
      )}

      {/* Latest Text Posts */}
      {posts.map((post) => (
        <div key={post.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
          <PostCard post={post} />
        </div>
      ))}

      {/* Load More Trigger */}
      <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
        {isFetchingNextPage && (
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        )}
      </div>
    </div>
  );
}
