/**
 * Home Page
 * =========
 * Main feed page with tab-based navigation between content types.
 * Features swipe gestures for mobile navigation and pull-to-refresh.
 * 
 * @module pages/app/HomePage
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { setTabSwitchTime } from '@/lib/gesture-state';

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


// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum swipe distance to trigger tab change */
const SWIPE_THRESHOLD = 50;
const PULL_THRESHOLD = 80;
/** Minimum trackpad delta to trigger tab change */
const TRACKPAD_THRESHOLD = 60;
/** Lock duration after gesture trigger - covers trackpad inertia */
const GESTURE_LOCK_DURATION = 400;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Extract pinned post ID from URL params (one-time view)
  const pinnedPostId = searchParams.get('post') || undefined;
  
  // Clear the post param from URL after initial render (so refresh shows normal feed)
  useEffect(() => {
    if (pinnedPostId) {
      // Use replace to avoid adding to browser history
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Tab state
  const [activeTab, setActiveTab] = useState('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Filter states for each feed type
  const [showHomeFilters, setShowHomeFilters] = useState(false);
  const [showShortsFilters, setShowShortsFilters] = useState(false);
  const [showImagesCollage, setShowImagesCollage] = useState(true); // Default to collage
  const [showImagesFilters, setShowImagesFilters] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [showVideosFilters, setShowVideosFilters] = useState(false);
  const [showMusicFilters, setShowMusicFilters] = useState(false);
  
  
  // Mobile touch gesture refs
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const touchGestureTriggered = useRef(false);
  
  // Trackpad gesture - simple lock approach
  const gestureTriggered = useRef(false);
  const gestureLockTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Feed container ref for pull-to-refresh constraint
  const feedContainerRef = useRef<HTMLDivElement>(null);
  
  // Debounce guard for home-refresh events to prevent rapid succession
  const lastRefreshTime = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 1000;

  // --------------------------------------------------------------------------
  // REFRESH HANDLER
  // --------------------------------------------------------------------------

  const triggerRefresh = useCallback(() => {
    if (isRefreshing) return;
    
    // Debounce rapid refresh calls (e.g., multiple home-refresh events)
    const now = Date.now();
    if (now - lastRefreshTime.current < REFRESH_DEBOUNCE_MS) return;
    lastRefreshTime.current = now;
    
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
    containerRef: feedContainerRef,
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
    setShowHomeFilters(false);
    setShowShortsFilters(false);
    setShowImagesCollage(true); // Reset to collage view
    setShowImagesFilters(false);
    setSelectedImageId(null);
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
      
      if (tabValue === 'home') {
        setShowHomeFilters(prev => !prev);
      } else if (tabValue === 'live') {
        triggerRefresh();
      } else if (tabValue === 'shorts') {
        setShowShortsFilters(prev => !prev);
      } else if (tabValue === 'images') {
        // Double-tap on images toggles filters (like other tabs)
        setShowImagesFilters(prev => !prev);
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

  /**
   * Handle when user selects an image from collage view.
   * Switches to feed view starting from that image.
   */
  const handleImageSelected = (postId: string | null) => {
    setSelectedImageId(postId);
    if (postId) {
      // When an image is selected, switch out of collage mode
      setShowImagesCollage(false);
    }
  };

  /**
   * Handle returning from feed view back to collage view.
   */
  const handleBackToCollage = () => {
    setSelectedImageId(null);
    setShowImagesCollage(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  /**
   * Reset scroll position when tab changes.
   */
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    // Also reset any scrollable containers
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.scrollTop = 0;
    }
  }, [activeTab]);

  // --------------------------------------------------------------------------
  // SWIPE GESTURE HANDLERS
  // --------------------------------------------------------------------------

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = null;
    touchEndY.current = null;
    touchGestureTriggered.current = false; // New gesture starting
    pullHandlers.onTouchStart(e);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
    pullHandlers.onTouchMove(e);
    
    // Prevent native browser pull-to-refresh when custom pull is active
    if (pullDistance > 0) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    pullHandlers.onTouchEnd();
    
    // Already triggered this gesture? Reset and exit
    if (touchGestureTriggered.current) {
      touchStartX.current = null;
      touchEndX.current = null;
      touchStartY.current = null;
      touchEndY.current = null;
      return;
    }
    
    // Handle horizontal swipe for tab switching
    if (!touchStartX.current || !touchEndX.current || 
        !touchStartY.current || !touchEndY.current) {
      touchStartX.current = null;
      touchEndX.current = null;
      touchStartY.current = null;
      touchEndY.current = null;
      return;
    }
    
    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = Math.abs(touchStartY.current - touchEndY.current);
    const absDeltaX = Math.abs(deltaX);
    
    // Only switch tabs if horizontal movement clearly dominates vertical
    const isHorizontalSwipe = absDeltaX > SWIPE_THRESHOLD && absDeltaX > deltaY * 1.5;
    
    if (isHorizontalSwipe) {
      const isLeftSwipe = deltaX > 0;
      const isRightSwipe = deltaX < 0;
      
      const tabValues = FEED_TABS.map(tab => tab.value);
      const currentIndex = tabValues.indexOf(activeTab);
      
      // Mark gesture as triggered - one swipe = one action
      touchGestureTriggered.current = true;
      
      if (isLeftSwipe && currentIndex < tabValues.length - 1) {
        flushSync(() => {
          setActiveTab(tabValues[currentIndex + 1]);
        });
        setTabSwitchTime(); // Mark tab switch for carousel cooldown
        resetFilters();
      } else if (isRightSwipe && currentIndex > 0) {
        flushSync(() => {
          setActiveTab(tabValues[currentIndex - 1]);
        });
        setTabSwitchTime(); // Mark tab switch for carousel cooldown
        resetFilters();
      }
    }
    
    touchStartX.current = null;
    touchEndX.current = null;
    touchStartY.current = null;
    touchEndY.current = null;
  };

  // --------------------------------------------------------------------------
  // TRACKPAD SWIPE HANDLER (Two-finger horizontal swipe on laptop)
  // --------------------------------------------------------------------------

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // LOCKED? Ignore all wheel events until lock expires (covers inertia)
    if (gestureTriggered.current) return;
    
    const absDeltaX = Math.abs(e.deltaX);
    const absDeltaY = Math.abs(e.deltaY);
    
    // Ignore vertical scrolling
    if (absDeltaY > absDeltaX) return;
    
    // Single event threshold check - no accumulation
    if (absDeltaX > TRACKPAD_THRESHOLD) {
      const tabValues = FEED_TABS.map(tab => tab.value);
      const currentIndex = tabValues.indexOf(activeTab);
      
      if (e.deltaX > 0 && currentIndex < tabValues.length - 1) {
        flushSync(() => setActiveTab(tabValues[currentIndex + 1]));
        setTabSwitchTime(); // Mark tab switch for carousel cooldown
        resetFilters();
        gestureTriggered.current = true;
      } else if (e.deltaX < 0 && currentIndex > 0) {
        flushSync(() => setActiveTab(tabValues[currentIndex - 1]));
        setTabSwitchTime(); // Mark tab switch for carousel cooldown
        resetFilters();
        gestureTriggered.current = true;
      }
      
      // Keep locked for full inertia duration
      if (gestureTriggered.current) {
        if (gestureLockTimeout.current) clearTimeout(gestureLockTimeout.current);
        gestureLockTimeout.current = setTimeout(() => {
          gestureTriggered.current = false;
        }, GESTURE_LOCK_DURATION);
      }
    }
  }, [activeTab, resetFilters]);

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
        return (
          <ImagesFeed 
            showCollage={showImagesCollage} 
            showFilters={showImagesFilters}
            isRefreshing={isRefreshing} 
            refreshKey={refreshKey}
            selectedPostId={selectedImageId}
            onPostSelected={handleImageSelected}
            onBackToCollage={handleBackToCollage}
          />
        );
      case 'videos':
        return <VideosFeed showFilters={showVideosFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />;
      case 'shorts':
        return <ShortsFeed showFilters={showShortsFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />;
      case 'live':
        return <LiveFeed key={refreshKey} isRefreshing={isRefreshing} />;
      case 'music':
        return <MusicFeed showFilters={showMusicFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />;
      default:
        return <HomeFeed shuffleKey={refreshKey} isRefreshing={isRefreshing} showFilters={showHomeFilters} pinnedPostId={pinnedPostId} />;
    }
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div>
      {/* Tab Navigation */}
      <div className="sticky top-11 lg:top-0 bg-black z-10 p-2 sm:p-3 lg:mt-0">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {FEED_TABS.map((tab) => {
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={`${tab.value}-${activeTab}`}
                  onClick={() => handleTabClick(tab.value)}
                  className={cn(
                    'flex-1 flex items-center justify-center px-3 sm:px-4 py-2 rounded-xl text-white',
                    isActive 
                      ? 'bg-zinc-800' 
                      : 'hover:bg-white/5'
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                </button>
              );
            })}
            
            {/* Settings Button - toggles current tab's filters */}
            <button
              onClick={() => handleTabClick(activeTab)}
              className="flex items-center justify-center px-3 py-2 rounded-xl text-white hover:bg-white/5"
              aria-label="Feed settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Feed Content - Pull-to-refresh only works within this container */}
      <div 
        ref={feedContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onMouseDown={pullHandlers.onMouseDown}
        onMouseMove={pullHandlers.onMouseMove}
        onMouseUp={pullHandlers.onMouseUp}
        onMouseLeave={pullHandlers.onMouseLeave}
      >
        {renderFeed()}
      </div>

    </div>
  );
}
