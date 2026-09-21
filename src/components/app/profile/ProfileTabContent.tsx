import { BrandIcon } from '@/components/app/war/WarHudIcon';
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Repeat2 } from 'lucide-react';
import { Loader2, Plus, MessageCircle, Heart, ArrowUpRight, ThumbsUp, ThumbsDown, MessageSquare, Share2, Bookmark, Info, Image, Pencil, Trash2, Pin, ListVideo, ChevronLeft } from 'lucide-react';
import { useInfiniteQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { PostMetadata } from '@/components/app/cards/PostMetadata';
import { renderTextWithLinks } from '@/components/app/TranslatableText';

import { PostCard } from '@/components/app/cards/PostCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { PlanCard } from '@/components/app/subscriptions';
import { ProfileEmptyState } from '@/components/app/profile/ProfileEmptyState';
import { AppState } from '@/components/app/AppState';
import { ProfileImageGrid } from '@/components/app/profile/ProfileImageGrid';
import { getUserComments, getNFTInfo, getMediaUrl, editComment, deleteComment } from '@/lib/api/dehub';
import type { DeHubNFT } from '@/lib/api/dehub';
import { useUserPins } from '@/hooks/use-pins';
import { usePublicPlaylists, usePublicPlaylistItems } from '@/hooks/use-bookmark-folders';
import type { PublicPlaylist } from '@/lib/api/dehub';
import { buildImageUrl, buildFeedImageUrls, buildAvatarUrl, extractAvatarPath, buildVideoUrl } from '@/lib/media-url';
import { formatTimeAgo, formatViews } from '@/lib/feed-utils';
import { resolveViewCount } from '@/lib/engagement';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';
import type { OptimisticPost } from '@/hooks/use-optimistic-posts';
import { isPlanPublished } from '@/lib/api/dehub';
import type { SubscriptionPlan } from '@/lib/api/dehub';
import type { ProfileData } from '@/hooks/use-dehub-profile';
import type { TabValue } from './ProfileConstants';
import type { UserCommentItem, UserCommentParent } from '@/lib/api/dehub/users';
import { mapToTextPost, type UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { QuotedPostMedia } from '@/components/app/cards/QuotedPostEmbed';

import { ProfileFractionsPanel } from '@/components/app/fractions/ProfileFractionsPanel';
import live3dIcon from '@/assets/icons/live-3d-icon.png';
import audio3dIcon from '@/assets/icons/audio-3d-icon.png';
import subs3dIcon from '@/assets/icons/subs-3d-icon.png';
import star3dIcon from '@/assets/icons/star-3d-icon.png';
import filmstrip3dIcon from '@/assets/icons/filmstrip-3d-icon.png';
import imageFrame3dIcon from '@/assets/icons/image-frame-3d-icon.png';
import lock3dIcon from '@/assets/lock-3d.png';
import home3dIcon from '@/assets/icons/home-3d-icon.png';
import comment3dIcon from '@/assets/icons/comment-3d-icon.png';

/** Empty-state copy when the channel toolbar's sort/search is what emptied the tab. */
const NO_MATCHES_COPY = {
  title: 'Nothing matches',
  subtitle: 'Try a different search, or clear it to see everything',
} as const;

// Height estimates for off-screen cards so content-visibility can reserve
// scroll space without measuring — mirrors the home feed (HomeFeed.tsx).
const CV_INTRINSIC = { post: '320px', image: '640px', video: '520px' } as const;

/**
 * Off-screen cards (index >= 3) get `content-visibility: auto` so the browser
 * skips their layout + paint until they're near the viewport. This is what
 * keeps a profile with hundreds of posts scrolling smoothly instead of
 * freezing while every mounted card re-lays-out on each scroll/append. The
 * first few cards stay eager for an instant first paint. Same technique the
 * home feed already uses.
 */
function offscreenCardStyle(type: 'post' | 'image' | 'video', index: number): React.CSSProperties | undefined {
  if (index < 3) return undefined;
  // `auto` keyword: after a card renders once, the browser remembers its real
  // size and reuses that as the placeholder when it's skipped again — so a card
  // never collapses to a wrong fixed estimate and shifts the feed on scroll.
  return { contentVisibility: 'auto', containIntrinsicSize: `auto 0 auto ${CV_INTRINSIC[type]}` };
}

// Lazy tab panel: keeps visited panels mounted (hidden) so switching back is
// instant. Must live at module scope — the previous version was defined
// inside the component with useCallback([activeTab]), which minted a new
// component type on every tab switch and forced React to unmount and remount
// every panel's whole subtree each time (re-running effects, re-decoding
// images) — the tabs felt dead on slow devices/networks because of it.
/**
 * Infinite-scroll sentinel — loads the next content page when it nears the
 * viewport. Replaces the old auto-cascade that downloaded a user's ENTIRE
 * content history on profile open.
 */
function LoadMoreSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage }: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
  stateRef.current = { hasNextPage, isFetchingNextPage, fetchNextPage };

  // The div must ALWAYS be mounted and the observer re-armed whenever
  // hasNextPage/isFetchingNextPage change: observe() fires an initial
  // callback, which covers the "sentinel already in viewport" case (short
  // first page, or a fetch completing while the sentinel is visible).
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      const s = stateRef.current;
      if (entries[0].isIntersecting && s.hasNextPage && !s.isFetchingNextPage) {
        s.fetchNextPage();
      }
    }, { rootMargin: '800px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage]);

  return (
    <div ref={ref} className={isFetchingNextPage ? 'flex justify-center py-4' : 'h-px'}>
      {isFetchingNextPage && <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />}
    </div>
  );
}

function TabPanel({ tab, activeTab, visitedTabs, children }: {
  tab: TabValue;
  activeTab: TabValue;
  visitedTabs: Set<TabValue>;
  children: React.ReactNode;
}) {
  const isActive = activeTab === tab;
  if (!isActive && !visitedTabs.has(tab)) return null;
  return (
    <div
      style={isActive ? undefined : { visibility: 'hidden', height: 0, overflow: 'hidden', position: 'absolute', width: '100%' }}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  );
}

interface ProfileTabContentProps {
  activeTab: TabValue;
  profileAddress: string;
  // Content arrays
  ALL_CONTENT: Array<{ type: 'post' | 'image' | 'video'; data: TextPost | ImagePost | VideoItem; createdAt: string; isRepost?: boolean }>;
  PROFILE_POSTS: TextPost[];
  PROFILE_IMAGES: ImagePost[];
  ALL_PROFILE_VIDEOS: VideoItem[];
  PROFILE_LIVE: VideoItem[];
  // Loading
  isLoadingContent: boolean;
  userContentData: unknown;
  // Content pagination (on-scroll loading)
  hasNextContentPage?: boolean;
  isFetchingNextContentPage?: boolean;
  fetchNextContentPage?: () => void;
  // Privacy
  isTargetPrivate: boolean;
  isFollowing: boolean;
  isPending: boolean;
  isViewingOwnProfile: boolean | undefined;
  /** A sort or search from the channel toolbar is narrowing what's shown. */
  isContentFiltered?: boolean;
  // Optimistic
  optimisticPosts: OptimisticPost[];
  // Subscriptions
  isLoadingPlans: boolean;
  hasPlans: boolean;
  plans: SubscriptionPlan[];
  isSubscribed: boolean;
  profile: ProfileData | undefined;
  // Actions
  setCreatePlanModalOpen: (open: boolean) => void;
  setEditingPlan: (plan: SubscriptionPlan | null) => void;
}

export function ProfileTabContent({
  activeTab,
  profileAddress,
  ALL_CONTENT,
  PROFILE_POSTS,
  PROFILE_IMAGES,
  ALL_PROFILE_VIDEOS,
  PROFILE_LIVE,
  isLoadingContent,
  userContentData,
  hasNextContentPage = false,
  isFetchingNextContentPage = false,
  fetchNextContentPage,
  isTargetPrivate,
  isFollowing,
  isPending,
  isViewingOwnProfile,
  isContentFiltered = false,
  optimisticPosts,
  isLoadingPlans,
  hasPlans,
  plans,
  isSubscribed,
  profile,
  setCreatePlanModalOpen,
  setEditingPlan,
}: ProfileTabContentProps) {
  const navigate = useNavigate();

  // Track which tabs have been visited so we only mount them once accessed
  const visitedTabs = useRef(new Set<TabValue>([activeTab]));
  visitedTabs.current.add(activeTab);

  // Fetch user comments/replies — only once the Posts tab is actually opened.
  // (This used to fire eagerly on every profile view, plus a getNFTInfo call
  // per commented post, even when the visitor never touched the Posts tab.)
  const {
    data: commentsData,
    isLoading: isLoadingComments,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['user-comments', profileAddress],
    queryFn: ({ pageParam = 1 }) => getUserComments(profileAddress, pageParam, 20),
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: !!profileAddress && visitedTabs.current.has('posts'),
    staleTime: 2 * 60 * 1000,
  });

  const allComments = commentsData?.pages.flatMap(p => p.data) ?? [];

  // Private account gate - shown instead of all tabs
  if (isTargetPrivate && !isFollowing && !isViewingOwnProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BrandIcon src={lock3dIcon} alt="Private" className="w-[80px] h-[80px] object-contain mb-4" />
        <p className="text-white text-lg font-semibold">This account is private</p>
        <p className="text-zinc-500 text-sm mt-1 max-w-xs">
          {isPending 
            ? 'Your follow request is pending approval.'
            : 'Follow this account to see their posts and content.'}
        </p>
      </div>
    );
  }
  
  const hasData = userContentData && (userContentData as any).pages && (userContentData as any).pages.length > 0;
  const showLoading = isLoadingContent && !hasData;

  return (
    <div style={{ position: 'relative' }}>
      {/* Loading overlay for content tabs on first load */}
      {showLoading && ['home', 'posts', 'images', 'videos'].includes(activeTab) && (
        <div className="flex flex-col items-center justify-center min-h-[200px]">
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
        </div>
      )}

      {/* HOME TAB */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="home">
        <HomeTabPanel
          ALL_CONTENT={ALL_CONTENT}
          isViewingOwnProfile={isViewingOwnProfile}
          optimisticPosts={optimisticPosts}
          isLoading={showLoading}
          isContentFiltered={isContentFiltered}
        />
      </TabPanel>

      {/* POSTS TAB */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="posts">
        <PostsTabPanel
          PROFILE_POSTS={PROFILE_POSTS}
          allComments={isContentFiltered ? [] : allComments}
          isContentFiltered={isContentFiltered}
          isLoadingComments={isLoadingComments}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          navigate={navigate}
          isViewingOwnProfile={isViewingOwnProfile}
          profileAddress={profileAddress}
          isLoadingContent={showLoading}
        />
      </TabPanel>

      {/* IMAGES TAB */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="images">
        {showLoading ? null : PROFILE_IMAGES.length === 0 ? (
          isContentFiltered
            ? <ProfileEmptyState iconSrc={imageFrame3dIcon} iconAlt="Images" {...NO_MATCHES_COPY} />
            : <ProfileEmptyState iconSrc={imageFrame3dIcon} iconAlt="Images" title="No images yet" subtitle="Image posts will appear here" />
        ) : PROFILE_IMAGES.length >= 4 ? (
          <ProfileImageGrid images={PROFILE_IMAGES} />
        ) : (
          <div className="space-y-3">
            {PROFILE_IMAGES.map((image) => (
              <div key={image.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
                <ImageCard post={image} />
              </div>
            ))}
          </div>
        )}
      </TabPanel>

      {/* VIDEOS TAB */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="videos">
        {showLoading ? null : ALL_PROFILE_VIDEOS.length === 0 ? (
          isContentFiltered
            ? <ProfileEmptyState iconSrc={filmstrip3dIcon} iconAlt="Videos" {...NO_MATCHES_COPY} />
            : <ProfileEmptyState iconSrc={filmstrip3dIcon} iconAlt="Videos" title="No videos yet" subtitle="Video posts will appear here" />
        ) : (
          <div className="space-y-3">
            {ALL_PROFILE_VIDEOS.map((video, index) => (
              <div
                key={video.id}
                className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3"
                style={offscreenCardStyle('video', index)}
              >
                <VideoCard video={video} aboveFold={index < 3} />
              </div>
            ))}
          </div>
        )}
      </TabPanel>

      {/* SUBSCRIBERS TAB */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="subscribers">
        <SubscribersTabPanel
          isLoadingPlans={isLoadingPlans}
          isViewingOwnProfile={isViewingOwnProfile}
          hasPlans={hasPlans}
          plans={plans}
          isSubscribed={isSubscribed}
          profile={profile}
          setCreatePlanModalOpen={setCreatePlanModalOpen}
          setEditingPlan={setEditingPlan}
        />
      </TabPanel>

      {/* SONGS TAB */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="songs">
        <ProfileEmptyState iconSrc={audio3dIcon} iconAlt="Audio" title="No audio yet" subtitle="Audio tracks will appear here" />
      </TabPanel>

      {/* LIVE TAB */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="live">
        {showLoading ? null : PROFILE_LIVE.length === 0 ? (
          <ProfileEmptyState iconSrc={live3dIcon} iconAlt="Live" title="No live streams yet" subtitle="Live content will appear here" />
        ) : (
          <div className="space-y-3">
            {PROFILE_LIVE.map((stream, index) => (
              <div key={stream.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3" style={offscreenCardStyle('video', index)}>
                <VideoCard video={stream} aboveFold={index < 3} />
              </div>
            ))}
          </div>
        )}
      </TabPanel>

      {/* FRACTIONS TAB */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="fractions">
        <ProfileFractionsPanel profileAddress={profileAddress} />
      </TabPanel>

      {/* PINNED TAB (#17) */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="pinned">
        <PinnedTabPanel profileAddress={profileAddress} />
      </TabPanel>

      {/* PLAYLISTS TAB — the profile's public bookmark folders */}
      <TabPanel activeTab={activeTab} visitedTabs={visitedTabs.current} tab="playlists">
        <PlaylistsTabPanel profileAddress={profileAddress} isOwnProfile={!!isViewingOwnProfile} />
      </TabPanel>

      {/* On-scroll loading for content-backed tabs */}
      {fetchNextContentPage && ['home', 'posts', 'images', 'videos', 'live'].includes(activeTab) && (
        <LoadMoreSentinel
          hasNextPage={hasNextContentPage}
          isFetchingNextPage={isFetchingNextContentPage}
          fetchNextPage={fetchNextContentPage}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-panel components (extracted from switch cases)
// ============================================================================

function HomeTabPanel({
  ALL_CONTENT,
  isViewingOwnProfile,
  optimisticPosts,
  isLoading,
  isContentFiltered = false,
}: {
  ALL_CONTENT: Array<{ type: 'post' | 'image' | 'video'; data: TextPost | ImagePost | VideoItem; createdAt: string; isRepost?: boolean }>;
  isViewingOwnProfile: boolean | undefined;
  optimisticPosts: OptimisticPost[];
  isLoading: boolean;
  isContentFiltered?: boolean;
}) {
  const hasOptimisticPosts = isViewingOwnProfile && optimisticPosts.length > 0;

  if (ALL_CONTENT.length === 0 && !hasOptimisticPosts) {
    if (isLoading) return null;
    return isContentFiltered
      ? <ProfileEmptyState iconSrc={home3dIcon} iconAlt="All" iconClassName="opacity-90" {...NO_MATCHES_COPY} />
      : <ProfileEmptyState iconSrc={home3dIcon} iconAlt="All" iconClassName="opacity-90" title="No posts yet" subtitle="Content will appear here when posted" />;
  }
  
  const filteredOptimisticPosts = isViewingOwnProfile 
    ? optimisticPosts.filter((op) => {
        // With real token IDs, just check if any feed item has the same ID
        return !ALL_CONTENT.some((apiItem) => apiItem.data.id === op.id);
      })
    : [];
  
  return (
    <div className="space-y-3">
      {filteredOptimisticPosts.map((op) => {
        const card = op.type === 'post'
          ? <PostCard key={op.id} post={op.data as TextPost} />
          : op.type === 'image'
          ? <ImageCard key={op.id} post={op.data as ImagePost} />
          : <VideoCard key={op.id} video={op.data as VideoItem} />;
        return (
          <div key={op.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
            {card}
          </div>
        );
      })}
      {ALL_CONTENT.map((item, index) => {
        const aboveFold = index < 3;
        const card = item.type === 'post'
          ? <PostCard key={item.data.id} post={item.data as TextPost} />
          : item.type === 'image'
          ? <ImageCard key={item.data.id} post={item.data as ImagePost} aboveFold={aboveFold} />
          : <VideoCard key={item.data.id} video={item.data as VideoItem} aboveFold={aboveFold} />;
        return (
          <div
            key={item.data.id}
            className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3"
            style={offscreenCardStyle(item.type, index)}
          >
            {item.isRepost && (
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-2 pl-1">
                <Repeat2 className="w-3.5 h-3.5" />
                <span className="font-medium">Reposted</span>
              </div>
            )}
            {card}
          </div>
        );
      })}
    </div>
  );
}

function PostsTabPanel({
  PROFILE_POSTS,
  allComments,
  isLoadingComments,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  navigate,
  isViewingOwnProfile,
  profileAddress,
  isLoadingContent,
  isContentFiltered = false,
}: {
  PROFILE_POSTS: TextPost[];
  allComments: UserCommentItem[];
  isLoadingComments: boolean;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  navigate: (to: string) => void;
  isViewingOwnProfile: boolean | undefined;
  profileAddress: string;
  isLoadingContent: boolean;
  isContentFiltered?: boolean;
}) {
  const { t } = useTranslation();
  // Collect unique tokenIds from comments to batch-fetch parent posts
  const uniqueTokenIds = React.useMemo(() => {
    const ids = new Set<string>();
    allComments.forEach(c => {
      if (c.tokenId) ids.add(String(c.tokenId));
    });
    return Array.from(ids);
  }, [allComments]);

  // Batch fetch parent post info for all unique tokenIds
  const parentPostQueries = useQueries({
    queries: uniqueTokenIds.map(tokenId => ({
      queryKey: ['nft-info', tokenId],
      queryFn: () => getNFTInfo(tokenId),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  // Build a map of tokenId -> DeHubNFT
  const parentPostsMap = React.useMemo(() => {
    const map: Record<string, DeHubNFT> = {};
    uniqueTokenIds.forEach((tokenId, i) => {
      const data = parentPostQueries[i]?.data;
      if (data) map[tokenId] = data;
    });
    return map;
  }, [uniqueTokenIds, parentPostQueries]);

  // Posts that could not be fetched (deleted, hidden, request failed) — the
  // card shows "unavailable" for these rather than a skeleton that never ends.
  const failedParentPosts = React.useMemo(() => {
    const failed = new Set<string>();
    uniqueTokenIds.forEach((tokenId, i) => {
      if (parentPostQueries[i]?.isError) failed.add(tokenId);
    });
    return failed;
  }, [uniqueTokenIds, parentPostQueries]);

  const mergedItems = React.useMemo(() => {
    const items: Array<{ type: 'post' | 'comment'; data: TextPost | UserCommentItem; createdAt: string }> = [
      ...PROFILE_POSTS.map(p => ({ type: 'post' as const, data: p, createdAt: p.createdAt || '' })),
      ...allComments.map(c => ({ type: 'comment' as const, data: c, createdAt: c.createdAt || '' })),
    ];
    // Under a toolbar sort or search the posts arrive already ordered by the
    // server (and comments are excluded — they are not this creator's posts,
    // and "most viewed" means nothing for a reply), so leave the order alone.
    if (isContentFiltered) return items;
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  }, [PROFILE_POSTS, allComments, isContentFiltered]);

  const isLoadingAll = isLoadingComments && allComments.length === 0;

  if (mergedItems.length === 0 && !isLoadingAll && !isLoadingContent) {
    return isContentFiltered
      ? <ProfileEmptyState iconSrc={comment3dIcon} iconAlt="Posts" iconClassName="opacity-90" {...NO_MATCHES_COPY} />
      : <ProfileEmptyState iconSrc={comment3dIcon} iconAlt="Posts" iconClassName="opacity-90" title="No posts, comments, or replies yet" subtitle="They will appear here" />;
  }

  return (
    <div className="space-y-3">
      {mergedItems.map((item, index) => {
        const cvStyle = offscreenCardStyle('post', index);
        if (item.type === 'post') {
          return (
            <div key={item.data.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3" style={cvStyle}>
              <PostCard post={item.data as TextPost} />
            </div>
          );
        }
        const comment = item.data as UserCommentItem;
        const parentPost = comment.tokenId ? parentPostsMap[String(comment.tokenId)] : undefined;
        return (
          <div key={comment.id} style={cvStyle}>
            <CommentCard
              comment={comment}
              parentPost={parentPost}
              parentPostFailed={!!comment.tokenId && failedParentPosts.has(String(comment.tokenId))}
              isOwnComment={!!isViewingOwnProfile}
              onClick={() => {
                if (comment.tokenId) {
                  navigate(`/app/post/${comment.tokenId}?comment=${comment.id}`);
                }
              }}
            />
          </div>
        );
      })}
      {isLoadingAll && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      )}
      {hasNextPage && (
        <div className="flex justify-center py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-muted-foreground hover:text-foreground"
          >
            {isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {isFetchingNextPage ? t('common.loadingMore') : t('common.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

function SubscribersTabPanel({
  isLoadingPlans,
  isViewingOwnProfile,
  hasPlans,
  plans,
  isSubscribed,
  profile,
  setCreatePlanModalOpen,
  setEditingPlan,
}: {
  isLoadingPlans: boolean;
  isViewingOwnProfile: boolean | undefined;
  hasPlans: boolean;
  plans: SubscriptionPlan[];
  isSubscribed: boolean;
  profile: ProfileData | undefined;
  setCreatePlanModalOpen: (open: boolean) => void;
  setEditingPlan: (plan: SubscriptionPlan | null) => void;
}) {
  // A plan the creator never published on chain. PlanCard disables its
  // Subscribe button, so these are plans that exist and cannot be sold.
  const draftPlanCount = plans.filter((p) => !isPlanPublished(p)).length;
  if (isLoadingPlans) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
        <p className="text-zinc-500 text-sm">Loading plans...</p>
      </div>
    );
  }
  
  if (isViewingOwnProfile && !hasPlans) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BrandIcon src={star3dIcon} alt="Star" className="w-16 h-16 object-contain mb-4" />
        <h3 className="text-white font-bold text-xl mb-3">Subscriber Content</h3>
        <Button
          onClick={() => setCreatePlanModalOpen(true)}
          className="rounded-xl bg-white/10 border border-white/[0.08] hover:bg-white/20 text-white font-semibold gap-2 backdrop-blur-md"
        >
          <Plus className="w-4 h-4" />
          Create Your First Plan
        </Button>
      </div>
    );
  }
  
  if (isViewingOwnProfile && hasPlans) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Your Subscription Plans</h3>
          <Button 
            onClick={() => setCreatePlanModalOpen(true)}
            size="sm"
            className="rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Plan
          </Button>
        </div>
        {/* Not one plan on the platform has ever been listed on chain, because
            creating a plan and publishing it are two steps and only the first
            was ever taken. A creator with drafts holds plans that look finished
            and sell nothing, so the tab says so once at the top — the card that
            needs the action can be several screens down. */}
        {draftPlanCount > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-white/[0.06] border border-white/10 p-3">
            <Info className="w-4 h-4 text-white/50 shrink-0 mt-0.5" />
            <p className="text-xs text-white/70">
              {draftPlanCount === 1
                ? 'One of your plans is still a draft. '
                : draftPlanCount + ' of your plans are still drafts. '}
              A plan only sells once it is published on chain. Until then nobody
              can subscribe to you, and the Subscribers switch on a new post
              stays off.
            </p>
          </div>
        )}
        <div className="grid gap-4">
          {plans.map((plan) => (
            <PlanCard 
              key={plan._id || plan.id} 
              plan={plan} 
              isOwner={true}
              onEdit={() => setEditingPlan(plan)}
            />
          ))}
        </div>
      </div>
    );
  }
  
  if (!hasPlans) {
    return (
      <AppState
        icon="subscriptions"
        title="No subscription plans"
        description={`${profile?.name || 'This creator'} hasn't set up any plans yet.`}
        size="section"
      />
    );
  }
  
  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold mb-4">Subscription Plans</h3>
      <div className="grid gap-4">
        {plans.map((plan) => (
          <PlanCard 
            key={plan._id || plan.id} 
            plan={plan} 
            isSubscribed={isSubscribed}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Playlists Tab Panel — a profile's public bookmark folders
// ============================================================================

function PlaylistsTabPanel({ profileAddress, isOwnProfile }: { profileAddress: string; isOwnProfile: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: playlists = [], isLoading } = usePublicPlaylists(profileAddress);
  const [openId, setOpenId] = useState<string | null>(null);

  // `?playlist=<id>` is how a copied link lands on one playlist. Read in an
  // effect rather than a useState initializer: the profile page stays mounted
  // in the page cache, so a later link would otherwise be ignored.
  const linkedId = searchParams.get('playlist');
  useEffect(() => {
    if (linkedId) setOpenId(linkedId);
  }, [linkedId]);

  const closePlaylist = () => {
    setOpenId(null);
    if (searchParams.has('playlist')) {
      const next = new URLSearchParams(searchParams);
      next.delete('playlist');
      setSearchParams(next, { replace: true });
    }
  };

  if (openId) {
    return (
      <PlaylistPostsPanel
        profileAddress={profileAddress}
        playlistId={openId}
        summary={playlists.find((p) => p.id === openId) ?? null}
        onBack={closePlaylist}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (playlists.length === 0) {
    // Visitors never see this tab while it is empty (it is only listed once
    // there is a playlist); the owner does, as the nudge that populates it.
    return (
      <AppState
        icon="bookmarks"
        title={t('profile.tabs.playlists')}
        description={isOwnProfile ? t('bookmarks.playlist.emptyOwnerHint') : t('bookmarks.playlist.emptyVisitor')}
        size="section"
        primaryAction={isOwnProfile ? { label: t('bookmarks.playlist.openBookmarks'), onClick: () => navigate('/app/bookmarks') } : undefined}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {playlists.map((playlist) => (
        <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => setOpenId(playlist.id)} />
      ))}
    </div>
  );
}

function PlaylistCard({ playlist, onOpen }: { playlist: PublicPlaylist; onOpen: () => void }) {
  const { t } = useTranslation();
  const cover = playlist.coverTokenId != null && playlist.coverImageUrl
    ? buildImageUrl(playlist.coverTokenId, playlist.coverImageUrl, 480)
    : '';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-white/[0.03] text-left transition-colors hover:bg-white/[0.06] active:scale-[0.99]"
    >
      <div className="relative aspect-video w-full bg-zinc-800">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ListVideo className="h-8 w-8 text-zinc-500" />
          </div>
        )}
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
          {t('bookmarks.playlist.itemsCount', { count: playlist.itemCount })}
        </span>
      </div>
      <div className="min-w-0 w-full p-3">
        <p className="truncate text-sm font-semibold text-white">{playlist.name}</p>
        {playlist.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{playlist.description}</p>
        )}
      </div>
    </button>
  );
}

function PlaylistPostsPanel({
  profileAddress,
  playlistId,
  summary,
  onBack,
}: {
  profileAddress: string;
  playlistId: string;
  summary: PublicPlaylist | null;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const query = usePublicPlaylistItems(profileAddress, playlistId);
  const firstPage = query.data?.pages[0];
  const items = query.data?.pages.flatMap((page) => page.result) ?? [];
  const name = firstPage?.playlist.name ?? summary?.name ?? '';
  const description = firstPage?.playlist.description ?? summary?.description ?? '';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
          aria-label={t('bookmarks.playlist.back')}
          title={t('bookmarks.playlist.back')}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{name}</p>
          {description && <p className="truncate text-xs text-zinc-500">{description}</p>}
        </div>
        {summary && (
          <span className="shrink-0 text-xs text-zinc-500">
            {t('bookmarks.playlist.itemsCount', { count: summary.itemCount })}
          </span>
        )}
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      ) : query.isError ? (
        // A 404 here means the owner made it private again after the link was shared.
        <AppState icon="bookmarks" title={name || t('profile.tabs.playlists')} description={t('bookmarks.playlist.unavailable')} size="section" />
      ) : items.length === 0 ? (
        <AppState icon="bookmarks" title={name} description={t('bookmarks.playlist.noPosts')} size="section" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <PinnedPostCard key={item._id} pin={item} />
          ))}
          {query.hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button
                variant="ghost"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="h-9 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white text-xs"
              >
                {query.isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin" /> : t('bookmarks.playlist.loadMore')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Pinned Tab Panel (#17)
// ============================================================================

function PinnedTabPanel({ profileAddress }: { profileAddress: string }) {
  const { data, isLoading } = useUserPins(profileAddress);
  const pins = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (pins.length === 0) {
    return (
      <AppState icon="pinned" title="No pinned posts" description="Pinned posts will appear here." size="section" />
    );
  }

  return (
    <div className="space-y-3">
      {pins.map((pin) => (
        <PinnedPostCard key={pin.pinId || pin.tokenId} pin={pin} />
      ))}
    </div>
  );
}

function PinnedPostCard({ pin }: { pin: any }) {
  const post: any = pin.post || pin;
  if (!post?.tokenId) return null;

  const postType = post.postType || (post.videoUrl ? 'video' : post.imageUrls?.length ? 'image' : 'post');
  const creatorObj = post.creator || post.owner;
  const rawAvatarPath = extractAvatarPath(post) || extractAvatarPath(creatorObj);
  const resolvedAddress = post.minter || creatorObj?.id || creatorObj?.address;
  const avatar = rawAvatarPath && resolvedAddress ? buildAvatarUrl(resolvedAddress, rawAvatarPath) || '/placeholder.svg' : '/placeholder.svg';
  const rawTimestamp = post.createdAt || post.created_at;

  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
      {(postType === 'video' || postType === 'audio' || postType === 'feed-audio') ? (
        <VideoCard video={{
          id: String(post.tokenId), type: 'video', contentRating: post.contentRating,
          thumbnail: buildImageUrl(post.tokenId, post.imageUrl) || '/placeholder.svg',
          videoUrl: buildVideoUrl(post.tokenId),
          transcodingStatus: post.transcodingStatus,
          title: post.title || post.name || '',
          channel: post.minterDisplayName || post.minterUsername || creatorObj?.display_name || 'Unknown',
          channelAvatar: avatar, verified: false,
          views: formatViews(resolveViewCount(post)).replace(' views', ''),
          uploadedAgo: formatTimeAgo(rawTimestamp),
          duration: '', durationSeconds: 0,
          likeCount: post.totalVotes?.for || 0, dislikeCount: post.totalVotes?.against || 0,
          commentCount: post.commentCount || 0, repostCount: (post.totalReposts || 0) + (post.quotes || 0),
          isOwner: false, isUnlocked: false,
          creatorId: resolvedAddress,
          creatorUsername: post.minterUsername || creatorObj?.username,
        }} />
      ) : postType === 'image' || postType === 'feed-images' ? (
        <ImageCard post={{
          id: String(post.tokenId), type: 'image', contentRating: post.contentRating,
          username: post.minterDisplayName || post.minterUsername || creatorObj?.display_name || 'Unknown',
          verified: false, avatar,
          image: buildImageUrl(post.tokenId, post.imageUrl) || '/placeholder.svg',
          imageUrls: buildFeedImageUrls(post.imageUrls) || [buildImageUrl(post.tokenId, post.imageUrl) || '/placeholder.svg'],
          caption: post.description || '', likes: post.totalVotes?.for || 0,
          dislikes: post.totalVotes?.against || 0,
          comments: post.commentCount || 0, views: formatViews(resolveViewCount(post)).replace(' views', ''),
          timeAgo: formatTimeAgo(rawTimestamp),
          creatorId: resolvedAddress,
          creatorUsername: post.minterUsername || creatorObj?.username,
          isOwner: false, isUnlocked: false,
          repostCount: (post.totalReposts || 0) + (post.quotes || 0),
        }} />
      ) : (
        <PostCard post={{
          id: String(post.tokenId), type: 'post', contentRating: post.contentRating,
          createdAt: rawTimestamp || '',
          views: formatViews(resolveViewCount(post)).replace(' views', ''),
          author: {
            id: resolvedAddress,
            name: post.minterDisplayName || post.minterUsername || creatorObj?.display_name || 'Unknown',
            handle: post.minterUsername || creatorObj?.username || resolvedAddress?.slice(0, 8) || 'anon',
            avatarSeed: avatar, verified: false,
          },
          content: post.description || post.name || '',
          stats: {
            comments: post.commentCount || 0,
            reposts: (post.totalReposts || 0) + (post.quotes || 0),
            likes: post.totalVotes?.for || 0,
            dislikes: post.totalVotes?.against || 0,
          },
          communityAlertPending: (post as any).communityAlertStatus === 'pending',
        }} />
      )}
    </div>
  );
}

// ============================================================================
// Comment Card for profile replies tab
// ============================================================================
//
// A reply is shown as the thread it belongs to, the way the comments section
// draws one: the post on top, the comment being answered when there is one,
// then this user's reply, with a line running through the avatars. Every row
// carries its author's display name, handle and badge — a wallet address is
// never what ends up on screen.

/** The avatar's centre in a CardHeader row: a 36px avatar flush with the left edge. */
const THREAD_LINE_LEFT = 'left-[18px] -ml-px';
/** The content column starts after the 36px avatar and its 12px gap. */
const THREAD_INDENT = 'pl-12';

/**
 * One row of the thread. The line segments run to the row's own top and
 * bottom edges so neighbouring rows meet in one continuous line; the opaque
 * avatar paints over the middle and the line reads as leaving its rim.
 */
function ThreadRow({ lineAbove, lineBelow, children }: { lineAbove?: boolean; lineBelow?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative">
      {lineAbove && <span aria-hidden className={`absolute ${THREAD_LINE_LEFT} top-0 h-5 w-px bg-white/20`} />}
      {lineBelow && <span aria-hidden className={`absolute ${THREAD_LINE_LEFT} top-5 bottom-0 w-px bg-white/20`} />}
      {children}
    </div>
  );
}

/** A tap on an avatar or a name opens that profile, not the post underneath. */
function stopIfButton(e: React.MouseEvent) {
  if ((e.target as HTMLElement).closest('button, a')) e.stopPropagation();
}

function shortAddress(address?: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function ThreadSkeletonRow() {
  return (
    <div className="flex items-center gap-3 pb-4 animate-pulse" aria-hidden>
      <div className="w-9 h-9 rounded-md bg-white/[0.08] shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-28 rounded bg-white/[0.08]" />
        <div className="h-3 w-44 rounded bg-white/[0.06]" />
      </div>
    </div>
  );
}

function ThreadUnavailableRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 pb-4">
      <div className="w-9 h-9 rounded-md bg-white/[0.05] shrink-0 flex items-center justify-center">
        <MessageSquare className="w-4 h-4 text-zinc-600" />
      </div>
      <p className="text-sm text-zinc-500 italic">{text}</p>
    </div>
  );
}

/** The post a comment sits under: its author, its text and its media. */
function ThreadPostRow({ post }: { post: DeHubNFT }) {
  const minterUser = post.minterUser;
  const handle = minterUser?.username || post.minterUsername || post.mintername;
  const name = minterUser?.displayName || post.minterDisplayName || handle || shortAddress(post.minter);
  const avatarPath = extractAvatarPath(post) || extractAvatarPath(minterUser);
  const avatarSeed = buildAvatarUrl(post.minter, avatarPath) || post.minter;
  const hideBadge = minterUser?.hideBadgeAndBalance === true;
  // Same title/body split the feed card uses, so the post reads here as it
  // does there (the API often copies the first line of the body into `name`).
  const mapped = mapToTextPost(post as unknown as UnifiedFeedItem, 0);
  return (
    <>
      <div onClick={stopIfButton}>
        <CardHeader
          username={name}
          handle={handle}
          avatarSeed={avatarSeed}
          contentType="post"
          creatorId={post.minter}
          creatorUsername={handle}
          timestamp={post.createdAt ? formatTimeAgo(post.createdAt) : undefined}
          badgeBalance={hideBadge ? 0 : minterUser?.badgeBalance}
          badgeLock={hideBadge ? null : minterUser?.badgeLock}
        />
      </div>
      <div className={`${THREAD_INDENT} pb-4 space-y-2`}>
        {mapped.title && (
          <p className="text-white font-semibold text-sm sm:text-base leading-snug break-words">{mapped.title}</p>
        )}
        {mapped.content && (
          <p className="text-white/90 text-sm sm:text-base whitespace-pre-wrap break-words line-clamp-6">
            {renderTextWithLinks(mapped.content)}
          </p>
        )}
        <QuotedPostMedia post={post} className="rounded-xl" />
      </div>
    </>
  );
}

/** The comment this reply answers. */
function ThreadParentCommentRow({ parent }: { parent: UserCommentParent }) {
  const author = parent.author;
  const address = author?.address || parent.address || '';
  const handle = author?.username;
  const name = author?.displayName || handle || shortAddress(address);
  const avatarSeed = buildAvatarUrl(address, author?.avatarImageUrl) || address;
  const hideBadge = author?.hideBadgeAndBalance === true;
  const image = resolveCommentMediaUrl(parent.imageUrl || parent.gifUrl);
  return (
    <>
      <div onClick={stopIfButton}>
        <CardHeader
          username={name}
          handle={handle}
          avatarSeed={avatarSeed}
          contentType="post"
          creatorId={address || undefined}
          creatorUsername={handle}
          timestamp={parent.createdAt ? formatTimeAgo(parent.createdAt) : undefined}
          badgeBalance={hideBadge ? 0 : author?.badgeBalance}
          badgeLock={hideBadge ? null : author?.badgeLock}
        />
      </div>
      <div className={`${THREAD_INDENT} pb-4 space-y-2`}>
        {parent.content && (
          <p className="text-white/90 text-sm sm:text-base whitespace-pre-wrap break-words line-clamp-6">
            {renderTextWithLinks(parent.content)}
          </p>
        )}
        {image && <img src={image} alt="" className="max-h-60 rounded-lg object-cover" loading="lazy" />}
      </div>
    </>
  );
}

/** Comment media arrives as a full URL from newer uploads and a CDN path from older ones. */
function resolveCommentMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return /^(https?:)?\/\//.test(url) || url.startsWith('data:') ? url : getMediaUrl(url) || url;
}

function CommentCard({ comment, parentPost, parentPostFailed, isOwnComment, onClick }: {
  comment: UserCommentItem;
  parentPost?: DeHubNFT;
  /** The post could not be loaded (deleted, hidden, or the request failed). */
  parentPostFailed?: boolean;
  isOwnComment?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  // The user comments API nests the author's account row as `author`; the
  // per-post comments shape carries a thinner `writor`. Read both, and never
  // let the wallet address stand in for a handle — a missing username simply
  // shows no handle.
  const author = comment.author;
  const resolvedHandle = author?.username || comment.writor?.username;
  const resolvedName = author?.displayName || comment.writor?.displayName || resolvedHandle || shortAddress(comment.address);
  const rawAvatarPath = author?.avatarImageUrl || comment.writor?.avatarUrl;
  const avatarSeed = buildAvatarUrl(comment.address, rawAvatarPath) || comment.address;
  const hideBadge = author?.hideBadgeAndBalance === true;
  const badgeBalance = hideBadge ? 0 : (author?.badgeBalance ?? comment.writor?.badgeBalance);
  const badgeLock = hideBadge ? null : author?.badgeLock;

  const isReply = !!(comment.isReply || comment.parentId);
  const parentComment = isReply ? comment.parentComment : undefined;
  // A reply whose parent the API could not resolve any more (deleted, hidden).
  const parentCommentGone = isReply && !parentComment;
  const replyImage = resolveCommentMediaUrl(comment.imageUrl || comment.gifUrl);

  const handleEdit = async () => {
    if (!editText.trim()) return;
    try {
      await editComment({ commentId: comment.id, content: editText });
      queryClient.invalidateQueries({ queryKey: ['user-comments'] });
      setIsEditing(false);
    } catch (err) {
      console.error('Edit comment error:', err);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteComment(comment.id);
      queryClient.invalidateQueries({ queryKey: ['user-comments'] });
    } catch (err) {
      console.error('Delete comment error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      onClick={onClick}
      className="w-full text-left rounded-xl border border-white/[0.08] bg-transparent hover:bg-white/[0.03] transition-colors cursor-pointer overflow-hidden relative p-3"
    >
      {/* The post — the top of every thread. */}
      {comment.tokenId ? (
        <ThreadRow lineBelow>
          {parentPost
            ? <ThreadPostRow post={parentPost} />
            : parentPostFailed
              ? <ThreadUnavailableRow text={t('profile.replyThread.postUnavailable')} />
              : <ThreadSkeletonRow />}
        </ThreadRow>
      ) : null}

      {/* The comment being answered, when this is a reply to one. */}
      {parentComment && (
        <ThreadRow lineAbove lineBelow>
          <ThreadParentCommentRow parent={parentComment} />
        </ThreadRow>
      )}
      {parentCommentGone && (
        <ThreadRow lineAbove lineBelow>
          <ThreadUnavailableRow text={t('profile.replyThread.commentUnavailable')} />
        </ThreadRow>
      )}

      {/* This user's comment or reply. */}
      <ThreadRow lineAbove={!!comment.tokenId}>
        <div onClick={stopIfButton}>
          <CardHeader
            username={resolvedName}
            handle={resolvedHandle}
            avatarSeed={avatarSeed}
            contentType="post"
            creatorId={comment.address}
            creatorUsername={resolvedHandle}
            timestamp={formatTimeAgo(comment.createdAt)}
            badgeBalance={badgeBalance}
            badgeLock={badgeLock}
          />
        </div>

        <div className={`${THREAD_INDENT} space-y-2`}>
          {isEditing ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-zinc-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEdit();
                  else if (e.key === 'Escape') { setEditText(comment.content); setIsEditing(false); }
                }}
              />
              <button onClick={(e) => { e.stopPropagation(); handleEdit(); }} className="text-green-400 hover:text-green-300">✓</button>
              <button onClick={(e) => { e.stopPropagation(); setEditText(comment.content); setIsEditing(false); }} className="text-zinc-400 hover:text-white">✕</button>
            </div>
          ) : (
            <p className="text-white/90 text-sm sm:text-base whitespace-pre-wrap break-words line-clamp-4">
              {renderTextWithLinks(comment.content)}
            </p>
          )}

          {replyImage && (
            <div className="mt-2 rounded-lg overflow-hidden">
              <img src={replyImage} alt="" className="max-h-80 w-auto rounded-lg" loading="lazy" />
            </div>
          )}

          {/* Action bar - matches PostCard layout */}
          <div className="pt-1 flex items-center justify-between">
            <div className="flex items-center gap-0">
              <span className="flex items-center gap-1.5 text-zinc-400 text-xs px-2 py-1.5 rounded-xl">
                <ThumbsUp className="w-4 h-4" />
                {comment.likeCount ?? 0}
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400 text-xs px-2 py-1.5 rounded-xl">
                <ThumbsDown className="w-4 h-4" />
                {comment.dislikeCount ?? 0}
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400 text-xs px-2 py-1.5 rounded-xl">
                <MessageSquare className="w-4 h-4" />
                {comment.replyIds?.length ?? 0}
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400 text-xs px-2 py-1.5 rounded-xl">
                <Share2 className="w-4 h-4" />
                0
              </span>
              {isOwnComment && !isEditing && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs px-2 py-1.5 rounded-xl transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-red-400 text-xs px-2 py-1.5 rounded-xl transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-zinc-400" />
              <Info className="w-4 h-4 text-zinc-400" />
            </div>
          </div>
        </div>
      </ThreadRow>
    </div>
  );
}
