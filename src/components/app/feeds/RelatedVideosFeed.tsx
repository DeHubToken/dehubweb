/**
 * Related Videos Feed Component
 * =============================
 * Displays an infinite scroll feed of related videos below the main video.
 * First item is always an ad slot, followed by latest videos with pagination.
 * 
 * @module components/app/feeds/RelatedVideosFeed
 */

import { useRef, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { searchNFTs, getNFTInfo, getMediaUrl } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { mapNFTToVideoItem } from '@/hooks/use-dehub-feed';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { formatDuration, formatTimeAgo, formatViews } from '@/lib/feed-utils';
import type { VideoItem } from '@/types/feed.types';

const AD_POST_ID = '2008';
const ITEMS_PER_PAGE = 10;

interface RelatedVideosFeedProps {
  /** Current video ID to exclude from the feed */
  currentVideoId: string;
  /** Optional scroll container ref for IntersectionObserver root (needed for fixed containers) */
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

/**
 * Transform API NFT data to VideoItem format for the ad
 */
function toVideoItem(nft: any): VideoItem {
  const durationSeconds = nft.videoDuration || nft.duration || 0;
  const timestamp = nft.createdAt || nft.created_at || nft.mintedAt || nft.minted_at;
  
  return {
    id: String(nft.tokenId),
    type: 'video',
    thumbnail: getMediaUrl(nft.imageUrl) || '/placeholder.svg',
    videoUrl: nft.tokenId 
      ? `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${nft.tokenId}.mp4` 
      : undefined,
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
  };
}


export function RelatedVideosFeed({ currentVideoId, scrollContainerRef }: RelatedVideosFeedProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  // Fetch the ad video
  const { data: adVideo, isLoading: adLoading } = useQuery({
    queryKey: ['ad-video', AD_POST_ID],
    queryFn: () => getNFTInfo(AD_POST_ID),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  // Fetch latest videos with pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: videosLoading,
  } = useInfiniteQuery({
    queryKey: ['related-videos-feed', currentVideoId],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await searchNFTs({
        sortMode: 'new',
        status: 'minted',
        page: pageParam,
        unit: ITEMS_PER_PAGE,
      });
      
      const rawData = (response as any).result || response.data || [];
      
      // Filter out current video and ad video
      const filtered = rawData.filter((nft: any) => {
        const id = String(nft.tokenId || nft.id);
        return id !== currentVideoId && id !== AD_POST_ID;
      });
      
      // Only include videos (not images)
      const videos = filtered.filter((nft: any) => {
        const postType = nft.postType || nft.media_type;
        return postType === 'video' || nft.videoUrl;
      });
      
      return {
        data: videos,
        page: pageParam,
        hasMore: rawData.length >= ITEMS_PER_PAGE,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 0,
    staleTime: 1000 * 60 * 5,
  });

  // Flatten all pages into a single array
  const videos = data?.pages.flatMap((page) => 
    page.data.map((nft: any, index: number) => mapNFTToVideoItem(nft, index))
  ) || [];

  // Infinite scroll observer
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
      { 
        rootMargin: '200px',
        root: scrollContainerRef?.current || null
      }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [handleLoadMore, scrollContainerRef]);

  const isLoading = adLoading || videosLoading;

  if (isLoading && videos.length === 0) {
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
          <VideoCard video={{ ...toVideoItem(adVideo), isAd: true }} />
        </div>
      )}

      {/* Latest Videos */}
      {videos.map((video) => (
        <div key={video.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
          <VideoCard video={video} />
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
