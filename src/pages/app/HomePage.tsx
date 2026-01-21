/**
 * Home Page
 * =========
 * Main feed page with tab-based navigation between content types.
 * Features swipe gestures for mobile navigation and pull-to-refresh.
 * 
 * @module pages/app/HomePage
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings2, Loader2 } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

// Feed components
import {
  HomeFeed,
  ImagesFeed,
  VideosFeed,
  ShortsFeed,
  LiveFeed,
  PPVFeed,
  W2EFeed,
  MusicFeed,
} from '@/components/app/feeds';

// Modal components
import { FeedSettingsModal, type FeedFilters } from '@/components/app/modals';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum swipe distance to trigger tab change */
const SWIPE_THRESHOLD = 50;
const PULL_THRESHOLD = 80;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function HomePage() {
  // Tab state
  const [activeTab, setActiveTab] = useState('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Filter states for each feed type
  const [showShortsFilters, setShowShortsFilters] = useState(false);
  const [showImagesCollage, setShowImagesCollage] = useState(false);
  const [showVideosFilters, setShowVideosFilters] = useState(false);
  const [showMusicFilters, setShowMusicFilters] = useState(false);
  
  // Settings modal
  const [showFeedSettings, setShowFeedSettings] = useState(false);
  const [feedFilters, setFeedFilters] = useState<FeedFilters>({
    followed: true,
    subscribed: true,
    trending: true,
    latest: false,
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
  // PULL-TO-REFRESH HOOK
  // --------------------------------------------------------------------------

  const { pullDistance, handlers: pullHandlers } = usePullToRefresh({
    pullThreshold: PULL_THRESHOLD,
    onRefresh: triggerRefresh,
    isRefreshing,
  });

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
    setShowMusicFilters(false);
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
      
      if (tabValue === 'home' || tabValue === 'live') {
        triggerRefresh();
      } else if (tabValue === 'shorts') {
        setShowShortsFilters(prev => !prev);
      } else if (tabValue === 'images') {
        setShowImagesCollage(prev => !prev);
        triggerRefresh();
      } else if (tabValue === 'videos') {
        setShowVideosFilters(prev => !prev);
      } else if (tabValue === 'music') {
        setShowMusicFilters(prev => !prev);
      }
    } else {
      setActiveTab(tabValue);
      resetFilters();
    }
  };

  // --------------------------------------------------------------------------
  // SWIPE GESTURE HANDLERS
  // --------------------------------------------------------------------------

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
    pullHandlers.onTouchStart(e);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    pullHandlers.onTouchMove(e);
    
    // Prevent native browser pull-to-refresh when custom pull is active
    if (pullDistance > 0) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    pullHandlers.onTouchEnd();
    
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
  // RENDER FEED BASED ON ACTIVE TAB
  // --------------------------------------------------------------------------

  const renderFeed = () => {
    switch (activeTab) {
      case 'ppv':
        return <PPVFeed />;
      case 'w2e':
        return <W2EFeed />;
      case 'images':
        return <ImagesFeed showCollage={showImagesCollage} isRefreshing={isRefreshing} refreshKey={refreshKey} />;
      case 'videos':
        return <VideosFeed showFilters={showVideosFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />;
      case 'shorts':
        return <ShortsFeed showFilters={showShortsFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />;
      case 'live':
        return <LiveFeed key={refreshKey} isRefreshing={isRefreshing} />;
      case 'music':
        return <MusicFeed showFilters={showMusicFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />;
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
      onMouseDown={pullHandlers.onMouseDown}
      onMouseMove={pullHandlers.onMouseMove}
      onMouseUp={pullHandlers.onMouseUp}
      onMouseLeave={pullHandlers.onMouseLeave}
    >

      {/* Tab Navigation */}
      <div className="sticky top-14 lg:top-0 bg-black z-10 p-2 sm:p-3 lg:mt-0">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {FEED_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabClick(tab.value)}
                className={cn(
                  'flex-1 flex items-center justify-center px-3 sm:px-4 py-2 rounded-xl transition-colors text-white hover:bg-white/5',
                  activeTab === tab.value && 'bg-zinc-800 hover:bg-zinc-800'
                )}
              >
                <tab.icon className="w-4 h-4" />
              </button>
            ))}
            
            {/* Settings Button */}
            <button
              onClick={() => setShowFeedSettings(true)}
              className="flex items-center justify-center px-3 py-2 rounded-xl transition-colors text-white hover:bg-white/5"
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
