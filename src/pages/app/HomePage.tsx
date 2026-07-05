/**
 * Home Page
 * =========
 * Main feed page with tab-based navigation between content types.
 * Features swipe gestures for mobile navigation and pull-to-refresh.
 * Prefetches all feed tabs in background for instant switching.
 * 
 * @module pages/app/HomePage
 */

import { useState, useEffect, useRef, useCallback, useDeferredValue, memo } from 'react';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { useDragTabIndicator } from '@/hooks/use-drag-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { useSearchParams, useNavigationType, useLocation, useNavigate, useMatch } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Settings2, ArrowLeft } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useScrollDirection } from '@/hooks/use-scroll-direction';
import { setTabSwitchTime } from '@/lib/gesture-state';
import { useFeedPrefetch, clearPrefetchState } from '@/hooks/use-feed-prefetch';
import { clearPersistedFeedFilters } from '@/hooks/use-persisted-feed-filter';
import { SORT_OPTIONS } from '@/lib/feed-utils';
import { SEOHead } from '@/components/SEOHead';


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

// Memoized wrappers — prevent feed re-renders during drag tab switches.
// React.memo skips re-render when props are unchanged, so heavy feeds
// (infinite scroll lists, media cards, etc.) stay frozen during drag.
const MemoHomeFeed    = memo(HomeFeed);
const MemoVideosFeed  = memo(VideosFeed);
const MemoImagesFeed  = memo(ImagesFeed);
const MemoShortsFeed  = memo(ShortsFeed);
const MemoLiveFeed    = memo(LiveFeed);
const MemoMusicFeed   = memo(MusicFeed);
const MemoPPVFeed     = memo(PPVFeed);
const MemoW2EFeed     = memo(W2EFeed);

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
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isCollapsed } = useSidebarCollapse();
  const navVisible = useScrollDirection();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

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
  const homeIsDraggingRef = useRef(false);
  const homeFiltersRef = useRef<HTMLDivElement>(null);
  const { layerRef: homeTabLayerRef, setRef: setHomeTabRef, rect: homeTabRect, onScroll: onHomeTabScroll } = useTabIndicator(activeTab, isCollapsed, homeIsDraggingRef, 5);

  // Deferred tab value: tab indicator moves instantly, content swap is deferred
  // so heavy feeds (e.g. Videos) don't block the tab animation
  const deferredTab = useDeferredValue(activeTab);
  const [refreshKey, setRefreshKey] = useState(0);

  // Lazy mount: only mount a feed on its first visit, then keep it alive.
  // Prevents all 8 feeds from firing queries simultaneously on page load.
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([getInitialTab()]));
  // Use deferredTab so lazy-mount doesn't block the tab indicator animation
  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(deferredTab)) return prev;
      const next = new Set(prev);
      next.add(deferredTab);
      return next;
    });
  }, [deferredTab]);
  
  // Listen for tab changes from GlobalFeedNav (collapsed mode)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === HOME_STATE_STORAGE_KEY && e.newValue) {
        try {
          const { tab } = JSON.parse(e.newValue);
          if (tab && tab !== activeTab) {
            setActiveTab(tab);
          }
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [activeTab]);
  
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Detect if a post overlay is currently active on top of the persistent home
  const location = useLocation();
  const navigate = useNavigate();
  const postOverlayMatch = useMatch('/app/post/:postId');
  const videoOverlayMatch = useMatch('/app/video/:tokenId');
  const isPostOverlayActive = !!(postOverlayMatch || videoOverlayMatch) &&
    !!(location.state as any)?.fromFeed;

  const handleOverlayBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/app');
  }, [navigate]);
  
  // Filter states for each feed type
  const [showHomeFilters, setShowHomeFilters] = useState(false);
  const [showShortsFilters, setShowShortsFilters] = useState(false);
  const [showImagesCollage, setShowImagesCollage] = useState(true); // Default to collage
  const [showImagesFilters, setShowImagesFilters] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [showVideosFilters, setShowVideosFilters] = useState(false);
  const [showMusicFilters, setShowMusicFilters] = useState(false);
  const [showLiveFilters, setShowLiveFilters] = useState(false);
  // Reactively detect active filters by reading sessionStorage when filters change
  const [hasActiveFilters, setHasActiveFilters] = useState(false);

  const checkActiveFilters = useCallback(() => {
    try {
      const stored = sessionStorage.getItem('feed-filter-states');
      if (!stored) { setHasActiveFilters(false); return; }
      const all = JSON.parse(stored);
      const home = all?.home || {};
      const sort = home.sort;
      const category = home.category;
      const postType = home.postType;
      const cf = home.contentFilters;
      const active = 
        (sort && sort.value !== 'latest') ||
        (category && category !== 'all') ||
        (postType && postType !== 'all') ||
        (cf && (cf.ppv || cf.w2e || cf.locked));
      setHasActiveFilters(!!active);
    } catch { setHasActiveFilters(false); }
  }, []);

  useEffect(() => {
    checkActiveFilters();
    window.addEventListener('feed-filters-changed', checkActiveFilters);
    return () => window.removeEventListener('feed-filters-changed', checkActiveFilters);
  }, [checkActiveFilters]);

  // Save tab state to sessionStorage whenever it changes and notify GlobalFeedNav


  useEffect(() => {
    // Skip during drag — avoid synchronous I/O and global event dispatch
    // on every boundary crossing. Will save when drag ends (isDragging becomes false).
    if (homeIsDraggingRef.current) return;
    try {
      sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab: activeTab }));
      // Dispatch custom event so GlobalFeedNav updates its indicator
      window.dispatchEvent(new CustomEvent('home-tab-changed'));
    } catch {
      // Ignore storage errors
    }
  }, [activeTab]);

  /**
   * Reset all filter states.
   */
  const resetFilters = useCallback(() => {
    setShowHomeFilters(false);
    setShowShortsFilters(false);
    setShowImagesCollage(true);
    setShowImagesFilters(false);
    setSelectedImageId(null);
    setShowVideosFilters(false);
    setShowMusicFilters(false);
    setShowLiveFilters(false);
  }, []);


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

    // Invalidate feed queries so cards re-render with fresh data (or the
    // same data re-mounted) — this gives users clear visual feedback even
    // when nothing new is available.
    void queryClient.invalidateQueries({ queryKey: ['dehub-live'] });
    void queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
    void queryClient.invalidateQueries({ queryKey: ['home-feed'] });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
    
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
  }, [isRefreshing, queryClient]);
  
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
   * Handle tab click - toggle filters on same tab, switch on different tab.
   */
  const [enableHomeTransition, setEnableHomeTransition] = useState(false);

  const handleTabClick = useCallback((tabValue: string) => {
    // If a post overlay is currently covering the feed, tapping any tab should
    // dismiss the overlay and take the user back to the feed on that tab —
    // otherwise the tab change happens underneath the overlay and looks broken.
    if (isPostOverlayActive) {
      setEnableHomeTransition(true);
      setTimeout(() => setEnableHomeTransition(false), 450);
      setActiveTab(tabValue);
      resetFilters();
      navigate('/app', { replace: false });
      return;
    }
    if (tabValue === activeTab) {
      // Same tab clicked - scroll to top
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setEnableHomeTransition(true);
      // Auto-reset after animation completes to prevent stale transitions on page nav
      setTimeout(() => setEnableHomeTransition(false), 450);
      setActiveTab(tabValue);
      resetFilters();
    }
  }, [activeTab, resetFilters, isPostOverlayActive, navigate]);

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

    const handleTabReclick = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (!tab) return;
      // Toggle filters for the active tab
      if (tab === 'home') setShowHomeFilters(prev => !prev);
      else if (tab === 'live') setShowLiveFilters(prev => !prev);
      else if (tab === 'shorts') setShowShortsFilters(prev => !prev);
      else if (tab === 'images') setShowImagesFilters(prev => !prev);
      else if (tab === 'videos') setShowVideosFilters(prev => !prev);
      else if (tab === 'music') setShowMusicFilters(prev => !prev);
    };

    window.addEventListener('home-refresh', handleHomeRefresh);
    window.addEventListener('category-filter-changed', handleCategoryFilter);
    window.addEventListener('switch-home-tab', handleSwitchTab);
    window.addEventListener('home-tab-reclick', handleTabReclick);
    return () => {
      window.removeEventListener('home-refresh', handleHomeRefresh);
      window.removeEventListener('category-filter-changed', handleCategoryFilter);
      window.removeEventListener('switch-home-tab', handleSwitchTab);
      window.removeEventListener('home-tab-reclick', handleTabReclick);
    };
  }, [triggerRefresh, handleTabClick]);

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

    // Skip scroll-to-top during drag — scrolling mid-drag causes layout reflow
    // which is the biggest source of lag on the home page.
    if (homeIsDraggingRef.current) return;

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
        setActiveTab(tabValues[currentIndex + 1]);
        setTabSwitchTime(); // Mark tab switch for carousel cooldown
        resetFilters();
      } else if (isRightSwipe && currentIndex > 0) {
        setActiveTab(tabValues[currentIndex - 1]);
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
        setActiveTab(tabValues[currentIndex + 1]);
        setTabSwitchTime(); // Mark tab switch for carousel cooldown
        resetFilters();
        gestureTriggered.current = true;
      } else if (e.deltaX < 0 && currentIndex > 0) {
        setActiveTab(tabValues[currentIndex - 1]);
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
  // DRAG-TO-SWIPE for tab indicator (must be after handleTabClick & enableHomeTransition)
  // --------------------------------------------------------------------------

  const homeTabButtonPositions = useRef<Partial<Record<string, HTMLElement | null>>>({});

  const { isDragging: isHomeDragging, indicatorRef: homeIndicatorRef, handleDragStart: handleHomeDragStart, handleDragMove: handleHomeDragMove, handleDragEnd: handleHomeDragEnd } = useDragTabIndicator({
    tabRect: homeTabRect,
    tabLayerRef: homeTabLayerRef,
    tabButtonPositions: homeTabButtonPositions,
    tabValues: FEED_TABS.map(t => t.value),
    activeTab,
    onTabChange: (tab) => {
      setActiveTab(tab);
      resetFilters();
    },
    isDraggingRef: homeIsDraggingRef,
    indicatorFixedHeightPx: 35,
    shrinkWidthByPercent: 5,
    onTap: () => handleTabClick(activeTab),
    onDragEnd: () => {
      // Trigger spring transition after drag ends
      setEnableHomeTransition(true);
      setTimeout(() => setEnableHomeTransition(false), 450);
      // Now safe to persist tab + notify GlobalFeedNav
      try {
        sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab: activeTab }));
        window.dispatchEvent(new CustomEvent('home-tab-changed'));
      } catch { /* ignore */ }
      // Scroll to top for the final settled tab
      window.scrollTo(0, 0);
    },
  });


  // --------------------------------------------------------------------------
  // RENDER FEED BASED ON ACTIVE TAB
  // --------------------------------------------------------------------------

  // Feeds are rendered persistently below using CSS display toggle

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div>
      <SEOHead title="DeHub - Home Feed" description="Censorship resistant and chronological, with no shady algorithm. Your feed on DeHub — the open source, user owned social media platform." url="https://dehub.io/app" jsonLd={{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'DeHub Home Feed', url: 'https://dehub.io/app', description: 'Censorship resistant, chronological social media feed with no algorithm.', isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' } }} />
      <h1 className="sr-only">DeHub Home — Decentralised Social Media Feed, Censorship Resistant & Freedom of Speech</h1>
      {/* Tab Navigation */}
      <div
        data-home-tabs
        className={cn("sticky top-11 lg:top-0 bg-black z-[110] px-2 sm:px-3 pt-1 pb-2 sm:pt-1 sm:pb-3 lg:px-3 lg:pt-2 lg:mt-0 transition-transform duration-300 ease-in-out", isCollapsed && "lg:pl-2 lg:pr-0", isCollapsed && "lg:hidden")}
        style={{ transform: (isMobile && !navVisible && !(showHomeFilters && deferredTab === 'home')) ? 'translateY(calc(-100% - 3rem))' : 'translateY(0)', willChange: 'transform' }}
      >
        <div className="bg-zinc-900 overflow-visible rounded-xl">

          <div ref={homeTabLayerRef} className="relative overflow-visible">
            <GlassIndicator ref={homeIndicatorRef} rect={homeTabRect} borderRadius="0.75rem" layoutKey={`home-${isCollapsed}-${activeTab}`} enableTransition={!isHomeDragging && enableHomeTransition} fixedHeightPx={35} />
            {/* Drag handle overlay */}
            {homeTabRect.ready && (
              <div
                className="absolute z-30 cursor-grab active:cursor-grabbing"
                style={{
                  transform: `translate(${homeTabRect.x}px, ${homeTabRect.y}px)`,
                  width: homeTabRect.width,
                  height: homeTabRect.height,
                }}
                onPointerDown={handleHomeDragStart}
                onPointerMove={handleHomeDragMove}
                onPointerUp={handleHomeDragEnd}
                onPointerCancel={handleHomeDragEnd}
              />
            )}
            <div className="relative z-20 flex scrollbar-hide">
              {/* Settings Button - toggles current tab's filters.
                  When a post overlay is open on top of the feed, this slot becomes a back button
                  so the top nav bar feels seamless — the user never "leaves" the feed. */}
              <button
                onClick={isPostOverlayActive
                  ? handleOverlayBack
                  : () => window.dispatchEvent(new CustomEvent('home-tab-reclick', { detail: activeTab }))}
                className={cn(
                  "relative flex items-center justify-center px-3 h-[35px] rounded-xl transition-colors overflow-hidden",
                  hasActiveFilters
                    ? "text-white"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
                aria-label={isPostOverlayActive ? "Back to feed" : "Feed settings"}
              >
                {hasActiveFilters && !isPostOverlayActive && (
                  <div className="absolute inset-0 translate-y-[0.6px] lg:translate-y-[0.25px] rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]" />
                )}
                <AnimatePresence mode="wait" initial={false}>
                  {isPostOverlayActive ? (
                    <motion.div
                      key="back"
                      initial={{ rotate: -180, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 180, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="relative z-10"
                    >
                      <ArrowLeft className="w-4 h-4 text-white" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="settings"
                      initial={{ rotate: 180, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -180, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="relative z-10"
                    >
                      <Settings2 className="w-4 h-4" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>

              {FEED_TABS.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    ref={(el) => {
                      setHomeTabRef(tab.value)(el);
                      homeTabButtonPositions.current[tab.value] = el;
                    }}
                    onClick={() => handleTabClick(tab.value)}
                    aria-label={tab.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative z-40 flex-1 flex items-center justify-center px-3 sm:px-4 py-2.5 rounded-xl',
                      isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
                    )}
                  >
                    <tab.icon className="relative z-10 w-4 h-4" />
                  </button>

                );
              })}
            </div>
        </div>
        <div ref={homeFiltersRef} className="contents" />
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
            Memo wrappers prevent re-renders during drag — feeds only update when
            their own props change, not when activeTab/deferredTab changes. */}
        {visitedTabs.has('home') && (
          <div style={{ display: deferredTab === 'home' ? 'block' : 'none' }}>
            <MemoHomeFeed key={refreshKey} shuffleKey={refreshKey} isRefreshing={isRefreshing} showFilters={showHomeFilters && deferredTab === 'home'} pinnedPostId={pinnedPostId} filtersPortalRef={homeFiltersRef} />
          </div>
        )}
        {visitedTabs.has('videos') && (
          <div className={isCollapsed ? 'pt-2' : undefined} style={{ display: deferredTab === 'videos' ? 'block' : 'none' }}>
            <MemoVideosFeed showFilters={showVideosFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />
          </div>
        )}
        {visitedTabs.has('images') && (
          <div className={isCollapsed ? 'pt-2' : undefined} style={{ display: deferredTab === 'images' ? 'block' : 'none' }}>
            <MemoImagesFeed
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
          <div className={isCollapsed ? 'pt-2' : undefined} style={{ display: deferredTab === 'shorts' ? 'block' : 'none' }}>
            <MemoShortsFeed showFilters={showShortsFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />
          </div>
        )}
        {visitedTabs.has('live') && (
          <div className={isCollapsed ? 'pt-2' : undefined} style={{ display: deferredTab === 'live' ? 'block' : 'none' }}>
            <MemoLiveFeed key={refreshKey} isRefreshing={isRefreshing} showFilters={showLiveFilters} />
          </div>
        )}
        {visitedTabs.has('music') && (
          <div className={isCollapsed ? 'pt-2' : undefined} style={{ display: deferredTab === 'music' ? 'block' : 'none' }}>
            <MemoMusicFeed showFilters={showMusicFilters} isRefreshing={isRefreshing} refreshKey={refreshKey} />
          </div>
        )}
        {visitedTabs.has('ppv') && (
          <div className={isCollapsed ? 'pt-2' : undefined} style={{ display: deferredTab === 'ppv' ? 'block' : 'none' }}>
            <MemoPPVFeed />
          </div>
        )}
        {visitedTabs.has('w2e') && (
          <div className={isCollapsed ? 'pt-2' : undefined} style={{ display: deferredTab === 'w2e' ? 'block' : 'none' }}>
            <MemoW2EFeed />
          </div>
        )}
        {/* end feed tabs */}
      </div>

    </div>
  );
}
