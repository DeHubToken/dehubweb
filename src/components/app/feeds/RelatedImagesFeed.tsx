/**
 * Related Images Feed Component
 * =============================
 * Displays an infinite scroll feed of recent images below the main image post.
 * First item is always the DeHub ad slot, followed by latest images with pagination.
 * 
 * @module components/app/feeds/RelatedImagesFeed
 */

import { useRef, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { searchNFTs, getNFTInfo } from '@/lib/api/dehub';
import { mapNFTToImagePost } from '@/hooks/use-dehub-feed';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { buildAvatarUrl, extractAvatarPath, buildImageUrl, buildFeedImageUrls, buildVideoUrl } from '@/lib/media-url';
import { formatTimeAgo, formatViews } from '@/lib/feed-utils';
import type { VideoItem } from '@/types/feed.types';
import { VideoCard } from '@/components/app/cards/VideoCard';

const AD_POST_ID = '2008';
const ITEMS_PER_PAGE = 10;

interface RelatedImagesFeedProps {
  /** Current image post ID to exclude from the feed */
  currentPostId: string;
}

/**
 * Transform API NFT data to VideoItem format for the ad (video ad)
 */
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


export function RelatedImagesFeed({ currentPostId }: RelatedImagesFeedProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  // Fetch the ad video
  const { data: adVideo, isLoading: adLoading } = useQuery({
    queryKey: ['ad-video', AD_POST_ID],
    queryFn: () => getNFTInfo(AD_POST_ID),
    staleTime: 1000 * 60 * 30,
  });

  // Fetch latest images with pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: imagesLoading,
  } = useInfiniteQuery({
    queryKey: ['related-images-feed', currentPostId],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await searchNFTs({
        sortMode: 'new',
        status: 'minted',
        page: pageParam,
        unit: ITEMS_PER_PAGE,
      });
      
      const rawData = (response as any).result || response.data || [];
      
      // Filter out current post and ad, keep only images
      const filtered = rawData.filter((nft: any) => {
        const id = String(nft.tokenId || nft.id);
        if (id === currentPostId || id === AD_POST_ID) return false;
        const postType = nft.postType || nft.media_type;
        return postType === 'image' || postType === 'feed-images' || 
          ((nft.imageUrls?.length > 0 || nft.imageUrl) && !nft.videoUrl && postType !== 'video');
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

  // Flatten all pages
  const images = data?.pages.flatMap((page) => 
    page.data.map((nft: any, index: number) => mapNFTToImagePost(nft, index))
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
      { rootMargin: '200px' }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [handleLoadMore]);

  const isLoading = adLoading || imagesLoading;

  if (isLoading && images.length === 0) {
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
        <div className="relative rounded-xl border border-white/[0.08] bg-transparent p-3">
          <VideoCard video={adToVideoItem(adVideo)} />
        </div>
      )}

      {/* Latest Images */}
      {images.map((img) => (
        <div key={img.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
          <ImageCard post={img} />
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
