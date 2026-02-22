import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { Home, MessageSquare, Image, Film, Star, Play, Radio, PieChart } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile, useDeHubUserContent, separateUserContent } from '@/hooks/use-dehub-profile';
import { useCreatorPlans, useIsSubscribed } from '@/hooks/use-subscriptions';
import { useUserPrivacySettings } from '@/hooks/use-privacy-settings';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { useBadgeBalance } from '@/hooks/use-badge-balance';
import { getBadgeUrl } from '@/lib/staking-badges';
import { useStories, useWatchedStories } from '@/hooks/use-stories';
import { useOptimisticPosts } from '@/hooks/use-optimistic-posts';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { getUserComments, getBlockStatus, blockUser, unblockUser } from '@/lib/api/dehub';
import { toast } from 'sonner';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';
import type { TabValue } from '@/components/app/profile/ProfileConstants';

const PULL_THRESHOLD = 80;

export function useProfilePage() {
  const [searchParams] = useSearchParams();
  const { username: routeUsername } = useParams<{ username: string }>();
  const userId = searchParams.get('id');
  const { user: currentUser, walletAddress: currentWalletAddress, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [translatedBio, setTranslatedBio] = useState<string | null>(null);
  const [isBlockLoading, setIsBlockLoading] = useState(false);
  const profileContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Reset scroll position on mount
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setTranslatedBio(null);
  }, [routeUsername, userId]);

  // Determine lookup method
  const lookupUsername = routeUsername;
  const lookupUserId = userId || (!routeUsername ? (currentUser?.address || currentWalletAddress || undefined) : undefined);

  // Fetch profile
  const {
    data: apiProfile,
    isLoading: isLoadingProfile,
    isError: isProfileError,
    setFollowStatus,
  } = useDeHubProfile({
    userId: lookupUserId,
    username: lookupUsername,
    address: currentWalletAddress || undefined,
    enabled: !!(lookupUserId || lookupUsername),
  });

  // Fetch user content
  const {
    data: userContentData,
    isLoading: isLoadingContent,
  } = useDeHubUserContent({
    userId: apiProfile?.walletAddress,
    viewerAddress: currentWalletAddress || undefined,
    enabled: !!apiProfile?.walletAddress,
  });

  const profile = apiProfile;
  const isOwnProfile = !routeUsername && (!userId || (currentUser?.address === userId) || (currentWalletAddress === userId));
  const isViewingOwnProfile = isOwnProfile || (apiProfile?.walletAddress && apiProfile.walletAddress.toLowerCase() === currentWalletAddress?.toLowerCase());

  // Badge
  const { badgeBalance } = useBadgeBalance(apiProfile?.walletAddress);
  const badgeUrl = getBadgeUrl(badgeBalance);

  // Content separation
  const { PROFILE_POSTS, PROFILE_IMAGES, ALL_PROFILE_VIDEOS, ALL_CONTENT } = useMemo(() => {
    if (!userContentData?.pages) {
      return { PROFILE_POSTS: [], PROFILE_IMAGES: [], ALL_PROFILE_VIDEOS: [], ALL_CONTENT: [] };
    }
    const allNFTs = userContentData.pages.flatMap(page => page.data || []);
    const separated = separateUserContent(allNFTs);

    const unified: Array<{ type: 'post' | 'image' | 'video'; data: TextPost | ImagePost | VideoItem; createdAt: string }> = [
      ...separated.posts.map(p => ({ type: 'post' as const, data: p, createdAt: p.createdAt || '' })),
      ...separated.images.map(i => ({ type: 'image' as const, data: i, createdAt: i.createdAt || '' })),
      ...separated.videos.map(v => ({ type: 'video' as const, data: v, createdAt: v.createdAt || '' })),
    ];

    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      PROFILE_POSTS: separated.posts,
      PROFILE_IMAGES: separated.images,
      ALL_PROFILE_VIDEOS: separated.videos,
      ALL_CONTENT: unified,
    };
  }, [userContentData]);

  // Comment count for posts tab
  const { data: commentCountData } = useQuery({
    queryKey: ['user-comments-count', apiProfile?.walletAddress],
    queryFn: () => getUserComments(apiProfile!.walletAddress, 1, 20),
    enabled: !!apiProfile?.walletAddress,
    staleTime: 2 * 60 * 1000,
  });
  const commentCount = commentCountData?.total || commentCountData?.data?.length || 0;

  const PROFILE_TABS: { icon: typeof Home; label: string; value: TabValue; count: number }[] = [
    { icon: Home, label: 'All', value: 'home', count: ALL_CONTENT.length },
    { icon: MessageSquare, label: 'Posts', value: 'posts', count: PROFILE_POSTS.length + commentCount },
    { icon: Image, label: 'Images', value: 'images', count: PROFILE_IMAGES.length },
    { icon: Film, label: 'Videos', value: 'videos', count: ALL_PROFILE_VIDEOS.length },
    { icon: Star, label: 'Subs', value: 'subscribers', count: 0 },
    { icon: Play, label: 'Audio', value: 'songs', count: 0 },
    { icon: Radio, label: 'Live', value: 'live', count: 0 },
    { icon: PieChart, label: 'Fractions', value: 'fractions', count: 0 },
  ];

  // Subscriptions
  const { plans, isLoading: isLoadingPlans, hasPlans, isOwnPlans } = useCreatorPlans(apiProfile?.walletAddress);
  const { isSubscribed, isLoading: isLoadingSubscription } = useIsSubscribed(
    !isViewingOwnProfile ? apiProfile?.walletAddress : undefined
  );

  // Optimistic posts
  const { optimisticPosts, clearOptimisticPosts } = useOptimisticPosts();

  // Privacy
  const { showFollowersFollowing, hideFollowerCounts } = useUserPrivacySettings(apiProfile?.walletAddress);

  // Re-auth
  const { handleApiError } = useReauthHandler();

  // Stories
  const { stories: allStories } = useStories();
  const { isWatched, markWatched } = useWatchedStories();

  const profileStories = useMemo(() => {
    if (!profile?.walletAddress || !allStories.length) return [];
    return allStories.filter(
      s => s.wallet_address.toLowerCase() === profile.walletAddress.toLowerCase()
    );
  }, [allStories, profile?.walletAddress]);

  const hasStories = profileStories.length > 0;
  const hasUnwatchedStories = hasStories && profileStories.some(s => !isWatched(s.id));

  const profileStoryStartIndex = useMemo(() => {
    if (!hasStories) return 0;
    const idx = allStories.findIndex(
      s => s.wallet_address.toLowerCase() === profile?.walletAddress?.toLowerCase()
    );
    return idx >= 0 ? idx : 0;
  }, [allStories, profile?.walletAddress, hasStories]);

  // Follow status
  const isFollowing = apiProfile?.isFollowing ?? false;
  const isPending = apiProfile?.isPending ?? false;
  const isTargetPrivate = apiProfile?.isPrivate ?? false;

  // Block status - prefer account_info data (always fresh), fallback to dedicated endpoint
  const { data: blockStatus } = useQuery({
    queryKey: ['block-status', apiProfile?.walletAddress],
    queryFn: () => getBlockStatus(apiProfile!.walletAddress),
    enabled: !!apiProfile?.walletAddress && isAuthenticated && !isViewingOwnProfile,
    staleTime: 60 * 1000,
  });

  // account_info returns youBlocked/blockedYou directly on the profile
  const isBlocked = blockStatus?.isBlocked ?? apiProfile?.youBlocked ?? false;
  const isBlockedBy = blockStatus?.isBlockedBy ?? apiProfile?.blockedYou ?? false;

  const handleBlock = useCallback(async () => {
    if (!apiProfile?.walletAddress || isBlockLoading) return;
    setIsBlockLoading(true);
    const newBlocked = !isBlocked;
    try {
      if (isBlocked) {
        await unblockUser(apiProfile.walletAddress);
        toast.success(`Unblocked ${apiProfile.name || apiProfile.handle || 'user'}`);
      } else {
        await blockUser(apiProfile.walletAddress);
        toast.success(`Blocked ${apiProfile.name || apiProfile.handle || 'user'}`);
      }
      // Optimistic: set block status immediately so UI updates
      queryClient.setQueryData(['block-status', apiProfile.walletAddress], {
        isBlocked: newBlocked,
        isBlockedBy: blockStatus?.isBlockedBy ?? false,
      });
      queryClient.invalidateQueries({ queryKey: ['block-list'] });
      // Also refresh the profile so account_info youBlocked stays in sync
      queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
    } catch (error) {
      // Revert optimistic update on failure
      queryClient.setQueryData(['block-status', apiProfile.walletAddress], {
        isBlocked: isBlocked,
        isBlockedBy: blockStatus?.isBlockedBy ?? false,
      });
      handleApiError(error, `Failed to ${isBlocked ? 'unblock' : 'block'} user`);
    } finally {
      setIsBlockLoading(false);
    }
  }, [apiProfile, isBlocked, isBlockLoading, blockStatus, queryClient, handleApiError]);
  // Pull-to-refresh
  const triggerRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    if (isViewingOwnProfile) {
      clearOptimisticPosts();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  }, [isRefreshing, isViewingOwnProfile, clearOptimisticPosts]);

  const { pullDistance, isPulling, isHoldingAtThreshold, holdProgress, handlers: pullHandlers } = usePullToRefresh({
    pullThreshold: PULL_THRESHOLD,
    onRefresh: triggerRefresh,
    isRefreshing,
    containerRef: profileContainerRef,
  });

  const needsLayoutWrapper = !!routeUsername;

  return {
    // Route info
    routeUsername,
    userId,
    needsLayoutWrapper,
    // Auth
    isAuthenticated,
    isAuthLoading,
    currentWalletAddress,
    // Profile
    profile,
    apiProfile,
    isLoadingProfile,
    isProfileError,
    isOwnProfile,
    isViewingOwnProfile,
    setFollowStatus,
    // Badge
    badgeUrl,
    // Content
    PROFILE_POSTS,
    PROFILE_IMAGES,
    ALL_PROFILE_VIDEOS,
    ALL_CONTENT,
    PROFILE_TABS,
    userContentData,
    isLoadingContent,
    // Subscriptions
    plans,
    isLoadingPlans,
    hasPlans,
    isOwnPlans,
    isSubscribed,
    isLoadingSubscription,
    // Optimistic
    optimisticPosts,
    // Privacy
    showFollowersFollowing,
    hideFollowerCounts,
    // Re-auth
    handleApiError,
    // Stories
    allStories,
    profileStories,
    hasStories,
    hasUnwatchedStories,
    profileStoryStartIndex,
    markWatched,
    isWatched,
    // Follow
    isFollowing,
    isPending,
    isTargetPrivate,
    // Block
    isBlocked,
    isBlockedBy,
    isBlockLoading,
    handleBlock,
    // Pull-to-refresh
    profileContainerRef,
    pullDistance,
    isPulling,
    isHoldingAtThreshold,
    holdProgress,
    pullHandlers,
    isRefreshing,
    PULL_THRESHOLD,
    // Bio translation
    translatedBio,
    setTranslatedBio,
  };
}
