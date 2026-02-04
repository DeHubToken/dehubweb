/**
 * Recommended Videos Feed
 * =======================
 * Infinite scroll feed of videos sorted by most recent uploads.
 * Used below dedicated post pages.
 * 
 * @module components/app/feeds/RecommendedVideosFeed
 */

import { useEffect, useRef, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { getAuthToken, getMediaUrl } from '@/lib/api/dehub';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { formatTimeAgo, formatDuration } from '@/lib/feed-utils';
import type { VideoItem } from '@/types/feed.types';

const DEHUB_API_BASE = "https://api.dehub.io";
const VIDEOS_PER_PAGE = 15;

interface UnifiedFeedItem {
  tokenId: number;
  name: string;
  description?: string;
  imageUrl: string;
  videoUrl?: string;
  videoDuration?: number;
  postType: 'video' | 'feed-images' | 'feed-simple';
  status: string;
  views?: number;
  createdAt?: string;
  minter: string;
  minterDisplayName?: string;
  minterUsername?: string;
  minterAvatarUrl?: string;
  totalVotes?: { for: number; against: number };
  commentCount?: number;
  isLiked?: boolean;
  isDisliked?: boolean;
}

/**
 * Fetch videos from unified feed API
 */
async function fetchVideos(page: number): Promise<{ items: UnifiedFeedItem[]; hasMore: boolean }> {
  const url = new URL('/api/feed', DEHUB_API_BASE);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(VIDEOS_PER_PAGE));
  url.searchParams.set('sortBy', 'createdAt');
  url.searchParams.set('sortOrder', 'desc');
  url.searchParams.set('postType', 'video');
  url.searchParams.set('status', 'minted');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch videos: ${response.status}`);
  }

  const data = await response.json();
  const items = data.result || data || [];
  
  return {
    items,
    hasMore: items.length >= VIDEOS_PER_PAGE,
  };
}

/**
 * Transform API item to VideoItem
 */
function toVideoItem(item: UnifiedFeedItem): VideoItem {
  const views = item.views != null ? String(item.views) : '0';
  const title = item.name || '';
  const description = item.description && item.description !== title ? item.description : undefined;
  const durationSeconds = item.videoDuration || 0;

  return {
    id: String(item.tokenId),
    type: 'video',
    thumbnail: getMediaUrl(item.imageUrl) || '/placeholder.svg',
    videoUrl: getMediaUrl(item.videoUrl),
    duration: formatDuration(durationSeconds),
    durationSeconds,
    title,
    description,
    channel: item.minterDisplayName || item.minterUsername || 'Unknown',
    channelAvatar: getMediaUrl(item.minterAvatarUrl) || '/placeholder.svg',
    verified: false,
    views,
    uploadedAgo: formatTimeAgo(item.createdAt),
    status: item.status,
    creatorId: item.minter,
    creatorUsername: item.minterUsername,
    isLiked: item.isLiked,
    isDisliked: item.isDisliked,
    likeCount: item.totalVotes?.for || 0,
    dislikeCount: item.totalVotes?.against || 0,
    commentCount: item.commentCount || 0,
  };
}

interface RecommendedVideosFeedProps {
  /** Exclude this post ID from the feed (the current video) */
  excludePostId?: string;
}

export function RecommendedVideosFeed({ excludePostId }: RecommendedVideosFeedProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['recommended-videos', 'new'],
    queryFn: async ({ pageParam = 1 }) => {
      const result = await fetchVideos(pageParam);
      return {
        items: result.items,
        nextPage: result.hasMore ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000,
  });

  // Flatten all pages into a single list, excluding current video
  const allVideos = data?.pages.flatMap(page => page.items) || [];
  const filteredVideos = excludePostId 
    ? allVideos.filter(v => String(v.tokenId) !== excludePostId)
    : allVideos;

  // Load more callback with guard
  const handleLoadMore = useCallback(() => {
    if (isFetchingRef.current || !hasNextPage || isFetchingNextPage) return;
    isFetchingRef.current = true;
    fetchNextPage().finally(() => {
      isFetchingRef.current = false;
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '400px' }
    );

    observerRef.current.observe(target);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [handleLoadMore]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (filteredVideos.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col">
      {/* Section Header */}
      <h2 className="text-lg font-semibold text-foreground mb-4">More Videos</h2>

      {/* Video Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVideos.map((item) => (
          <VideoCard 
            key={item.tokenId} 
            video={toVideoItem(item)} 
          />
        ))}
      </div>

      {/* Load More Trigger */}
      <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
        {isFetchingNextPage && (
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        )}
      </div>
    </div>
  );
}
