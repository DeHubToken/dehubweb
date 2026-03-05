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
import { useLocation, useParams, useMatch } from 'react-router-dom';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
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
const HomePage = lazyWithRetry(() => import('@/pages/app/HomePage'));
const ExplorePage = lazyWithRetry(() => import('@/pages/app/ExplorePage'));
const ProfilePage = lazyWithRetry(() => import('@/pages/app/ProfilePage'));
const NotificationsPage = lazyWithRetry(() => import('@/pages/app/NotificationsPage'));
const MessagesPage = lazyWithRetry(() => import('@/pages/app/MessagesPage'));
const LeaderboardPage = lazyWithRetry(() => import('@/pages/app/LeaderboardPage'));
const BookmarksPage = lazyWithRetry(() => import('@/pages/app/BookmarksPage'));
const SettingsPage = lazyWithRetry(() => import('@/pages/app/SettingsPage'));
const CommandCentrePage = lazyWithRetry(() => import('@/pages/app/CommandCentrePage'));
const MusicPage = lazyWithRetry(() => import('@/pages/app/MusicPage'));
const TVPage = lazyWithRetry(() => import('@/pages/app/TVPage'));
const AssistantPage = lazyWithRetry(() => import('@/pages/app/AssistantPage'));
const BuyCoinsPage = lazyWithRetry(() => import('@/pages/app/BuyCoinsPage'));
const AgentsPage = lazyWithRetry(() => import('@/pages/app/AgentsPage'));
const FeaturesPage = lazyWithRetry(() => import('@/pages/app/FeaturesPage'));
const GovernancePage = lazyWithRetry(() => import('@/pages/app/GovernancePage'));
const FullWalletPage = lazyWithRetry(() => import('@/pages/app/FullWalletPage'));
const CareersPage = lazyWithRetry(() => import('@/pages/app/CareersPage'));
const StakingPage = lazyWithRetry(() => import('@/pages/app/StakingPage'));

// Pages that get cached (mount-once, hide with CSS)
interface CachedPageConfig {
  key: string;
  path: string | string[];
  component: React.LazyExoticComponent<any>;
  skeleton: React.ComponentType;
}

const CACHED_PAGES: CachedPageConfig[] = [
  { key: 'home', path: '/app', component: HomePage, skeleton: FeedSkeleton },
  { key: 'explore', path: '/app/explore', component: ExplorePage, skeleton: ExploreSkeleton },
  { key: 'notifications', path: '/app/notifications', component: NotificationsPage, skeleton: NotificationsSkeleton },
  { key: 'messages', path: '/app/messages', component: MessagesPage, skeleton: MessagesSkeleton },
  { key: 'assistant', path: '/app/assistant', component: AssistantPage, skeleton: GenericPageSkeleton },
  { key: 'leaderboard', path: '/app/leaderboard', component: LeaderboardPage, skeleton: LeaderboardSkeleton },
  { key: 'bookmarks', path: '/app/bookmarks', component: BookmarksPage, skeleton: FeedSkeleton },
  { key: 'settings', path: '/app/settings', component: SettingsPage, skeleton: SettingsSkeleton },
  { key: 'command-centre', path: '/app/command-centre', component: CommandCentrePage, skeleton: GenericPageSkeleton },
  { key: 'wallet', path: '/app/wallet', component: FullWalletPage, skeleton: GenericPageSkeleton },
  { key: 'music', path: '/app/music', component: MusicPage, skeleton: GridSkeleton },
  { key: 'tv', path: '/app/tv', component: TVPage, skeleton: GridSkeleton },
  { key: 'buy', path: '/app/buy', component: BuyCoinsPage, skeleton: GenericPageSkeleton },
  { key: 'agents', path: '/app/agents', component: AgentsPage, skeleton: GenericPageSkeleton },
  { key: 'features', path: ['/app/features', '/features'], component: FeaturesPage, skeleton: FeaturesSkeleton },
  { key: 'governance', path: ['/app/governance', '/governance'], component: GovernancePage, skeleton: FeaturesSkeleton },
  { key: 'careers', path: ['/app/jobs', '/jobs'], component: CareersPage, skeleton: GenericPageSkeleton },
  { key: 'stake', path: ['/app/stake', '/stake'], component: StakingPage, skeleton: GenericPageSkeleton },
  { key: 'profile', path: '/app/profile', component: ProfilePage, skeleton: ProfileSkeleton },
];

function matchesPath(config: CachedPageConfig, pathname: string): boolean {
  const paths = Array.isArray(config.path) ? config.path : [config.path];
  return paths.some(p => pathname === p);
}

/** Wrapper that shows skeleton on first Suspense load */
const CachedPage = memo(function CachedPage({
  config,
  isActive,
}: {
  config: CachedPageConfig;
  isActive: boolean;
}) {
  const Component = config.component;
  const SkeletonComponent = config.skeleton;
  const { isCollapsed } = useSidebarCollapse();

  // Apply top spacing in collapsed mode for all pages except home (which handles it internally)
  const needsCollapsedSpacing = isCollapsed && isActive && config.key !== 'home';

  return (
    <div
      className={cn(isActive ? 'animate-fade-in' : '')}
      style={
        isActive
          ? undefined
          : {
              visibility: 'hidden' as const,
              height: 0,
              overflow: 'hidden',
              position: 'absolute' as const,
            }
      }
    >
      <Suspense fallback={<SkeletonComponent />}>
        <Component />
      </Suspense>
    </div>
  );
});

export function PersistentPageCache() {
  const location = useLocation();
  const pathname = location.pathname;

  // Track which pages have been visited (mount on first visit, keep forever)
  const [mountedPages, setMountedPages] = useState<Set<string>>(() => new Set());

  // Detect if we're on a mobile profile route (drawer overlays feed)
  const profileMatch = useMatch('/app/:username');
  const postMatch = useMatch('/app/post/:postId');
  const videoMatch = useMatch('/app/video/:tokenId');
  const postInfoMatch = useMatch('/app/post/:postId/info');
  const govMatch = useMatch('/app/governance/:proposalId');
  const isMobileProfileOverlay = !!profileMatch && !postMatch && !videoMatch && !postInfoMatch && !govMatch && !isCachedPageRoute(pathname);
  
  // Track the last cached page so we can keep it visible under the drawer
  const lastCachedPageRef = useRef<string>('/app');
  
  // Find which cached page matches current path
  const activeCachedPage = CACHED_PAGES.find(p => matchesPath(p, pathname));
  
  // Update last cached page ref when on a cached route
  useEffect(() => {
    if (activeCachedPage) {
      lastCachedPageRef.current = pathname;
    }
  }, [activeCachedPage, pathname]);

  // Mount the active page if not yet mounted
  useEffect(() => {
    if (activeCachedPage && !mountedPages.has(activeCachedPage.key)) {
      setMountedPages(prev => new Set(prev).add(activeCachedPage.key));
    }
  }, [activeCachedPage?.key]);

  // Is current route a cached page or a dynamic route (post, video, profile)?
  const isCachedRoute = !!activeCachedPage;

  return (
    <>
      {/* Render all mounted cached pages — active one visible, others hidden */}
      {CACHED_PAGES.filter(p => mountedPages.has(p.key)).map(config => {
        // On mobile profile overlay, keep the last cached page visible underneath
        const isDirectlyActive = matchesPath(config, pathname);
        const isActiveUnderDrawer = isMobileProfileOverlay && matchesPath(config, lastCachedPageRef.current);
        const isActive = isDirectlyActive || isActiveUnderDrawer;
        
        return (
          <CachedPage
            key={config.key}
            config={config}
            isActive={isActive}
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
