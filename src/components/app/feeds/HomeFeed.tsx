/**
 * Home Feed Component
 * ===================
 * Mixed content feed with infinite scroll for the home tab.
 * Fetches content from DeHub API with fallback to mock data.
 * 
 * @module components/app/feeds/HomeFeed
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';

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
import { useDeHubFeed, mapNFTToVideoItem, mapNFTToImagePost } from '@/hooks/use-dehub-feed';

// Mock data fallback
import { 
  STORY_USERS,
  getPaginatedFeed,
  type UnifiedFeedItem,
} from '@/data/mock-feed.data';

import type { VideoItem, ImagePost } from '@/types/feed.types';

const PAGE_SIZE = 15;

interface HomeFeedProps {
  shuffleKey: number;
  isRefreshing: boolean;
}

export function HomeFeed({ shuffleKey, isRefreshing }: HomeFeedProps) {
  const loaderRef = useRef<HTMLDivElement>(null);

  // Fetch from DeHub API
  const {
    data: apiData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isApiLoading,
    isError,
    refetch,
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
  const apiItems = useMemo(() => {
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

  // Fallback to mock data if API fails or returns empty
  const [mockItems, setMockItems] = useState<UnifiedFeedItem[]>([]);
  const [mockPage, setMockPage] = useState(0);
  const [mockHasMore, setMockHasMore] = useState(true);

  useEffect(() => {
    if (isError || (apiItems.length === 0 && !isApiLoading)) {
      setMockItems([]);
      setMockPage(0);
      setMockHasMore(true);
      const { items: initialItems, hasMore: more } = getPaginatedFeed(0, PAGE_SIZE, shuffleKey);
      setMockItems(initialItems);
      setMockHasMore(more);
    }
  }, [isError, shuffleKey, apiItems.length, isApiLoading]);

  // Determine which items to show
  const useMockData = isError || (apiItems.length === 0 && !isApiLoading);
  const items = useMockData ? mockItems : apiItems;
  const hasMore = useMockData ? mockHasMore : hasNextPage;
  const isLoadingMore = useMockData ? false : isFetchingNextPage;

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          if (useMockData) {
            // Load more mock data
            const nextPage = mockPage + 1;
            const { items: newItems, hasMore: more } = getPaginatedFeed(nextPage, PAGE_SIZE, shuffleKey);
            setMockItems(prev => [...prev, ...newItems]);
            setMockPage(nextPage);
            setMockHasMore(more);
          } else {
            // Load more from API
            fetchNextPage();
          }
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, useMockData, mockPage, shuffleKey, fetchNextPage]);

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

  return (
    <div className="p-2 sm:p-3 space-y-3">
      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      ) : (
        <>
          <StoriesBar users={STORY_USERS} />
          {items.map((item, index) => renderFeedItem(item, index))}
          
          {/* Infinite scroll loader */}
          <div ref={loaderRef} className="py-4 flex justify-center">
            {isLoadingMore && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading more...</span>
              </div>
            )}
            {!hasMore && items.length > 0 && (
              <p className="text-zinc-500 text-sm">You've reached the end 🎉</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
