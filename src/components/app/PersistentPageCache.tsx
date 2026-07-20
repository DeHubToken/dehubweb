/**
 * Persistent Page Cache
 * =====================
 * Mounts pages on first visit and keeps them alive via CSS visibility toggling.
 * This ensures:
 * - Sidebars never re-render (they're outside this component)
 * - Revisited pages are instant (no re-mount, no data refetch)
 * - Smooth native-feel transitions between pages
 * - Skeleton loaders on first visit while lazy components load
 */

import React, { Suspense, useState, useEffect, useRef, memo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import { preloadPriorityPages } from '@/lib/preload-priority-pages';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import HomePage from '@/pages/app/HomePage';
import {
  FeedSkeleton,
  ExploreSkeleton,
  ProfileSkeleton,
  MessagesSkeleton,
  NotificationsSkeleton,
  LeaderboardSkeleton,
  SettingsSkeleton,
  FeaturesSkeleton,
  GridSkeleton,
  GenericPageSkeleton,
} from './PageSkeletons';

// Lazy page imports with chunk-load retry
const ExplorePage = lazyWithRetry(() => import('@/pages/app/ExplorePage'));
const ProfilePage = lazyWithRetry(() => import('@/pages/app/ProfilePage'));
const NotificationsPage = lazyWithRetry(() => import('@/pages/app/NotificationsPage'));
const MessagesPage = lazyWithRetry(() => import('@/pages/app/MessagesPage'));
const LeaderboardPage = lazyWithRetry(() => import('@/pages/app/LeaderboardPage'));
const BookmarksPage = lazyWithRetry(() => import('@/pages/app/BookmarksPage'));
const SettingsPage = lazyWithRetry(() => import('@/pages/app/SettingsPage'));
const CommandCentrePage = lazyWithRetry(() => import('@/pages/app/CommandCentrePage'));
const MusicPage = lazyWithRetry(() => import('@/pages/app/MusicPage'));
const StagesPage = lazyWithRetry(() => import('@/pages/app/StagesPage'));
const TVPage = lazyWithRetry(() => import('@/pages/app/TVPage'));
const AssistantPage = lazyWithRetry(() => import('@/pages/app/AssistantPage'));
const BuyCoinsPage = lazyWithRetry(() => import('@/pages/app/BuyCoinsPage'));
const AgentsPage = lazyWithRetry(() => import('@/pages/app/AgentsPage'));
const FeaturesPage = lazyWithRetry(() => import('@/pages/app/FeaturesPage'));
const GovernancePage = lazyWithRetry(() => import('@/pages/app/GovernancePage'));
const FullWalletPage = lazyWithRetry(() => import('@/pages/app/FullWalletPage'));
const CareersPage = lazyWithRetry(() => import('@/pages/app/CareersPage'));
const GlossaryPage = lazyWithRetry(() => import('@/pages/app/GlossaryPage'));
const StakingPage = lazyWithRetry(() => import('@/pages/app/StakingPage'));
const BridgePage = lazyWithRetry(() => import('@/pages/app/BridgePage'));
const Top100CryptosPage = lazyWithRetry(() => import('@/pages/app/Top100CryptosPage'));
const CommunitiesPage = lazyWithRetry(() => import('@/pages/app/CommunitiesPage'));
const EventsPage = lazyWithRetry(() => import('@/pages/app/EventsPage'));
const StoresPage = lazyWithRetry(() => import('@/pages/app/StoresPage'));
const WorkPage = lazyWithRetry(() => import('@/pages/app/WorkPage'));
const AffiliatePage = lazyWithRetry(() => import('@/pages/app/AffiliatePage'));
const AdsPage = lazyWithRetry(() => import('@/pages/app/AdsPage'));


// Pages that get cached (mount-once, hide with CSS)
interface CachedPageConfig {
  key: string;
  path: string | string[];
  component: React.ComponentType<any> | React.LazyExoticComponent<any>;
  skeleton: React.ComponentType;
}

const CACHED_PAGES: CachedPageConfig[] = [
  // Home also serves the clean feed-tab URLs /videos and /shorts (HomePage
  // reads the path to pick the active tab), so the same cached instance backs
  // all three — no duplicate mount.
  { key: 'home', path: ['/', '/app', '/videos', '/shorts'], component: HomePage, skeleton: FeedSkeleton },
  { key: 'explore', path: ['/app/explore', '/explore'], component: ExplorePage, skeleton: ExploreSkeleton },
  { key: 'notifications', path: '/app/notifications', component: NotificationsPage, skeleton: NotificationsSkeleton },
  { key: 'messages', path: '/app/messages', component: MessagesPage, skeleton: MessagesSkeleton },
  { key: 'assistant', path: '/app/assistant', component: AssistantPage, skeleton: GenericPageSkeleton },
  { key: 'leaderboard', path: '/app/leaderboard', component: LeaderboardPage, skeleton: LeaderboardSkeleton },
  { key: 'bookmarks', path: '/app/bookmarks', component: BookmarksPage, skeleton: FeedSkeleton },
  { key: 'settings', path: '/app/settings', component: SettingsPage, skeleton: SettingsSkeleton },
  { key: 'command-centre', path: '/app/command-centre', component: CommandCentrePage, skeleton: GenericPageSkeleton },
  { key: 'wallet', path: '/app/wallet', component: FullWalletPage, skeleton: GenericPageSkeleton },
  { key: 'music', path: '/app/music', component: MusicPage, skeleton: GridSkeleton },
  { key: 'stages', path: ['/app/stages', '/stages'], component: StagesPage, skeleton: GenericPageSkeleton },
  { key: 'tv', path: '/app/tv', component: TVPage, skeleton: GridSkeleton },
  { key: 'buy', path: '/app/buy', component: BuyCoinsPage, skeleton: GenericPageSkeleton },
  { key: 'agents', path: '/app/agents', component: AgentsPage, skeleton: GenericPageSkeleton },
  { key: 'features', path: ['/app/features', '/features'], component: FeaturesPage, skeleton: FeaturesSkeleton },
  { key: 'governance', path: ['/app/governance', '/governance'], component: GovernancePage, skeleton: FeaturesSkeleton },
  { key: 'careers', path: ['/app/jobs', '/jobs'], component: CareersPage, skeleton: GenericPageSkeleton },
  { key: 'glossary', path: ['/app/glossary', '/glossary'], component: GlossaryPage, skeleton: GenericPageSkeleton },
  { key: 'stake', path: ['/app/stake', '/stake'], component: StakingPage, skeleton: GenericPageSkeleton },
  { key: 'bridge', path: '/app/bridge', component: BridgePage, skeleton: GenericPageSkeleton },
  { key: 'top-100', path: '/app/top-100', component: Top100CryptosPage, skeleton: LeaderboardSkeleton },
  { key: 'communities', path: ['/app/communities', '/communities'], component: CommunitiesPage, skeleton: GenericPageSkeleton },
  { key: 'events', path: '/app/events', component: EventsPage, skeleton: GenericPageSkeleton },
  { key: 'stores', path: '/app/stores', component: StoresPage, skeleton: GenericPageSkeleton },
  { key: 'work', path: ['/app/work', '/work'], component: WorkPage, skeleton: GenericPageSkeleton },
  { key: 'affiliate', path: ['/app/affiliate', '/affiliate'], component: AffiliatePage, skeleton: GenericPageSkeleton },
  { key: 'ads', path: '/app/ads', component: AdsPage, skeleton: GenericPageSkeleton },
  { key: 'profile', path: '/app/profile', component: ProfilePage, skeleton: ProfileSkeleton },
];

function matchesPath(config: CachedPageConfig, pathname: string): boolean {
  // Normalize trailing slashes: react-router matches "/app/" to the "/app"
  // route, but a strict === here would miss it and render a blank outlet.
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const paths = Array.isArray(config.path) ? config.path : [config.path];
  return paths.some(p => normalized === p);
}

/** Wrapper that shows skeleton on first Suspense load */
const CachedPage = memo(function CachedPage({
  config,
  isActive,
  forceVisible = false,
  resetToken,
}: {
  config: CachedPageConfig;
  isActive: boolean;
  forceVisible?: boolean;
  /** Route token that resets this page's error boundary on navigation. */
  resetToken?: unknown;
}) {
  const Component = config.component;
  const SkeletonComponent = config.skeleton;
  const { isCollapsed } = useSidebarCollapse();

  // Only animate fade-in on the very first activation, not on every revisit.
  // Skip the fade for the home page so it swaps directly from the boot/HTML
  // skeleton into the real feed without a visible cross-fade.
  const hasBeenActiveRef = useRef(false);
  const shouldAnimate = isActive && !hasBeenActiveRef.current && config.key !== 'home';

  useEffect(() => {
    if (isActive && !hasBeenActiveRef.current) {
      hasBeenActiveRef.current = true;
    }
  }, [isActive]);

  // Apply top spacing in collapsed mode for all pages except home (which handles it internally)
  const needsCollapsedSpacing = isCollapsed && isActive && config.key !== 'home';

  // When a post overlay is open on top of home, keep home visible so its sticky
  // tab bar remains at the top — this is what makes the transition feel seamless.
  const shouldStayVisible = isActive || forceVisible;

  return (
    <div
      data-cached-page={config.key}
      className={cn(shouldAnimate ? 'animate-fade-in' : '')}
      style={
        shouldStayVisible
          ? undefined
          : {
              visibility: 'hidden' as const,
              height: 0,
              overflow: 'hidden',
              position: 'absolute' as const,
              // Skip style/layout for the whole hidden subtree — with ~30
              // pages cached, this is the difference between the browser
              // laying out one page or all of them on every style change.
              contentVisibility: 'hidden' as const,
            }
      }
    >
      {/* Contained boundary: every page is mounted forever and all re-render
          together on login/theme changes, so a throw in ONE page (even a hidden
          one) must not white-screen the whole app. resetToken=pathname lets a
          transient fault self-heal on the next navigation. */}
      <ErrorBoundary compact resetKey={resetToken} label={config.key}>
        <Suspense fallback={<SkeletonComponent />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}, (prev, next) => {
  if (
    prev.config !== next.config ||
    prev.isActive !== next.isActive ||
    prev.forceVisible !== next.forceVisible
  ) {
    return false;
  }
  // resetToken is the pathname, which changes on EVERY navigation — letting it
  // through unconditionally re-renders all ~30 cached pages per nav. Hidden
  // pages ignore it; an errored hidden page still self-heals because becoming
  // active re-renders it with the fresh token, resetting its ErrorBoundary.
  const visible = next.isActive || next.forceVisible;
  return !visible || prev.resetToken === next.resetToken;
});

// Pages that should always scroll to top when navigated to
const SCROLL_TO_TOP_PAGES = new Set(['settings', 'leaderboard', 'bookmarks', 'command-centre', 'wallet']);

export function PersistentPageCache({ keepHomeVisible = false }: { keepHomeVisible?: boolean }) {
  const location = useLocation();
  const pathname = location.pathname;

  // Track which pages have been visited (mount on first visit, keep forever)
  const [mountedPages, setMountedPages] = useState<Set<string>>(() => new Set());

  // Background-preload priority page chunks after initial render
  useEffect(() => {
    preloadPriorityPages();
  }, []);

  // Find which cached page matches current path
  const activeCachedPage = CACHED_PAGES.find(p => matchesPath(p, pathname));

  // Mount the active page if not yet mounted
  useEffect(() => {
    if (activeCachedPage && !mountedPages.has(activeCachedPage.key)) {
      setMountedPages(prev => new Set(prev).add(activeCachedPage.key));
    }
  }, [activeCachedPage?.key]);

  // Ensure home remains mounted when showing a post/video overlay above it
  useEffect(() => {
    if (keepHomeVisible && !mountedPages.has('home')) {
      setMountedPages(prev => new Set(prev).add('home'));
    }
  }, [keepHomeVisible, mountedPages]);

  // Scroll to top for specific pages when they become active
  useEffect(() => {
    if (activeCachedPage && SCROLL_TO_TOP_PAGES.has(activeCachedPage.key)) {
      window.scrollTo(0, 0);
    }
  }, [activeCachedPage?.key]);

  // Is current route a cached page or a dynamic route (post, video, profile)?
  const isCachedRoute = !!activeCachedPage;

  return (
    <>
      {/* Render all mounted cached pages — active one visible, others hidden */}
      {CACHED_PAGES.filter(p => mountedPages.has(p.key)).map(config => {
        // Home stays mounted (state preserved) but hidden when a post overlay is shown above it —
        // except when `keepHomeVisible` is set, in which case we keep home visible so its
        // sticky top nav bar remains anchored to the top during the overlay.
        const isActive = matchesPath(config, pathname);
        const forceVisible = config.key === 'home' && keepHomeVisible;

        return (
          <CachedPage
            key={config.key}
            config={config}
            isActive={isActive}
            forceVisible={forceVisible}
            resetToken={pathname}
          />
        );
      })}

      {/* If current route is NOT a cached page, it's a dynamic route — render via flag */}
      {!isCachedRoute && (
        <div className="animate-fade-in" data-page="dynamic">
          {/* Dynamic routes are handled by the Outlet in AppLayout */}
        </div>
      )}
    </>
  );
}

/** Check if a pathname matches any cached page */
export function isCachedPageRoute(pathname: string): boolean {
  return CACHED_PAGES.some(p => matchesPath(p, pathname));
}
