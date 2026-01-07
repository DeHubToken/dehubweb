/**
 * Home Feed Component
 * ===================
 * Mixed content feed with infinite scroll for the home tab.
 * Displays a curated mix of all content types, paginated.
 * 
 * @module components/app/feeds/HomeFeed
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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

// Mock data
import { 
  STORY_USERS,
  getPaginatedFeed,
  type UnifiedFeedItem,
} from '@/data/mock-feed.data';

const PAGE_SIZE = 15;

interface HomeFeedProps {
  shuffleKey: number;
  isRefreshing: boolean;
}

export function HomeFeed({ shuffleKey, isRefreshing }: HomeFeedProps) {
  const [items, setItems] = useState<UnifiedFeedItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Load initial items
  useEffect(() => {
    setItems([]);
    setPage(0);
    setHasMore(true);
    const { items: initialItems, hasMore: more } = getPaginatedFeed(0, PAGE_SIZE, shuffleKey);
    setItems(initialItems);
    setHasMore(more);
  }, [shuffleKey]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, page, shuffleKey]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    
    setIsLoading(true);
    // Simulate network delay
    setTimeout(() => {
      const nextPage = page + 1;
      const { items: newItems, hasMore: more } = getPaginatedFeed(nextPage, PAGE_SIZE, shuffleKey);
      setItems(prev => [...prev, ...newItems]);
      setPage(nextPage);
      setHasMore(more);
      setIsLoading(false);
    }, 500);
  }, [page, shuffleKey, isLoading, hasMore]);

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

  return (
    <div className="p-2 sm:p-3 space-y-3">
      {isRefreshing ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      ) : (
        <>
          <StoriesBar users={STORY_USERS} />
          {items.map((item, index) => renderFeedItem(item, index))}
          
          {/* Infinite scroll loader */}
          <div ref={loaderRef} className="py-4 flex justify-center">
            {isLoading && (
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
