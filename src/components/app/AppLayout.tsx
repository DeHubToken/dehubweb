import React, { Suspense, useState, useEffect, useRef, useLayoutEffect, type ReactNode } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { RightSidebar } from './RightSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { GlobalDropZoneProvider, useGlobalDropZone } from '@/hooks/use-global-drop-zone';
// Direct import, NOT the '@/hooks' barrel: the barrel re-exports every hook
// (TV player, etc.), so importing it here would drag all of them — and their
// dependencies — into the eager entry bundle. This once cost 540 kB of hls.js.
import { RadioPlayerProvider } from '@/hooks/use-radio-player';
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
// Direct import, not the radio barrel — the barrel would drag the whole radio
// suite (fullscreen visualizer, station cards, …) into the always-mounted chunk.
import { RadioMiniPlayer } from '@/components/app/radio/RadioMiniPlayer';
import { StageMiniPlayer } from '@/components/app/spaces/StageMiniPlayer';
import { AudioSpacesModal } from '@/components/app/spaces/AudioSpacesModal';
import { MinimizedAIChats } from '@/components/app/MinimizedAIChats';

import { PersistentPageCache, isCachedPageRoute } from './PersistentPageCache';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { scrollDocumentTo } from '@/lib/document-scroll';
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

// The home feed is reachable at /app and at the clean feed-tab URLs
// (/videos, /shorts) — all backed by the same cached HomePage. Layout that's
// specific to the home feed (full-bleed mosaic, collapsed-mode global nav)
// must treat all of them the same.
const HOME_FEED_ROUTES = new Set(['/', '/app', '/app/', '/videos', '/shorts']);
const isHomeFeedRoute = (pathname: string | null | undefined) =>
  !!pathname && HOME_FEED_ROUTES.has(pathname);

// The post layer tracks <main>'s live box (the gap between the sidebars) via the
// CSS vars published below — the same ones the login modal centers against.
const POST_LAYER_LEFT = 'var(--app-main-left, 0px)';
const POST_LAYER_WIDTH = 'var(--app-main-width, 100%)';

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

  // Remember whether the open post was reached from the home feed, and forget it
  // as soon as the user leaves the home↔post pair. Marking the origin is what
  // decides between the overlay (home stays mounted and visible underneath) and
  // a standalone post page, so a stale marker would stack home behind posts
  // opened from a profile or a community.
  //
  // There is deliberately no scroll bookkeeping here any more. The overlay is a
  // fixed layer with its own scroller (see below), so opening a post never moves
  // the feed's scroll position and there is nothing to save or restore — the feed
  // is simply still where the user left it when the overlay closes. The old
  // save/restore pair fought the browser with three rAFs, six timeouts and a
  // MutationObserver over the whole body for a full second after every back
  // navigation, which is what made returning to the feed lurch.
  useEffect(() => {
    const currentPath = location.pathname;
    const prevPath = prevPathRef.current;
    prevPathRef.current = currentPath;

    if (isPostRoute && isHomeFeedRoute(prevPath)) {
      setCameFromHome(true);
      sessionStorage.setItem(POST_OVERLAY_ORIGIN_KEY, 'home');
      return;
    }
    if (!isPostRoute && !isHomeFeedRoute(currentPath)) {
      setCameFromHome(false);
      sessionStorage.removeItem(POST_OVERLAY_ORIGIN_KEY);
    }
  }, [location.pathname, isPostRoute]);

  // Scroll to top when navigating between cached pages (not the home feed,
  // which keeps its position). `window.scrollTo` alone is a no-op in this app —
  // body is the scrolling element — hence the shared helper.
  const prevCachedPathRef = useRef(location.pathname);
  useEffect(() => {
    const prev = prevCachedPathRef.current;
    const curr = location.pathname;
    prevCachedPathRef.current = curr;

    if (prev !== curr && isCachedPageRoute(curr) && !isHomeFeedRoute(curr)) {
      scrollDocumentTo(0);
    }
  }, [location.pathname]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  
  const navigatingFromHomeToPost = isPostRoute && isHomeFeedRoute(prevPathRef.current);
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

  // The overlay is its own scroll container, so it opens at the top by
  // construction — no scroll-to-top race, and the feed's own scroll offset is
  // never touched. Post → post (a related video, a quoted post) reuses the same
  // layer, so reset it explicitly there, before paint.
  const overlayPostId = postMatch?.params.postId ?? videoMatch?.params.tokenId ?? null;
  useLayoutEffect(() => {
    if (postOverlayRef.current) postOverlayRef.current.scrollTop = 0;
  }, [overlayPostId, showHomePagePersisted]);

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
        
         <main ref={mainRef} data-main-panel data-post-route={isPostRoute ? '' : undefined} className={cn(
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
          
          {/* Post overlay — renders on top when viewing a post from home. The
              home page's sticky tab bar peeks above it (z-110 vs z-10) and its
              toggle swaps to a back button, which is what makes the transition
              feel seamless.

              This element IS the post view — a fixed layer pinned over the middle
              column with its own scroller. That is the whole trick. An in-flow
              (or absolutely positioned) overlay shares the page scroller with the
              feed mounted underneath it, so it opened at whatever offset the feed
              happened to be at and only snapped to the top afterwards — when a
              scroll-to-top fired at all. Owning the scroll means the post is at
              its top on the first paint, and the feed's position survives
              untouched for the trip back.

              It reaches to `top-0`, under the mobile header rather than below it:
              that header is translucent glass, so whatever sits beneath shows
              through it, and while you are reading a post that has to be the post
              — starting the layer at `top-11` left the home feed's text bleeding
              through the header. The post's own clearance padding keeps its
              content below the nav pill, and scrolling slides it under the glass
              exactly like the feed does. */}
          {showHomePagePersisted && (
            <>
              {/* Backing for the post layer, deliberately a separate element from
                  the scroller: the swallow clip cuts the scroller at the nav
                  pill's top edge, and a clipped background takes its fill with
                  it — leaving the feed visible through the translucent header
                  above the pill.

                  It is needed on every theme. The home feed stays MOUNTED AND
                  VISIBLE underneath (PersistentPageCache keeps it that way so its
                  sticky tab bar holds position), and it cannot be hidden with
                  CSS: feed thumbnails carry `transition-all`, and a running CSS
                  transition outranks even an `!important` visibility:hidden, so
                  one thumbnail always survives the hide and floats over the post.

                  NO COLOUR CLASS HERE — this is load-bearing. It shipped as
                  `bg-black`, which every theme's untagged-slab safety net matches
                  on `[class*='bg-black']`; those nets are scoped under #app-root,
                  so they carry an id and beat any plain re-declaration no matter
                  how many !importants it has. That turned this element — `fixed`,
                  full height, sized to the middle column — into a full-height
                  frosted panel behind the whole dedicated post page. The colour
                  now comes from `background-color: inherit` in index.css, which
                  resolves to <main>'s own background: black on the opaque themes,
                  paper on light, transparent on every canvas theme, automatically
                  and with no per-theme rule. Nothing class-based means no net can
                  ever match it again. */}
              <div
                aria-hidden
                data-post-overlay-backdrop
                className="fixed top-0 bottom-0 z-10"
                style={{ left: POST_LAYER_LEFT, width: POST_LAYER_WIDTH }}
              />
              <div
                ref={postOverlayRef}
                data-post-overlay
                className="fixed top-0 bottom-0 z-10 overflow-y-auto overscroll-contain"
                style={{
                  left: POST_LAYER_LEFT,
                  width: POST_LAYER_WIDTH,
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <ErrorBoundary compact resetKey={location.pathname} label="Post">
                  <Suspense fallback={null}>
                    <SinglePostPage inOverlay />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </>
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
