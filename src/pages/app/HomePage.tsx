/**
 * Home Page
 * =========
 * Main feed page with tab-based navigation between content types.
 * Features swipe gestures for mobile navigation and pull-to-refresh.
 * Prefetches all feed tabs in background for instant switching.
 * 
 * @module pages/app/HomePage
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { flushSync } from 'react-dom';
import { useSearchParams, useNavigationType } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { setTabSwitchTime } from '@/lib/gesture-state';
import { useFeedPrefetch, clearPrefetchState } from '@/hooks/use-feed-prefetch';
import { clearPersistedFeedFilters } from '@/hooks/use-persisted-feed-filter';


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
import { AudioSpacesModal } from '@/components/app/spaces/AudioSpacesModal';
// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum swipe distance to trigger tab change */
const SWIPE_THRESHOLD = 50;
const PULL_THRESHOLD = 80;
/** Minimum trackpad delta to trigger tab change */
const TRACKPAD_THRESHOLD = 60;
/** Lock duration after gesture trigger - covers trackpad inertia */
const GESTURE_LOCK_DURATION = 300;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Session storage key for persisting tab state across navigation
const HOME_STATE_STORAGE_KEY = 'home-feed-state';

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Detect back navigation for tab-change scroll logic
  // Note: Actual scroll position restoration is handled by AppLayout
  const navigationType = useNavigationType();
  const isBackNavigation = navigationType === 'POP';
  
  // Extract pinned post ID from URL params (one-time view)
  const pinnedPostId = searchParams.get('post') || undefined;
  
  // Clear the post param from URL after initial render (so refresh shows normal feed)
  useEffect(() => {
    if (pinnedPostId) {
      // Use replace to avoid adding to browser history
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Initialize tab state - restore from sessionStorage on back navigation
  const getInitialTab = () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(HOME_STATE_STORAGE_KEY);
        if (saved) {
          const { tab } = JSON.parse(saved);
          if (tab) return tab;
        }
      } catch {
        // Ignore parse errors
      }
    }
    return 'home';
  };
  
  // Tab state - initialized from sessionStorage for back navigation
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const { layerRef: homeTabLayerRef, setRef: setHomeTabRef, rect: homeTabRect, onScroll: onHomeTabScroll } = useTabIndicator(activeTab);
  const [refreshKey, setRefreshKey] = useState(0);

  // Lazy mount: only mount a feed on its first visit, then keep it alive.
  // Prevents all 8 feeds from firing queries simultaneously on page load.
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([getInitialTab()]));
  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Filter states for each feed type
  const [showHomeFilters, setShowHomeFilters] = useState(false);
  const [showShortsFilters, setShowShortsFilters] = useState(false);
  const [showImagesCollage, setShowImagesCollage] = useState(true); // Default to collage
  const [showImagesFilters, setShowImagesFilters] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [showVideosFilters, setShowVideosFilters] = useState(false);
  const [showMusicFilters, setShowMusicFilters] = useState(false);
  const [showStagesModal, setShowStagesModal] = useState(false);
  
  // Save tab state to sessionStorage whenever it changes
  useEffect(() => {
    try {
      sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab: activeTab }));
    } catch {
      // Ignore storage errors
    }
  }, [activeTab]);
  
  
  // Mobile touch gesture refs
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const touchGestureTriggered = useRef(false);
  const touchInsideNoSwipe = useRef(false);
  
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
    
    // Clear prefetch state so feeds will be re-fetched
    clearPrefetchState();
    
    // Clear persisted filter states so filters reset to defaults
    clearPersistedFeedFilters();
    
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
  
  // Track when home feed has loaded for prefetching other tabs
  const [isHomeFeedLoaded, setIsHomeFeedLoaded] = useState(false);
  
  // Prefetch all other feeds in background once home feed loads
  useFeedPrefetch(isHomeFeedLoaded);
  
  // Delay other-tab prefetching so the home feed query gets network priority
  // The home feed's own useUnifiedFeed fires on mount; give it 2s head start
  useEffect(() => {
    const timer = setTimeout(() => setIsHomeFeedLoaded(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // --------------------------------------------------------------------------
  // PULL-TO-REFRESH HOOK
  // --------------------------------------------------------------------------

  const { pullDistance, isPulling, isHoldingAtThreshold, holdProgress, handlers: pullHandlers } = usePullToRefresh({
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

    const handleCategoryFilter = () => {
      // Switch to home tab and refresh feed when a category is selected from sidebar
      setActiveTab('home');
      triggerRefresh();
    };

    const handleSwitchTab = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab) setActiveTab(tab);
    };

    window.addEventListener('home-refresh', handleHomeRefresh);
    window.addEventListener('category-filter-changed', handleCategoryFilter);
    window.addEventListener('switch-home-tab', handleSwitchTab);
    return () => {
      window.removeEventListener('home-refresh', handleHomeRefresh);
      window.removeEventListener('category-filter-changed', handleCategoryFilter);
      window.removeEventListener('switch-home-tab', handleSwitchTab);
    };
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
   * Reset scroll position when tab changes (but not when returning from post page).
   */
  const prevTabRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);
  
  useEffect(() => {
    // Skip scroll-to-top if:
    // 1. First mount AND we're returning via back navigation (browser back button)
    // 2. Tab hasn't actually changed
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      prevTabRef.current = activeTab;
      
      // On back navigation, don't scroll to top - let scroll restoration handle it
      if (isBackNavigation) {
        return;
      }
    }
    
    if (prevTabRef.current === activeTab) {
      return;
    }
    
    prevTabRef.current = activeTab;
    
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    // Also reset any scrollable containers
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.scrollTop = 0;
    }
  }, [activeTab, isBackNavigation]);

  // --------------------------------------------------------------------------
  // SWIPE GESTURE HANDLERS
  // --------------------------------------------------------------------------

  const handleTouchStart = (e: React.TouchEvent) => {
    // Skip entire gesture if touch originated inside a no-swipe zone (filter panel)
    const target = e.target as HTMLElement;
    touchInsideNoSwipe.current = !!target.closest('[data-no-swipe]');
    if (touchInsideNoSwipe.current) return;

    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = null;
    touchEndY.current = null;
    touchGestureTriggered.current = false;
    pullHandlers.onTouchStart(e);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchInsideNoSwipe.current) return;

    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
    pullHandlers.onTouchMove(e);
    
    // Prevent native browser pull-to-refresh when custom pull is active
    if (pullDistance > 0) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (touchInsideNoSwipe.current) {
      touchInsideNoSwipe.current = false;
      return;
    }

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
    
    // Skip if wheel originated inside a no-swipe zone (filter panel)
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-swipe]')) return;
    
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

  // Feeds are rendered persistently below using CSS display toggle

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div>
      {/* Tab Navigation */}
      <div className="sticky top-11 lg:top-0 bg-black z-50 p-2 sm:p-3 lg:mt-0">
        <div className="bg-zinc-900 rounded-xl overflow-visible">
          <div ref={homeTabLayerRef} className="relative overflow-visible">
            <GlassIndicator rect={homeTabRect} borderRadius="0.75rem" />
            <div className="relative z-20 flex scrollbar-hide">
              {FEED_TABS.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    ref={setHomeTabRef(tab.value)}
                    onClick={() => handleTabClick(tab.value)}
                    className={cn(
                      'relative z-40 flex-1 flex items-center justify-center px-3 sm:px-4 py-2.5 rounded-xl',
                      isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
                    )}
                  >
                    <tab.icon className="relative z-10 w-4 h-4" />
                  </button>
                );
              })}
              
              {/* Settings Button - toggles current tab's filters */}
              <button
                onClick={() => handleTabClick(activeTab)}
                className="flex items-center justify-center px-3 py-2.5 rounded-xl text-white hover:bg-white/5"
                aria-label="Feed settings"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            </div>
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
        {/* Pull-to-refresh indicator with hold progress */}
        {pullDistance > 0 && (
          <div 
            className="flex items-center justify-center transition-all duration-150"
            style={{ height: pullDistance, minHeight: pullDistance > 0 ? 20 : 0 }}
          >
            <div className="relative">
              {/* Background circle (track) */}
              <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2"
                />
                {/* Progress arc - shows hold progress when at threshold */}
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 14}
                  strokeDashoffset={2 * Math.PI * 14 * (1 - (isHoldingAtThreshold ? holdProgress : Math.min(pullDistance / PULL_THRESHOLD, 1)))}
                  className="transition-all duration-75"
                />
              </svg>
              {/* Center dot that appears when holding */}
              {isHoldingAtThreshold && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div 
                    className="w-3 h-3 bg-white rounded-full animate-pulse"
                    style={{ opacity: holdProgress }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        {/* Feeds mount lazily on first tab visit, then stay alive (CSS display toggle).
            This prevents all 8 feeds from firing queries simultaneously on page load. */}
        {visitedTabs.has('home') && (
          <div style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
            <HomeFeed shuffleKey={refreshKey} isRefreshing={isRefreshing} showFilters={showHomeFilters} pinnedPostId={pinnedPostId} />
          </div>
        )}
        {visitedTabs.has('videos') && (
          <div style={{ display: activeTab === 'videos' ? 'block' : 'none' }}>
            <VideosFeed showFilters={showVideosFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />
          </div>
        )}
        {visitedTabs.has('images') && (
          <div style={{ display: activeTab === 'images' ? 'block' : 'none' }}>
            <ImagesFeed
              showCollage={showImagesCollage}
              showFilters={showImagesFilters}
              isRefreshing={isRefreshing}
              refreshKey={refreshKey}
              selectedPostId={selectedImageId}
              onPostSelected={handleImageSelected}
              onBackToCollage={handleBackToCollage}
            />
          </div>
        )}
        {visitedTabs.has('shorts') && (
          <div style={{ display: activeTab === 'shorts' ? 'block' : 'none' }}>
            <ShortsFeed showFilters={showShortsFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />
          </div>
        )}
        {visitedTabs.has('live') && (
          <div style={{ display: activeTab === 'live' ? 'block' : 'none' }}>
            <LiveFeed key={refreshKey} isRefreshing={isRefreshing} />
          </div>
        )}
        {visitedTabs.has('music') && (
          <div style={{ display: activeTab === 'music' ? 'block' : 'none' }}>
            <MusicFeed showFilters={showMusicFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />
          </div>
        )}
        {visitedTabs.has('ppv') && (
          <div style={{ display: activeTab === 'ppv' ? 'block' : 'none' }}>
            <PPVFeed />
          </div>
        )}
        {visitedTabs.has('w2e') && (
          <div style={{ display: activeTab === 'w2e' ? 'block' : 'none' }}>
            <W2EFeed />
          </div>
        )}
        {/* end feed tabs */}
      </div>

      {/* Stages Modal */}
      <AudioSpacesModal isOpen={showStagesModal} onClose={() => setShowStagesModal(false)} />
    </div>
  );
}
