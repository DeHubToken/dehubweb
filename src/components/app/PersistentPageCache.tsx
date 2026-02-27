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

// Lazy page imports
const HomePage = React.lazy(() => import('@/pages/app/HomePage'));
const ExplorePage = React.lazy(() => import('@/pages/app/ExplorePage'));
const ProfilePage = React.lazy(() => import('@/pages/app/ProfilePage'));
const NotificationsPage = React.lazy(() => import('@/pages/app/NotificationsPage'));
const MessagesPage = React.lazy(() => import('@/pages/app/MessagesPage'));
const LeaderboardPage = React.lazy(() => import('@/pages/app/LeaderboardPage'));
const BookmarksPage = React.lazy(() => import('@/pages/app/BookmarksPage'));
const SettingsPage = React.lazy(() => import('@/pages/app/SettingsPage'));
const CommandCentrePage = React.lazy(() => import('@/pages/app/CommandCentrePage'));
const MusicPage = React.lazy(() => import('@/pages/app/MusicPage'));
const TVPage = React.lazy(() => import('@/pages/app/TVPage'));
const AssistantPage = React.lazy(() => import('@/pages/app/AssistantPage'));
const BuyCoinsPage = React.lazy(() => import('@/pages/app/BuyCoinsPage'));
const AgentsPage = React.lazy(() => import('@/pages/app/AgentsPage'));
const FeaturesPage = React.lazy(() => import('@/pages/app/FeaturesPage'));
const FullWalletPage = React.lazy(() => import('@/pages/app/FullWalletPage'));
const CareersPage = React.lazy(() => import('@/pages/app/CareersPage'));

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
  { key: 'careers', path: ['/app/jobs', '/jobs'], component: CareersPage, skeleton: GenericPageSkeleton },
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
      className={cn(isActive ? 'animate-fade-in' : '', needsCollapsedSpacing && 'pt-2')}
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

  // Find which cached page matches current path
  const activeCachedPage = CACHED_PAGES.find(p => matchesPath(p, pathname));

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
      {CACHED_PAGES.filter(p => mountedPages.has(p.key)).map(config => (
        <CachedPage
          key={config.key}
          config={config}
          isActive={matchesPath(config, pathname)}
        />
      ))}

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
