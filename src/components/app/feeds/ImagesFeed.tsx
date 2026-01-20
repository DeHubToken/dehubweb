/**
 * Images Feed Component
 * =====================
 * Displays image posts in collage or endless scroll view.
 * Fetches from DeHub API.
 * 
 * @module components/app/feeds/ImagesFeed
 */

import { useRef, useMemo, useEffect } from 'react';
import { Heart, MessageCircle, Loader2, RefreshCw, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageCard } from '@/components/app/cards';

import { useDeHubImages, mapNFTToImagePost } from '@/hooks/use-dehub-feed';
import type { ImagePost } from '@/types/feed.types';

// ============================================================================
// TYPES
// ============================================================================

interface ImagesFeedProps {
  showCollage?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function CollageView({ posts }: { posts: ImagePost[] }) {
  return (
    <div className="p-1 sm:p-2">
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
        {posts.map((post, index) => {
          const isLargeTile = (index + 1) % 3 === 0 && index !== 0;
          
          return (
            <div
              key={post.id}
              className={cn(
                'relative aspect-square bg-zinc-800 overflow-hidden group cursor-pointer',
                isLargeTile && 'col-span-2 row-span-2'
              )}
            >
              <img
                src={post.image}
                alt=""
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 sm:gap-6">
                <div className="flex items-center gap-1 sm:gap-2 text-white">
                  <Heart className="w-4 h-4 sm:w-6 sm:h-6 fill-white" />
                  <span className="font-semibold text-xs sm:text-base">{post.likes.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 text-white">
                  <MessageCircle className="w-4 h-4 sm:w-6 sm:h-6 fill-white" />
                  <span className="font-semibold text-xs sm:text-base">{post.comments}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EndlessScrollView({ 
  posts, 
  loaderRef, 
  isFetchingNextPage, 
  hasNextPage 
}: { 
  posts: ImagePost[];
  loaderRef: React.RefObject<HTMLDivElement>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}) {
  return (
    <div className="p-2 sm:p-3 space-y-3">
      {posts.map((post) => (
        <ImageCard key={post.id} post={post} />
      ))}
      
      {/* Infinite scroll loader */}
      <div ref={loaderRef} className="py-4 flex justify-center">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading more...</span>
          </div>
        )}
        {!hasNextPage && posts.length > 0 && (
          <p className="text-zinc-500 text-sm">You've reached the end 🎉</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ImagesFeed({ showCollage = false, isRefreshing = false, refreshKey = 0 }: ImagesFeedProps) {
  const hasAnimated = useRef(false);
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
  } = useDeHubImages({
    limit: 15,
    sort: 'latest',
  });

  // Refetch when refreshKey changes
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  // Map API data to ImagePost array
  const imagePosts = useMemo(() => {
    if (!apiData?.pages) return [];
    const allNFTs = apiData.pages.flatMap(page => page.data || []);
    return allNFTs.map((nft, index) => mapNFTToImagePost(nft, index));
  }, [apiData]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current || !hasNextPage || showCollage) return;

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, showCollage]);
  
  // Only animate after first render (when switching views)
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;

  const isLoading = isApiLoading || isRefreshing;

  // Empty state component
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
        <ImageIcon className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">No Images Yet</h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? 'Unable to load images. Please try again.'
          : 'Be the first to share an image!'}
      </p>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="p-2 sm:p-3">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      </div>
    );
  }

  if (imagePosts.length === 0) {
    return <EmptyState />;
  }

  return (
    <AnimatePresence mode="wait">
      {showCollage ? (
        <motion.div
          key={`collage-${refreshKey}`}
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <CollageView posts={imagePosts} />
        </motion.div>
      ) : (
        <motion.div
          key={`endless-${refreshKey}`}
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <EndlessScrollView 
            posts={imagePosts} 
            loaderRef={loaderRef}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage ?? false}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
