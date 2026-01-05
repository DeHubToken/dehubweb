/**
 * Home Page
 * =========
 * Main feed page with tab-based navigation between content types.
 * Features swipe gestures for mobile navigation and mixed content home feed.
 * 
 * @module pages/app/HomePage
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings2, Loader2, RefreshCw } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';

// Feed components
import { ImagesFeed } from '@/components/app/feeds/ImagesFeed';
import { VideosFeed } from '@/components/app/feeds/VideosFeed';
import { ShortsFeed } from '@/components/app/feeds/ShortsFeed';
import { LiveFeed } from '@/components/app/feeds/LiveFeed';
import { PPVFeed } from '@/components/app/feeds/PPVFeed';
import { W2EFeed } from '@/components/app/feeds/W2EFeed';

// Card components
import { 
  PostCard, 
  VideoCard, 
  ImageCard, 
  LiveCard, 
  ShortsReel, 
  StoriesBar 
} from '@/components/app/cards';

// UI components
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

// Mock data
import { 
  STORY_USERS,
  getPaginatedFeed,
  type UnifiedFeedItem,
} from '@/data/mock-feed.data';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum swipe distance to trigger tab change */
const SWIPE_THRESHOLD = 50;
const PAGE_SIZE = 15;
const PULL_THRESHOLD = 80;

// ============================================================================
// HOME FEED COMPONENT
// ============================================================================

/**
 * Mixed content feed for the home tab with infinite scroll.
 * Displays a curated mix of all content types, paginated.
 */
function HomeFeed({ shuffleKey, isRefreshing }: { shuffleKey: number; isRefreshing: boolean }) {
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

// ============================================================================
// FEED SETTINGS MODAL
// ============================================================================

interface FeedFilters {
  followed: boolean;
  subscribed: boolean;
  trending: boolean;
}

interface FeedSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FeedFilters;
  onFiltersChange: (filters: FeedFilters) => void;
}

/**
 * Modal for configuring feed preferences.
 */
function FeedSettingsModal({ open, onOpenChange, filters, onFiltersChange }: FeedSettingsProps) {
  const updateFilter = (key: keyof FeedFilters, value: boolean) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Feed Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Followed</p>
              <p className="text-sm text-zinc-400">Show posts from people you follow</p>
            </div>
            <Switch
              checked={filters.followed}
              onCheckedChange={(checked) => updateFilter('followed', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Subscribed</p>
              <p className="text-sm text-zinc-400">Show posts from your subscriptions</p>
            </div>
            <Switch
              checked={filters.subscribed}
              onCheckedChange={(checked) => updateFilter('subscribed', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Trending</p>
              <p className="text-sm text-zinc-400">Show trending content first</p>
            </div>
            <Switch
              checked={filters.trending}
              onCheckedChange={(checked) => updateFilter('trending', checked)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function HomePage() {
  // Tab state
  const [activeTab, setActiveTab] = useState('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const pullStartY = useRef<number | null>(null);
  
  // Filter states for each feed type
  const [showShortsFilters, setShowShortsFilters] = useState(false);
  const [showImagesCollage, setShowImagesCollage] = useState(false);
  const [showVideosFilters, setShowVideosFilters] = useState(false);
  
  // Settings modal
  const [showFeedSettings, setShowFeedSettings] = useState(false);
  const [feedFilters, setFeedFilters] = useState<FeedFilters>({
    followed: true,
    subscribed: true,
    trending: true,
  });
  
  // Swipe gesture refs
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // --------------------------------------------------------------------------
  // REFRESH HANDLER
  // --------------------------------------------------------------------------

  const triggerRefresh = useCallback(() => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    // Scroll to top
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Simulate refresh delay then update
    setTimeout(() => {
      setRefreshKey(prev => prev + 1);
      setTimeout(() => {
        setIsRefreshing(false);
      }, 300);
    }, 800);
  }, [isRefreshing]);

  // --------------------------------------------------------------------------
  // EVENT HANDLERS
  // --------------------------------------------------------------------------

  /**
   * Listen for home refresh events from navigation.
   */
  useEffect(() => {
    const handleHomeRefresh = () => {
      setActiveTab('home');
      resetFilters();
      triggerRefresh();
    };

    window.addEventListener('home-refresh', handleHomeRefresh);
    return () => window.removeEventListener('home-refresh', handleHomeRefresh);
  }, [triggerRefresh]);

  /**
   * Reset all filter states.
   */
  const resetFilters = () => {
    setShowShortsFilters(false);
    setShowImagesCollage(false);
    setShowVideosFilters(false);
  };

  /**
   * Handle tab click - toggle filters on same tab, switch on different tab.
   */
  const handleTabClick = (tabValue: string) => {
    if (tabValue === activeTab) {
      // Same tab clicked - always scroll to top
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      if (tabValue === 'home') {
        // Home tab - refresh/shuffle feed with animation
        triggerRefresh();
      } else if (tabValue === 'shorts') {
        setShowShortsFilters(prev => !prev);
      } else if (tabValue === 'images') {
        setShowImagesCollage(prev => !prev);
      } else if (tabValue === 'videos') {
        setShowVideosFilters(prev => !prev);
      }
    } else {
      setActiveTab(tabValue);
      resetFilters();
    }
  };

  // --------------------------------------------------------------------------
  // SWIPE & PULL-TO-REFRESH GESTURE HANDLERS
  // --------------------------------------------------------------------------

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
    
    // Check if at top of page for pull-to-refresh
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop <= 0 && activeTab === 'home') {
      pullStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    
    // Handle pull-to-refresh
    if (isPulling && pullStartY.current !== null && activeTab === 'home') {
      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, currentY - pullStartY.current);
      // Apply resistance - the further you pull, the harder it gets
      const resistedDistance = Math.min(distance * 0.5, PULL_THRESHOLD * 1.5);
      setPullDistance(resistedDistance);
    }
  };

  const handleTouchEnd = () => {
    // Handle pull-to-refresh release
    if (isPulling && pullDistance >= PULL_THRESHOLD && activeTab === 'home') {
      triggerRefresh();
    }
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
    
    // Handle horizontal swipe for tab switching
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > SWIPE_THRESHOLD;
    const isRightSwipe = distance < -SWIPE_THRESHOLD;
    
    const tabValues = FEED_TABS.map(tab => tab.value);
    const currentIndex = tabValues.indexOf(activeTab);
    
    if (isLeftSwipe && currentIndex < tabValues.length - 1) {
      setActiveTab(tabValues[currentIndex + 1]);
      resetFilters();
    } else if (isRightSwipe && currentIndex > 0) {
      setActiveTab(tabValues[currentIndex - 1]);
      resetFilters();
    }
    
    touchStartX.current = null;
    touchEndX.current = null;
  };

  // --------------------------------------------------------------------------
  // MOUSE HANDLERS FOR DESKTOP PULL-TO-REFRESH
  // --------------------------------------------------------------------------

  const handleMouseDown = (e: React.MouseEvent) => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop <= 0 && activeTab === 'home') {
      pullStartY.current = e.clientY;
      setIsPulling(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPulling && pullStartY.current !== null && activeTab === 'home') {
      const distance = Math.max(0, e.clientY - pullStartY.current);
      const resistedDistance = Math.min(distance * 0.5, PULL_THRESHOLD * 1.5);
      setPullDistance(resistedDistance);
    }
  };

  const handleMouseUp = () => {
    if (isPulling && pullDistance >= PULL_THRESHOLD && activeTab === 'home') {
      triggerRefresh();
    }
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
  };

  const handleMouseLeave = () => {
    if (isPulling) {
      setPullDistance(0);
      setIsPulling(false);
      pullStartY.current = null;
    }
  };

  // --------------------------------------------------------------------------
  // RENDER FEED BASED ON ACTIVE TAB
  // --------------------------------------------------------------------------

  const renderFeed = () => {
    switch (activeTab) {
      case 'ppv':
        return <PPVFeed />;
      case 'w2e':
        return <W2EFeed />;
      case 'images':
        return <ImagesFeed showCollage={showImagesCollage} />;
      case 'videos':
        return <VideosFeed showFilters={showVideosFilters} />;
      case 'shorts':
        return <ShortsFeed showFilters={showShortsFilters} />;
      case 'live':
        return <LiveFeed key={refreshKey} />;
      default:
        return <HomeFeed shuffleKey={refreshKey} isRefreshing={isRefreshing} />;
    }
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Pull-to-refresh indicator - only show when pulling, not when refreshing */}
      {activeTab === 'home' && pullDistance > 0 && !isRefreshing && (
        <div 
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm transition-all duration-200"
          style={{ 
            height: pullDistance,
            opacity: Math.min(pullDistance / PULL_THRESHOLD, 1)
          }}
        >
          <Loader2 
            className="w-6 h-6 text-primary transition-transform"
            style={{ 
              transform: `rotate(${pullDistance * 4}deg)` 
            }}
          />
        </div>
      )}
      {/* Tab Navigation */}
      <div className="sticky top-0 bg-black/80 backdrop-blur-sm z-10 p-2 sm:p-3 mt-2 lg:mt-0">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {FEED_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabClick(tab.value)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl transition-colors text-sm whitespace-nowrap text-white',
                  activeTab === tab.value && 'bg-zinc-800'
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
            
            {/* Settings Button */}
            <button
              onClick={() => setShowFeedSettings(true)}
              className="flex items-center justify-center px-3 py-2 rounded-xl transition-colors text-white"
              aria-label="Feed settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Feed Content */}
      {renderFeed()}

      {/* Settings Modal */}
      <FeedSettingsModal
        open={showFeedSettings}
        onOpenChange={setShowFeedSettings}
        filters={feedFilters}
        onFiltersChange={setFeedFilters}
      />
    </div>
  );
}
