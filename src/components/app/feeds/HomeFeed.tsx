/**
 * Home Feed Component
 * ===================
 * Mixed content feed with infinite scroll for the home tab.
 * Fetches content from DeHub API.
 * 
 * @module components/app/feeds/HomeFeed
 */

import { useEffect, useRef, useMemo } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

// Card components
import { 
  PostCard, 
  VideoCard, 
  ImageCard, 
  LiveCard, 
  ShortsReel, 
  StoriesBar 
} from '@/components/app/cards';

// DeHub API hook
import { useDeHubFeed, useDeHubStoryUsers, mapNFTToVideoItem, mapNFTToImagePost } from '@/hooks/use-dehub-feed';

import type { VideoItem, ImagePost, TextPost, LiveStream, ShortVideo } from '@/types/feed.types';

type UnifiedFeedItem = 
  | { type: 'post'; data: TextPost }
  | { type: 'video'; data: VideoItem }
  | { type: 'image'; data: ImagePost }
  | { type: 'live'; data: LiveStream }
  | { type: 'shorts'; data: ShortVideo[] };

const PAGE_SIZE = 15;

interface HomeFeedProps {
  shuffleKey: number;
  isRefreshing: boolean;
}

export function HomeFeed({ shuffleKey, isRefreshing }: HomeFeedProps) {
  const loaderRef = useRef<HTMLDivElement>(null);

  // Fetch story users from API
  const { storyUsers } = useDeHubStoryUsers(10);

  // Fetch from DeHub API
  const {
    data: apiData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isApiLoading,
    isError,
    refetch,
    error,
  } = useDeHubFeed({
    limit: PAGE_SIZE,
    sort: 'latest',
  });

  // Refetch when shuffleKey changes (pull-to-refresh)
  useEffect(() => {
    if (shuffleKey > 0) {
      refetch();
    }
  }, [shuffleKey, refetch]);

  // Map API data to feed items
  const items = useMemo((): UnifiedFeedItem[] => {
    if (!apiData?.pages) return [];
    
    const allNFTs = apiData.pages.flatMap(page => page.data || []);
    
    return allNFTs.map((nft, index): UnifiedFeedItem => {
      if (nft.media_type === 'image') {
        return {
          type: 'image',
          data: mapNFTToImagePost(nft, index),
        };
      }
      // Default to video for video/audio/other types
      return {
        type: 'video',
        data: mapNFTToVideoItem(nft, index),
      };
    });
  }, [apiData]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderFeedItem = (item: UnifiedFeedItem, index: number) => {
    switch (item.type) {
      case 'post':
        return <PostCard key={`post-${item.data.id}-${index}`} post={item.data} />;
      case 'video':
        return <VideoCard key={`video-${item.data.id}-${index}`} video={item.data} />;
      case 'image':
        return <ImageCard key={`image-${item.data.id}-${index}`} post={item.data} />;
      case 'live':
        return <LiveCard key={`live-${item.data.id}-${index}`} stream={item.data} />;
      case 'shorts':
        return <ShortsReel key={`shorts-${index}`} shorts={item.data} />;
      default:
        return null;
    }
  };

  const isLoading = isApiLoading || isRefreshing;

  // Empty state component
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
        <RefreshCw className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">No Content Yet</h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? `Unable to load feed. ${error?.message || 'Please try again.'}`
          : 'Be the first to share something amazing!'}
      </p>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
      >
        Refresh
      </button>
    </div>
  );

  return (
    <div className="p-2 sm:p-3 space-y-3">
      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      ) : (
        <>
          <StoriesBar users={storyUsers} />
          
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {items.map((item, index) => renderFeedItem(item, index))}
              
              {/* Infinite scroll loader */}
              <div ref={loaderRef} className="py-4 flex justify-center">
                {isFetchingNextPage && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading more...</span>
                  </div>
                )}
                {!hasNextPage && items.length > 0 && (
                  <p className="text-zinc-500 text-sm">You've reached the end 🎉</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
