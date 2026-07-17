import React, { Suspense, useState, useEffect, useRef, useLayoutEffect, type ReactNode } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { RightSidebar } from './RightSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { GlobalDropZoneProvider, useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { RadioPlayerProvider } from '@/hooks';
import { CoinPlacementProvider } from '@/hooks/use-coin-placement';
import { SidebarCollapseProvider, useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { AutoplayProvider } from '@/contexts/AutoplayContext';
import { AnimationsProvider } from '@/contexts/AnimationsContext';
import { ShortsEnabledProvider } from '@/contexts/ShortsEnabledContext';
import { PiPProvider } from '@/contexts/PiPContext';
import { ChartPiPProvider } from '@/contexts/ChartPiPContext';
import { FloatingPiPOverlay } from '@/components/app/tv/FloatingPiPOverlay';
import { FloatingChartPiPOverlay } from '@/components/app/charts/FloatingChartPiPOverlay';
import { UserFeedbackSurvey } from '@/components/app/UserFeedbackSurvey';
import { ShippedFeatureNotificationModal } from '@/components/app/ShippedFeatureNotificationModal';
// Lazy: the post composer is heavy (media handling) and only needed when the
// user opens it — kept out of the entry bundle, preloaded on idle below.
const PostModal = React.lazy(() =>
  import('@/features/post/PostModal').then(m => ({ default: m.PostModal }))
);
import { RadioMiniPlayer } from '@/components/app/radio';
import { StageMiniPlayer, AudioSpacesModal } from '@/components/app/spaces';
import { MinimizedAIChats } from '@/components/app/MinimizedAIChats';

import { PersistentPageCache, isCachedPageRoute } from './PersistentPageCache';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { isHomePath } from '@/lib/home-path';
import { GlobalFeedNav } from './GlobalFeedNav';
import { GlobalFeedNavProvider } from '@/contexts/GlobalFeedNavContext';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { cn } from '@/lib/utils';
// Lazy: only rendered as the post overlay when a post is opened from home —
// a whole page's worth of code that shouldn't ride in the entry bundle.
const SinglePostPage = React.lazy(() => import('@/pages/app/SinglePostPage'));


interface AppLayoutContentProps {
  children?: ReactNode;
}

// Session storage keys
const POST_OVERLAY_ORIGIN_KEY = 'post-overlay-origin';
const HOME_SCROLL_POSITION_KEY = 'home-scroll-position';

// The home feed is reachable at /app and at the clean feed-tab URLs
// (/videos, /shorts) — all backed by the same cached HomePage. Layout that's
// specific to the home feed (full-bleed mosaic, collapsed-mode global nav)
// must treat all of them the same.
const HOME_FEED_ROUTES = new Set(['/', '/app', '/app/', '/videos', '/shorts']);
const isHomeFeedRoute = (pathname: string) => HOME_FEED_ROUTES.has(pathname);

function AppLayoutContent({ children }: AppLayoutContentProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isPostModalOpen, closePostModal, pendingFiles, clearPendingFiles, initialText, clearInitialText, initialCategory, clearInitialCategory } = useGlobalDropZone();

  // PostModal mounts on first open, then stays mounted so its close animation
  // isn't cut short. Both lazy chunks (composer + post overlay) preload on
  // idle so first use doesn't wait on the network.
  const [postModalMounted, setPostModalMounted] = useState(false);
  useEffect(() => {
    if (isPostModalOpen) setPostModalMounted(true);
  }, [isPostModalOpen]);
  useEffect(() => {
    const idle = (cb: () => void) =>
      'requestIdleCallback' in window ? requestIdleCallback(cb) : setTimeout(cb, 2000);
    idle(() => {
      import('@/features/post/PostModal').catch(() => {});
      import('@/pages/app/SinglePostPage').catch(() => {});
    });
  }, []);
  const { isCollapsed } = useSidebarCollapse();
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);

  // Expose the middle panel's live bounds (the gap between the left/right
  // sidebars) as CSS vars so anything mounted outside AppLayout — the login
  // modal, login-flow toasts — can center itself in that zone instead of
  // the full viewport. ResizeObserver on <main> already catches width
  // changes from a sidebar collapse toggle, so no extra dependency is
  // needed. Vars are removed on unmount so they don't go stale on routes
  // without this layout (those fall back to viewport-wide CSS defaults).
  useLayoutEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl || typeof ResizeObserver === 'undefined') return;

    const root = document.documentElement.style;
    const updateBounds = () => {
      const rect = mainEl.getBoundingClientRect();
      root.setProperty('--app-main-left', `${rect.left}px`);
      root.setProperty('--app-main-width', `${rect.width}px`);
      root.setProperty('--app-main-center-x', `${rect.left + rect.width / 2}px`);
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(mainEl);
    window.addEventListener('resize', updateBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
      root.removeProperty('--app-main-left');
      root.removeProperty('--app-main-width');
      root.removeProperty('--app-main-center-x');
    };
  }, []);
  // Disable browser's automatic scroll restoration globally
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  // Expose sidebar collapsed state on <html> for CSS theming (e.g., minimal mode grid)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-sidebar-collapsed', isCollapsed ? 'true' : 'false');
  }, [isCollapsed]);
  
  // Track if we're on a post overlay route
  const postMatch = useMatch('/app/post/:postId');
  const videoMatch = useMatch('/app/video/:tokenId');
  const isPostRoute = !!(postMatch || videoMatch);
  
  // Detect if this post was opened from the feed (overlay mode)
  const routeState = location.state as { fromFeed?: boolean } | null;
  const isFromFeed = !!routeState?.fromFeed;
  const isOverlayPost = isPostRoute && isFromFeed;
  
  // Track if we came from home page (for overlay behavior)
  const [cameFromHome, setCameFromHome] = useState(() => {
    return sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY) === 'home';
  });
  const prevPathRef = useRef<string | null>(null);
  const savedScrollRef = useRef<number>(0);
  
  const getScrollPosition = () => {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  };
  
  const setScrollPosition = (value: number) => {
    window.scrollTo(0, value);
    document.documentElement.scrollTop = value;
    document.body.scrollTop = value;
  };
  
  // Save home scroll position continuously when on home page
  useEffect(() => {
    const isHome = isHomePath(location.pathname);
    if (!isHome) return;
    
    const saveScroll = () => {
      const scrollPos = getScrollPosition();
      sessionStorage.setItem(HOME_SCROLL_POSITION_KEY, String(scrollPos));
      savedScrollRef.current = scrollPos;
    };
    
    saveScroll();
    
    window.addEventListener('scroll', saveScroll, { passive: true });
    document.addEventListener('scroll', saveScroll, { passive: true });
    
    const handleClick = () => saveScroll();
    document.addEventListener('click', handleClick, { capture: true, passive: true });
    
    return () => {
      window.removeEventListener('scroll', saveScroll);
      document.removeEventListener('scroll', saveScroll);
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [location.pathname]);
  
  // Detect navigation from home to post
  useEffect(() => {
    const currentPath = location.pathname;
    const prevPath = prevPathRef.current;
    
    if (isPostRoute && isHomePath(prevPath)) {
      setCameFromHome(true);
      sessionStorage.setItem(POST_OVERLAY_ORIGIN_KEY, 'home');
    }
    
    prevPathRef.current = currentPath;
  }, [location.pathname, isPostRoute]);
  
  // Restore scroll position when returning to home from post overlay
  useLayoutEffect(() => {
    const isHomePage = isHomePath(location.pathname);
    const wasInPostOverlay = sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY) === 'home';
    
    if (isHomePage && wasInPostOverlay) {
      const savedScroll = sessionStorage.getItem(HOME_SCROLL_POSITION_KEY);
      const scrollValue = savedScroll ? parseInt(savedScroll, 10) : savedScrollRef.current;
      
      if (scrollValue > 0) {
        const attemptScroll = () => {
          setScrollPosition(scrollValue);
        };
        
        attemptScroll();
        
        requestAnimationFrame(() => {
          attemptScroll();
          requestAnimationFrame(attemptScroll);
        });
        
        const attempts = [16, 50, 100, 200, 400, 800];
        const timeouts = attempts.map(delay => 
          setTimeout(attemptScroll, delay)
        );
        
        const observer = new MutationObserver(attemptScroll);
        observer.observe(document.body, { childList: true, subtree: true });
        
        const cleanupTimeout = setTimeout(() => {
          observer.disconnect();
          sessionStorage.removeItem(HOME_SCROLL_POSITION_KEY);
          sessionStorage.removeItem(POST_OVERLAY_ORIGIN_KEY);
          setCameFromHome(false);
        }, 1000);
        
        return () => {
          timeouts.forEach(clearTimeout);
          clearTimeout(cleanupTimeout);
          observer.disconnect();
        };
      }
    }
  }, [location.pathname]);

  // Scroll to top when navigating between cached pages (not home overlay)
  const prevCachedPathRef = useRef(location.pathname);
  useEffect(() => {
    const prev = prevCachedPathRef.current;
    const curr = location.pathname;
    prevCachedPathRef.current = curr;
    
    if (prev !== curr && isCachedPageRoute(curr) && !isHomePath(curr)) {
      // Don't scroll to top when returning to home (handled by scroll restoration)
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  
  const navigatingFromHomeToPost = isPostRoute && isHomePath(prevPathRef.current);
  // Only persist home behind the post when navigation actually originated from home.
  // Posts opened from communities/profiles/explore must not stack home underneath.
  const cameFromHomeOverlay = sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY) === 'home';
  const showHomePagePersisted = isPostRoute && isFromFeed && (navigatingFromHomeToPost || cameFromHomeOverlay || cameFromHome);

  // Swallow the post overlay (post card + related feed) at the home nav pill's
  // top edge under the glass themes — the pill peeks above this overlay, so its
  // content must cut off there just like the home feed does. Re-attaches when
  // the overlay mounts/unmounts. No-op when no pill is visible (mobile drawer /
  // standalone post route).
  const postOverlayRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(postOverlayRef, '[data-feed-nav]', [showHomePagePersisted]);

  const isCached = isCachedPageRoute(location.pathname);
  // Dynamic routes: post overlay, single post, post info, or username profiles
  const isDynamicRoute = !isCached && !showHomePagePersisted;

  return (
    <div id="app-root" className="min-h-screen bg-black text-white overflow-x-clip" style={{ touchAction: 'manipulation', overscrollBehavior: 'none' }}>
      <div
        className="flex w-full relative min-h-screen mx-auto transition-[max-width] duration-500 ease-in-out motion-reduce:transition-none"
        style={{
          // Full-bleed width only where the mosaic uses it (home feed).
          // Other pages keep the readable 80rem cap even when collapsed,
          // so long-form content doesn't stretch across ultrawide screens.
          maxWidth: isCollapsed && (isHomeFeedRoute(location.pathname) || showHomePagePersisted) ? '100%' : '80rem',
          willChange: 'max-width',
        }}
      >
        <AppSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
        
         <main ref={mainRef} className={cn(
          "flex-1 min-h-screen pb-16 lg:pt-0 lg:pb-0 min-w-0 w-full bg-black pt-11 relative"
        )}>
          <GlobalFeedNavProvider>
            {/* Global feed nav — only shown on the home feed in collapsed mode.
                Rendered directly in <main>'s flow (no height-clamped wrapper) so
                its own `sticky top-0` pins to the viewport top and the feed
                scrolls cleanly behind its opaque bar, clipped at its bottom edge.
                A shorter sticky wrapper would bound the sticky travel and let the
                bar slide up instead of clipping. isCollapsed is desktop-only, so
                on mobile/tablet the home page's own tab bar shows instead. */}
            {(() => {
              const isHome = isHomeFeedRoute(location.pathname);
              if (isHome && isCollapsed) return <GlobalFeedNav />;
              // Directly-loaded post/video pages have no home feed mounted
              // underneath to supply the top pill, so render the shared feed nav
              // here (post variant) as their top chrome. Suppressed for the
              // from-feed overlay, which already shows the home pill above.
              if (isPostRoute && !showHomePagePersisted) return <GlobalFeedNav postPage />;
              return null;
            })()}

            {/* Persistent page cache — all visited pages stay mounted */}
            <PersistentPageCache keepHomeVisible={showHomePagePersisted} />
          </GlobalFeedNavProvider>
          
          {/* Post overlay — renders on top when viewing a post from home.
              Positioned absolutely so it visually covers the home feed content,
              while the home page's sticky top tab bar (z-50) peeks above it —
              the toggle in that bar swaps to a back button for a seamless feel. */}
          {showHomePagePersisted && (
            <div ref={postOverlayRef} data-post-overlay className="absolute top-0 left-0 right-0 min-h-screen z-10 bg-black">
              <ErrorBoundary compact resetKey={location.pathname} label="Post">
                <Suspense fallback={null}>
                  <SinglePostPage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* Dynamic routes (post pages, username profiles, etc.) use Outlet.
              These render OUTSIDE PersistentPageCache's per-page boundaries, so
              they get their own contained boundary — a throw while flicking
              through profile tabs must not white-screen the whole app, and
              resetKey=pathname lets it self-heal on the next navigation. */}
          {isDynamicRoute && (
            <ErrorBoundary compact resetKey={location.pathname}>
              {children || <Outlet />}
            </ErrorBoundary>
          )}
        </main>
        
        <RightSidebar />
      </div>
      
      <MobileBottomNav />
      
      <RadioMiniPlayer />
      <StageMiniPlayer />
      <AudioSpacesModal />
      <MinimizedAIChats />
      
      {postModalMounted && (
        <Suspense fallback={null}>
          <PostModal
            isOpen={isPostModalOpen}
            onClose={() => { closePostModal(); clearInitialText(); clearInitialCategory(); }}
            initialFiles={pendingFiles}
            onFilesProcessed={clearPendingFiles}
            initialText={initialText}
            initialCategory={initialCategory}
          />
        </Suspense>
      )}
    </div>
  );
}

interface AppLayoutProps {
  children?: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarCollapseProvider>
      <AutoplayProvider>
        <AnimationsProvider>
          <ShortsEnabledProvider>
            <PiPProvider>
              <ChartPiPProvider>
                <RadioPlayerProvider>
                  <CoinPlacementProvider>
                    <GlobalDropZoneProvider>
                      <AppLayoutContent>{children}</AppLayoutContent>
                      <FloatingPiPOverlay />
                      <FloatingChartPiPOverlay />
                      <UserFeedbackSurvey />
                      <ShippedFeatureNotificationModal />
                    </GlobalDropZoneProvider>
                  </CoinPlacementProvider>
                </RadioPlayerProvider>
              </ChartPiPProvider>
            </PiPProvider>
          </ShortsEnabledProvider>
        </AnimationsProvider>
      </AutoplayProvider>
    </SidebarCollapseProvider>
  );
}
