import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Home, MessageCircle, MessageSquare, Image, Video, Star, Play, Radio,
  Calendar, UserPlus, UserMinus, Copy, AtSign, Wallet, Send, Plus, Bell, Lock, CreditCard, PieChart, Tag, Handshake, Loader2, Film, Pencil, ChevronLeft, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/app/UserAvatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { PostCard } from '@/components/app/cards/PostCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { AppLayout } from '@/components/app/AppLayout';
import { LoginModal } from '@/components/app/LoginModal';
import { FullscreenImageViewer } from '@/components/app/cards/FullscreenImageViewer';
import { CreatePlanModal, EditPlanModal, PlanCard } from '@/components/app/subscriptions';
import { FollowersListDrawer } from '@/components/app/profile';
import { cn } from '@/lib/utils';
import fractions3dIcon from '@/assets/icons/fractions-3d-icon.png';
import live3dIcon from '@/assets/icons/live-3d-icon.png';
import audio3dIcon from '@/assets/icons/audio-3d-icon.png';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile, useDeHubUserContent, separateUserContent, type ProfileData } from '@/hooks/use-dehub-profile';
import { useCreatorPlans, useIsSubscribed } from '@/hooks/use-subscriptions';
import { useUserPrivacySettings } from '@/hooks/use-privacy-settings';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { followUser, unfollowUser } from '@/lib/api/dehub';
import { useStories, useWatchedStories } from '@/hooks/use-stories';
import { ShimmerBorder } from '@/components/app/stories/ShimmerBorder';
import { StoryViewerModal } from '@/components/app/stories/StoryViewerModal';

import { useOptimisticPosts } from '@/hooks/use-optimistic-posts';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';
import dehubCoin from '@/assets/dehub-coin.png';

// Default banner templates for users without custom covers
import defaultBanner1 from '@/assets/banners/default-banner-1.png';
import defaultBanner2 from '@/assets/banners/default-banner-2.png';
import defaultBanner3 from '@/assets/banners/default-banner-3.png';
import defaultBanner4 from '@/assets/banners/default-banner-4.png';
import defaultBanner5 from '@/assets/banners/default-banner-5.png';
import defaultBanner6 from '@/assets/banners/default-banner-6.png';
import defaultBanner7 from '@/assets/banners/default-banner-7.png';
import defaultBanner8 from '@/assets/banners/default-banner-8.png';
import defaultBanner9 from '@/assets/banners/default-banner-9.png';

const DEFAULT_BANNERS = [
  defaultBanner1,
  defaultBanner2,
  defaultBanner3,
  defaultBanner4,
  defaultBanner5,
  defaultBanner6,
  defaultBanner7,
  defaultBanner8,
  defaultBanner9,
];

/**
 * Get a deterministic default banner based on wallet address
 * Uses simple hash to consistently assign same banner to same user
 */
function getDefaultBanner(walletAddress?: string): string {
  if (!walletAddress) return DEFAULT_BANNERS[0];
  
  // Simple hash: sum char codes and mod by banner count
  const hash = walletAddress.toLowerCase().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return DEFAULT_BANNERS[hash % DEFAULT_BANNERS.length];
}

type TabValue = 'home' | 'posts' | 'replies' | 'images' | 'videos' | 'subscribers' | 'songs' | 'live' | 'fractions';

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { username: routeUsername } = useParams<{ username: string }>();
  const userId = searchParams.get('id');
  const { user: currentUser, walletAddress: currentWalletAddress, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  
  // ALL useState hooks MUST be at the top, before any conditional returns
  const [activeTab, setActiveTab] = useState<TabValue>('home');
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [createPlanModalOpen, setCreatePlanModalOpen] = useState(false);
  const [offerDrawerOpen, setOfferDrawerOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [followListDrawerOpen, setFollowListDrawerOpen] = useState(false);
  const [followListType, setFollowListType] = useState<'followers' | 'following'>('followers');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);
  const [showAvatarOverlay, setShowAvatarOverlay] = useState(false);
  const [editingPlan, setEditingPlan] = useState<import('@/lib/api/dehub').SubscriptionPlan | null>(null);
  
  // Refs for pull-to-refresh
  const profileContainerRef = useRef<HTMLDivElement>(null);
  
  // Reset scroll position on mount
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [routeUsername, userId]);
  
  // Determine lookup method: route param username > query param id > current user
  const lookupUsername = routeUsername;
  const lookupUserId = userId || (!routeUsername ? (currentUser?.address || currentWalletAddress || undefined) : undefined);

  // Fetch profile from API - supports both username and userId lookups
  // Pass viewer's address to get follow status
  const { 
    data: apiProfile, 
    isLoading: isLoadingProfile, 
    isError: isProfileError,
    setFollowStatus,
  } = useDeHubProfile({ 
    userId: lookupUserId, 
    username: lookupUsername,
    address: currentWalletAddress || undefined,
    enabled: !!(lookupUserId || lookupUsername)
  });
  
  // Fetch user content from API - use wallet address once we have profile
  // Pass current user's wallet address to get isLiked/isSaved states
  const {
    data: userContentData,
    isLoading: isLoadingContent,
  } = useDeHubUserContent({
    userId: apiProfile?.walletAddress,
    viewerAddress: currentWalletAddress || undefined,
    enabled: !!apiProfile?.walletAddress,
  });
  
  // Determine which profile to show - no more mock fallback
  const profile = apiProfile;
  // Check if viewing own profile: no route username AND (no query ID OR query ID matches current user)
  const isOwnProfile = !routeUsername && (!userId || (currentUser?.address === userId) || (currentWalletAddress === userId));
  // Also check if profile wallet matches current user's wallet (for /{username} routes)
  const isViewingOwnProfile = isOwnProfile || (apiProfile?.walletAddress && apiProfile.walletAddress.toLowerCase() === currentWalletAddress?.toLowerCase());
  
  // Process API content - separate by type AND create unified feed sorted by date
  const { PROFILE_POSTS, PROFILE_IMAGES, ALL_PROFILE_VIDEOS, ALL_CONTENT } = useMemo(() => {
    if (!userContentData?.pages) {
      return { PROFILE_POSTS: [], PROFILE_IMAGES: [], ALL_PROFILE_VIDEOS: [], ALL_CONTENT: [] };
    }
    const allNFTs = userContentData.pages.flatMap(page => page.data || []);
    const separated = separateUserContent(allNFTs);
    
    // Create unified content array with type info for home tab (sorted by createdAt - latest first)
    const unified: Array<{ type: 'post' | 'image' | 'video'; data: TextPost | ImagePost | VideoItem; createdAt: string }> = [
      ...separated.posts.map(p => ({ type: 'post' as const, data: p, createdAt: p.createdAt || '' })),
      ...separated.images.map(i => ({ type: 'image' as const, data: i, createdAt: i.createdAt || '' })),
      ...separated.videos.map(v => ({ type: 'video' as const, data: v, createdAt: v.createdAt || '' })),
    ];
    
    // Sort by createdAt descending (newest first)
    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return { 
      PROFILE_POSTS: separated.posts,
      PROFILE_IMAGES: separated.images, 
      ALL_PROFILE_VIDEOS: separated.videos,
      ALL_CONTENT: unified,
    };
  }, [userContentData]);
  
  const PROFILE_TABS: { icon: typeof Home; label: string; value: TabValue; count: number }[] = [
    { icon: Home, label: 'All', value: 'home', count: ALL_CONTENT.length },
    { icon: MessageSquare, label: 'Posts', value: 'posts', count: PROFILE_POSTS.length },
    { icon: Image, label: 'Images', value: 'images', count: PROFILE_IMAGES.length },
    { icon: Video, label: 'Videos', value: 'videos', count: ALL_PROFILE_VIDEOS.length },
    { icon: Star, label: 'Subs', value: 'subscribers', count: 0 },
    { icon: Play, label: 'Audio', value: 'songs', count: 0 },
    { icon: Radio, label: 'Live', value: 'live', count: 0 },
    { icon: PieChart, label: 'Fractions', value: 'fractions', count: 0 },
  ];
  
  // Fetch subscription plans for this profile
  const { plans, isLoading: isLoadingPlans, hasPlans, isOwnPlans } = useCreatorPlans(apiProfile?.walletAddress);
  const { isSubscribed, isLoading: isLoadingSubscription } = useIsSubscribed(
    !isViewingOwnProfile ? apiProfile?.walletAddress : undefined
  );
  
  // Get optimistic posts for own profile
  const { optimisticPosts, clearOptimisticPosts } = useOptimisticPosts();
  
  // Fetch privacy settings for the profile being viewed
  const { showFollowersFollowing, hideFollowerCounts } = useUserPrivacySettings(apiProfile?.walletAddress);

  
  
  // Re-auth handler for API error handling
  const { handleApiError } = useReauthHandler();
  
  // Stories - check if this user has active stories
  const { stories: allStories } = useStories();
  const { isWatched, markWatched } = useWatchedStories();
  
  // Filter stories for this profile's wallet address
  const profileStories = useMemo(() => {
    if (!profile?.walletAddress || !allStories.length) return [];
    return allStories.filter(
      s => s.wallet_address.toLowerCase() === profile.walletAddress.toLowerCase()
    );
  }, [allStories, profile?.walletAddress]);
  
  const hasStories = profileStories.length > 0;
  const hasUnwatchedStories = hasStories && profileStories.some(s => !isWatched(s.id));
  
  // Find index of this user's first story in the full stories array for the viewer
  const profileStoryStartIndex = useMemo(() => {
    if (!hasStories) return 0;
    const idx = allStories.findIndex(
      s => s.wallet_address.toLowerCase() === profile?.walletAddress?.toLowerCase()
    );
    return idx >= 0 ? idx : 0;
  }, [allStories, profile?.walletAddress, hasStories]);
  
  // Use API's isFollowing and isPending status
  const isFollowing = apiProfile?.isFollowing ?? false;
  const isPending = apiProfile?.isPending ?? false;
  const isTargetPrivate = apiProfile?.isPrivate ?? false;
  
  // Pull-to-refresh handler
  const PULL_THRESHOLD = 80;
  
  const triggerRefresh = useCallback(() => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    // Clear optimistic posts on refresh since real data should be available
    if (isViewingOwnProfile) {
      clearOptimisticPosts();
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Simulate refresh delay then refetch
    setTimeout(() => {
      // Trigger refetch of profile content
      // The queries will refetch automatically when key changes
      setIsRefreshing(false);
    }, 1000);
  }, [isRefreshing, isViewingOwnProfile, clearOptimisticPosts]);
  
  // Pull-to-refresh hook
  const { pullDistance, isPulling, isHoldingAtThreshold, holdProgress, handlers: pullHandlers } = usePullToRefresh({
    pullThreshold: PULL_THRESHOLD,
    onRefresh: triggerRefresh,
    isRefreshing,
    containerRef: profileContainerRef,
  });

  const handleCopyProfileUrl = () => {
    navigator.clipboard.writeText(`https://dehub.io/${profile.handle.replace('@', '')}`);
    toast.success('Profile URL copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(profile.handle);
    toast.success('Username copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyAddress = () => {
    if (!profile.walletAddress) {
      toast.error('No wallet address available');
      return;
    }
    navigator.clipboard.writeText(profile.walletAddress);
    toast.success('Address copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleSendCoins = () => {
    toast.info('Send coins feature coming soon');
    setShareSheetOpen(false);
  };

  const handleToggleNotifications = () => {
    toast.success('Notifications enabled for this profile');
    setShareSheetOpen(false);
  };

  const handleUnfollow = async () => {
    if (!isAuthenticated) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (!profile?.walletAddress) {
      toast.error('Cannot unfollow: user wallet address not found');
      return;
    }
    
    setIsFollowLoading(true);
    // Optimistic update
    setFollowStatus(false);
    
    try {
      await unfollowUser(profile.walletAddress);
      toast.success(`Unfollowed ${profile.name}`);
    } catch (error) {
      // Revert on error
      setFollowStatus(true);
      handleApiError(error, 'Failed to unfollow. Please try again.');
    } finally {
      setIsFollowLoading(false);
      setShareSheetOpen(false);
    }
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (!profile?.walletAddress) {
      toast.error('Cannot follow: user wallet address not found');
      return;
    }
    
    setIsFollowLoading(true);
    
    // For private accounts, the follow becomes a request
    if (isTargetPrivate) {
      // Optimistic update - show pending state
      setFollowStatus(true); // will show as pending via isPending
    } else {
      // Optimistic update - immediate follow
      setFollowStatus(true);
    }
    
    try {
      await followUser(profile.walletAddress);
      if (isTargetPrivate) {
        toast.success(`Follow request sent to ${profile.name}`);
      } else {
        toast.success(`Following ${profile.name}`);
      }
    } catch (error) {
      // Revert on error
      setFollowStatus(false);
      handleApiError(error, 'Failed to follow. Please try again.');
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleMakeOffer = () => {
    setShareSheetOpen(false);
    setOfferDrawerOpen(true);
  };

  const handleSubmitOffer = () => {
    if (!offerAmount || parseFloat(offerAmount) <= 0) {
      toast.error('Please enter a valid offer amount');
      return;
    }
    toast.success(`Offer of ${offerAmount} DHB submitted for ${profile?.handle || 'user'}`);
    setOfferDrawerOpen(false);
    setOfferAmount('');
  };

  const ShareOptions = () => (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleCopyProfileUrl}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Copy className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy profile URL</span>
      </button>
      <button
        onClick={handleCopyUsername}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <AtSign className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy username</span>
      </button>
      <button
        onClick={handleCopyAddress}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Wallet className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy address</span>
      </button>
      {!isViewingOwnProfile && (
        <>
          <button
            onClick={() => {
              toast.info('Messages coming soon');
              setShareSheetOpen(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-medium">Message</span>
          </button>
          <button
            onClick={handleSendCoins}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Send className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-medium">Send coins</span>
          </button>
          <button
            onClick={handleToggleNotifications}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-medium">Notify</span>
          </button>
          <button
            onClick={handleMakeOffer}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Handshake className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-medium">Make Offer</span>
          </button>
          {isFollowing && (
            <button
              onClick={handleUnfollow}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/20 hover:bg-red-500/20 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-red-500/20 backdrop-blur-sm flex items-center justify-center">
                <UserMinus className="w-4 h-4 text-red-400" />
              </div>
              <span className="text-red-400 font-medium">Unfollow</span>
            </button>
          )}
        </>
      )}
    </div>
  );

  const renderTabContent = () => {
    // Private account gate: show lock message if not following & not own profile
    if (isTargetPrivate && !isFollowing && !isViewingOwnProfile) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-zinc-500" />
          </div>
          <p className="text-white text-lg font-semibold">This account is private</p>
          <p className="text-zinc-500 text-sm mt-1 max-w-xs">
            {isPending 
              ? 'Your follow request is pending approval.'
              : 'Follow this account to see their posts and content.'}
          </p>
        </div>
      );
    }
    
    // Only show loading on initial fetch (no cached data) - not during refetches
    // isLoading = isFetching && !data, so it's only true when there's no cached data
    const hasData = userContentData && userContentData.pages && userContentData.pages.length > 0;
    const showLoading = isLoadingContent && !hasData;
    
    if (showLoading && ['home', 'posts', 'images', 'videos'].includes(activeTab)) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
          <p className="text-zinc-500 text-sm">Loading content...</p>
        </div>
      );
    }
    
    switch (activeTab) {
      case 'home':
        // Check if we have any content (including optimistic posts for own profile)
        const hasOptimisticPosts = isViewingOwnProfile && optimisticPosts.length > 0;
        
        if (ALL_CONTENT.length === 0 && !hasOptimisticPosts) {
          return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Home className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-lg font-medium">No posts yet</p>
              <p className="text-muted-foreground/70 text-sm mt-1">Content will appear here when posted</p>
            </div>
          );
        }
        // Filter optimistic posts - only remove when a MINTED match exists in API
        const filteredOptimisticPosts = isViewingOwnProfile 
          ? optimisticPosts.filter((op) => {
              // Only remove optimistic post if a matching MINTED post exists in API
              return !ALL_CONTENT.some((apiItem) => {
                // Must be minted status to replace the optimistic post
                const apiStatus = (apiItem.data as { status?: string }).status;
                if (apiStatus !== 'minted') return false;
                
                // Match by content for text posts
                if (op.type === 'post' && apiItem.type === 'post') {
                  const opData = op.data as TextPost;
                  const apiData = apiItem.data as TextPost;
                  return opData.content === apiData.content;
                }
                // Match by title/description for images
                if (op.type === 'image' && apiItem.type === 'image') {
                  const opData = op.data as ImagePost;
                  const apiData = apiItem.data as ImagePost;
                  return opData.title === apiData.title || opData.caption === apiData.caption;
                }
                // Match by title for videos
                if (op.type === 'video' && apiItem.type === 'video') {
                  const opData = op.data as VideoItem;
                  const apiData = apiItem.data as VideoItem;
                  return opData.title === apiData.title;
                }
                return false;
              });
            })
          : [];
        
        return (
          <div className="space-y-3">
            {/* Render optimistic posts first (only on own profile, deduplicated) */}
            {filteredOptimisticPosts.map((op) => {
              const card = op.type === 'post'
                ? <PostCard key={op.id} post={op.data as TextPost} />
                : op.type === 'image'
                ? <ImageCard key={op.id} post={op.data as ImagePost} />
                : <VideoCard key={op.id} video={op.data as VideoItem} />;
              return (
                <div key={op.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
                  {card}
                </div>
              );
            })}
            
            {/* Render API content */}
            {ALL_CONTENT.map((item) => {
              const card = item.type === 'post'
                ? <PostCard key={item.data.id} post={item.data as TextPost} />
                : item.type === 'image'
                ? <ImageCard key={item.data.id} post={item.data as ImagePost} />
                : <VideoCard key={item.data.id} video={item.data as VideoItem} />;
              return (
                <div key={item.data.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
                  {card}
                </div>
              );
            })}
          </div>
        );
      case 'posts':
        if (PROFILE_POSTS.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-lg font-medium">No text posts yet</p>
              <p className="text-muted-foreground/70 text-sm mt-1">Text posts will appear here</p>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            {PROFILE_POSTS.map((post) => (
              <div key={post.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
                <PostCard post={post} />
              </div>
            ))}
          </div>
        );
      case 'images':
        if (PROFILE_IMAGES.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Image className="w-12 h-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-lg font-medium">No images yet</p>
              <p className="text-zinc-500 text-sm mt-1">Image posts will appear here</p>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            {PROFILE_IMAGES.map((image) => (
              <div key={image.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
                <ImageCard post={image} />
              </div>
            ))}
          </div>
        );
      case 'videos':
        if (ALL_PROFILE_VIDEOS.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Film className="w-12 h-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-lg font-medium">No videos yet</p>
              <p className="text-zinc-500 text-sm mt-1">Video posts will appear here</p>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            {ALL_PROFILE_VIDEOS.map((video) => (
              <div key={video.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
                <VideoCard video={video} />
              </div>
            ))}
          </div>
        );
      case 'replies':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircle className="w-12 h-12 text-zinc-600 mb-3" />
            <p className="text-zinc-400 text-lg font-medium">No replies yet</p>
            <p className="text-zinc-500 text-sm mt-1">Replies to other posts will appear here</p>
          </div>
        );
      case 'subscribers':
        // Loading state
        if (isLoadingPlans) {
          return (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
              <p className="text-zinc-500 text-sm">Loading plans...</p>
            </div>
          );
        }
        
        // Own profile without plans - prompt to create
        if (isViewingOwnProfile && !hasPlans) {
          return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-md flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-yellow-400" />
              </div>
              <h3 className="text-white font-bold text-xl mb-2">Create Subscription Plans</h3>
              <p className="text-zinc-400 text-sm mb-6 max-w-xs">
                Monetize your content by creating subscription plans for your fans
              </p>
              <Button 
                onClick={() => setCreatePlanModalOpen(true)}
                className="rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-semibold gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Your First Plan
              </Button>
            </div>
          );
        }
        
        // Own profile with plans - show plan management
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
        
        // Viewing other's profile - no plans available
        if (!hasPlans) {
          return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Star className="w-12 h-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-lg font-medium">No subscription plans</p>
              <p className="text-zinc-500 text-sm mt-1">{profile?.name || 'This creator'} hasn't set up any plans yet</p>
            </div>
          );
        }
        
        // Viewing other's profile - show available plans
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
      case 'songs':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <img src={audio3dIcon} alt="Audio" className="w-16 h-16 mb-3" />
            <p className="text-zinc-400 text-lg font-medium">No audio yet</p>
            <p className="text-zinc-500 text-sm mt-1">Audio tracks will appear here</p>
          </div>
        );
      case 'live':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <img src={live3dIcon} alt="Live" className="w-16 h-16 mb-3" />
            <p className="text-zinc-400 text-lg font-medium">No live streams yet</p>
            <p className="text-zinc-500 text-sm mt-1">Live content will appear here</p>
          </div>
        );
      case 'fractions':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <img src={fractions3dIcon} alt="Fractions" className="w-16 h-16 mb-3" />
            <p className="text-zinc-400 text-lg font-medium">No fractions yet</p>
            <p className="text-zinc-500 text-sm mt-1">Fraction holdings will appear here</p>
          </div>
        );
      default:
        return null;
    }
  };

  // Determine if we need to wrap in AppLayout (when accessed via /:username route)
  const needsLayoutWrapper = !!routeUsername;

  // Show loading state
  if (isAuthLoading || isLoadingProfile) {
    const loadingContent = (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
    
    if (needsLayoutWrapper) {
      return <AppLayout>{loadingContent}</AppLayout>;
    }
    return loadingContent;
  }


  // Show "Username available" state when visiting /{username} route with no profile found
  if (!profile) {
    // If we're visiting a /{username} route, show the "Username available" prompt
    const isUsernameRoute = !!routeUsername;
    const displayUsername = routeUsername || '';
    
    const notFoundContent = (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-4 text-center">
        {isUsernameRoute && !isProfileError ? (
          <>
            <div className="w-20 h-20 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <AtSign className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Username available!</h2>
              <p className="text-zinc-400 max-w-md">
                Sign up today to claim <span className="text-white font-medium">dehub.io/{displayUsername}</span>
              </p>
            </div>
            <Button
              onClick={() => setLoginModalOpen(true)}
              className="h-12 px-8 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
            >
              Sign Up
            </Button>
            <LoginModal open={loginModalOpen} onOpenChange={setLoginModalOpen} />
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-xl bg-zinc-800 flex items-center justify-center">
              <AtSign className="w-10 h-10 text-zinc-500" />
            </div>
            <h2 className="text-xl font-bold text-white">Profile Not Found</h2>
            <p className="text-zinc-400 max-w-md">
              {isProfileError 
                ? "Unable to load profile. Please try again later."
                : "This user doesn't exist or you need to log in to view your profile."}
            </p>
          </>
        )}
      </div>
    );
    
    if (needsLayoutWrapper) {
      return <AppLayout>{notFoundContent}</AppLayout>;
    }
    return notFoundContent;
  }


  const profileContent = (
    <div 
      ref={profileContainerRef}
      className="min-h-screen"
      onTouchStart={pullHandlers.onTouchStart}
      onTouchMove={pullHandlers.onTouchMove}
      onTouchEnd={pullHandlers.onTouchEnd}
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
      
      {/* Refreshing indicator */}
      {isRefreshing && pullDistance === 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
      )}
      
      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
        {/* Back button - show when navigated from another page (not direct URL access) */}
        {location.key !== 'default' && (
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="rounded-xl text-white hover:bg-white/10 gap-2 px-3"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Back</span>
            </Button>
          </div>
        )}
        
        {/* Profile Card Bento */}
        <div className="bg-zinc-900 rounded-2xl overflow-hidden relative">
          
          {/* Cover Photo - clickable for fullscreen, uses default banner if no custom cover */}
          <button 
            className="aspect-[3/1] bg-zinc-800 w-full cursor-pointer hover:opacity-95 transition-opacity"
            onClick={() => setFullscreenImage(profile.coverUrl || getDefaultBanner(profile.walletAddress))}
          >
            <img 
              src={profile.coverUrl || getDefaultBanner(profile.walletAddress)} 
              alt="Cover" 
              className="w-full h-full object-cover" 
            />
          </button>
          
          {/* Profile Content */}
          <div className="px-4 sm:px-6 pb-4">
            {/* Avatar - positioned to overlap banner, clickable for story or fullscreen */}
            <div className="relative -mt-12 sm:-mt-14 mb-4 flex items-end justify-between">
              <div className="relative">
              {hasStories ? (
                  <div className="relative">
                    <ShimmerBorder active={hasUnwatchedStories} className="w-24 h-24 sm:w-28 sm:h-28">
                      <div 
                        className="w-full h-full rounded-[10px] bg-zinc-900 overflow-hidden relative group"
                        onClick={() => setShowAvatarOverlay(prev => !prev)}
                      >
                        {profile.avatarUrl ? (
                          <img 
                            src={profile.avatarUrl} 
                            alt={profile.name} 
                            className="w-full h-full rounded-[10px] object-cover"
                          />
                        ) : (
                          <UserAvatar 
                            name={profile.name} 
                            handle={profile.handle} 
                            size="lg" 
                            className="w-full h-full rounded-[10px]"
                          />
                        )}
                        {/* Liquid glass overlay - desktop: hover, mobile: tap toggle */}
                        <div className={cn(
                          "absolute inset-0 flex overflow-hidden transition-all duration-200",
                          "opacity-0 pointer-events-none",
                          "md:group-hover:opacity-100 md:group-hover:pointer-events-auto",
                          showAvatarOverlay && "opacity-100 !pointer-events-auto"
                        )}>
                          <button
                            className="flex-1 flex items-center justify-center bg-black/40 backdrop-blur-md border-r border-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAvatarOverlay(false);
                              profileStories.forEach(s => markWatched(s.id));
                              setIsStoryViewerOpen(true);
                            }}
                          >
                            <Play className="w-5 h-5 text-white drop-shadow-lg" fill="white" />
                          </button>
                          <button
                            className="flex-1 flex items-center justify-center bg-black/40 backdrop-blur-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAvatarOverlay(false);
                              if (profile.avatarUrl) setFullscreenImage(profile.avatarUrl);
                            }}
                            disabled={!profile.avatarUrl}
                          >
                            <Image className="w-5 h-5 text-white drop-shadow-lg" />
                          </button>
                        </div>
                      </div>
                    </ShimmerBorder>
                    {/* Dismiss overlay on outside tap (mobile) */}
                    {showAvatarOverlay && (
                      <div className="fixed inset-0 z-[-1] md:hidden" onClick={() => setShowAvatarOverlay(false)} />
                    )}
                  </div>
                ) : (
                  <button 
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-zinc-900 p-1 cursor-pointer hover:opacity-95 transition-opacity disabled:cursor-default"
                    onClick={() => profile.avatarUrl && setFullscreenImage(profile.avatarUrl)}
                    disabled={!profile.avatarUrl}
                  >
                    {profile.avatarUrl ? (
                      <img 
                        src={profile.avatarUrl} 
                        alt={profile.name} 
                        className="w-full h-full rounded-lg object-cover"
                      />
                    ) : (
                      <UserAvatar 
                        name={profile.name} 
                        handle={profile.handle} 
                        size="lg" 
                        className="w-full h-full rounded-lg"
                      />
                    )}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isViewingOwnProfile ? (
                  <Button
                    variant="outline" 
                    size="sm" 
                    className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent gap-2"
                    onClick={() => navigate('/app/settings')}
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Profile
                  </Button>
                ) : (
                  <>
                    {/* Show Requested button for pending follow requests */}
                    {isPending && !isFollowing && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="rounded-xl border-zinc-600 text-zinc-300 gap-2 cursor-default"
                        disabled
                      >
                        <Clock className="w-4 h-4" />
                        Requested
                      </Button>
                    )}
                    {/* Show Follow button if not following and not pending */}
                    {!isFollowing && !isPending && (
                      <Button 
                        size="sm" 
                        className="rounded-xl bg-white text-black hover:bg-zinc-200 gap-2"
                        onClick={handleFollow}
                        disabled={isFollowLoading}
                      >
                        {isFollowLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserPlus className="w-4 h-4" />
                        )}
                        {isTargetPrivate ? 'Request' : 'Follow'}
                      </Button>
                    )}
                    {isFollowing && !isSubscribed && hasPlans && (
                      <Button 
                        size="sm" 
                        className="rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white gap-2"
                        onClick={() => setActiveTab('subscribers')}
                      >
                        <Star className="w-4 h-4" />
                        Subscribe
                      </Button>
                    )}
                    {isFollowing && isSubscribed && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="rounded-xl border-green-500/50 text-green-400 gap-2 cursor-default"
                        disabled
                      >
                        <Star className="w-4 h-4" />
                        Subscribed
                      </Button>
                    )}
                  </>
                )}
                <Drawer open={shareSheetOpen} onOpenChange={setShareSheetOpen}>
                  <DrawerTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent h-9 w-9"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent glass className="px-4 pb-8">
                    <DrawerHeader className="sr-only">
                      <DrawerTitle>Profile Options</DrawerTitle>
                    </DrawerHeader>
                    <ShareOptions />
                  </DrawerContent>
                </Drawer>
              </div>
            </div>

            {/* Profile Info */}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                {isTargetPrivate && !isViewingOwnProfile && (
                  <Lock className="w-4 h-4 text-zinc-500" />
                )}
                <button
                  onClick={() => {
                    const username = profile.handle.replace('@', '');
                    navigator.clipboard.writeText(`https://dehub.io/${username}`);
                    toast.success('Profile URL copied to clipboard');
                  }}
                  className="text-zinc-500 text-lg hover:text-zinc-300 transition-colors"
                >
                  {profile.handle}
                </button>
                {profile.verified && <VerifiedBadge className="w-5 h-5" />}
                {!isViewingOwnProfile && apiProfile?.followsYou && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">
                    Follows you
                  </span>
                )}
              </div>
              
              {profile.walletAddress && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(profile.walletAddress!);
                    toast.success('Address copied to clipboard');
                  }}
                  className="flex items-center gap-1.5 mt-1 text-zinc-500 text-sm hover:text-zinc-300 transition-colors group"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span className="font-mono">
                    {profile.walletAddress.slice(0, 6)}...{profile.walletAddress.slice(-4)}
                  </span>
                  <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              
              {profile.bio && (
                <p className="mt-3 text-white/90 text-sm sm:text-base">{profile.bio}</p>
              )}
              
              <div className="flex items-center gap-2 mt-3 text-zinc-500 text-sm">
                <Calendar className="w-4 h-4" />
                <span>Joined {profile.joinedDate}</span>
              </div>
              
              {/* Show followers/following section based on privacy settings */}
              {/* Privacy modes: public (clickable), counts-only (visible not clickable), hidden (not shown) */}
              {(!hideFollowerCounts || isViewingOwnProfile) && (
                <div className="flex items-center gap-4 mt-3">
                  {/* Following count */}
                  {(showFollowersFollowing || isViewingOwnProfile) ? (
                    <button 
                      onClick={() => {
                        setFollowListType('following');
                        setFollowListDrawerOpen(true);
                      }}
                      className="hover:underline"
                    >
                      <span className="font-bold text-white">{profile.following.toLocaleString()}</span>
                      <span className="text-zinc-500 ml-1">Following</span>
                    </button>
                  ) : (
                    <div>
                      <span className="font-bold text-white">{profile.following.toLocaleString()}</span>
                      <span className="text-zinc-500 ml-1">Following</span>
                    </div>
                  )}
                  {/* Followers count */}
                  {(showFollowersFollowing || isViewingOwnProfile) ? (
                    <button 
                      onClick={() => {
                        setFollowListType('followers');
                        setFollowListDrawerOpen(true);
                      }}
                      className="hover:underline"
                    >
                      <span className="font-bold text-white">{profile.followers.toLocaleString()}</span>
                      <span className="text-zinc-500 ml-1">Followers</span>
                    </button>
                  ) : (
                    <div>
                      <span className="font-bold text-white">{profile.followers.toLocaleString()}</span>
                      <span className="text-zinc-500 ml-1">Followers</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Profile Tabs Bento */}
        <div className="bg-zinc-900 rounded-2xl p-2 relative">
          <div className="flex overflow-x-auto scrollbar-hide">
            {PROFILE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors min-w-[60px]',
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-white'
                )}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{tab.count}</span>
              </button>
            ))}
          </div>
          {/* Right fade indicator */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none rounded-r-2xl" />
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>

      {/* Make Offer Drawer */}
      <Drawer open={offerDrawerOpen} onOpenChange={setOfferDrawerOpen}>
        <DrawerContent glass className="px-4 pb-8">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-white">Make Offer for {profile.handle}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">
              Enter the amount of DHB tokens you'd like to offer to acquire this username.
            </p>
            
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
              </div>
              <Input
                type="number"
                placeholder="0"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                className="pl-10 pr-14 bg-zinc-800 border-zinc-700 text-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium">
                DHB
              </span>
            </div>
            
            <Button 
              onClick={handleSubmitOffer}
              className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white"
            >
              Submit Offer
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Fullscreen image viewer for avatar/banner */}
      <FullscreenImageViewer
        images={fullscreenImage ? [fullscreenImage] : []}
        initialIndex={0}
        isOpen={!!fullscreenImage}
        onClose={() => setFullscreenImage(null)}
      />
      
      {/* Create Plan Modal */}
      <CreatePlanModal
        open={createPlanModalOpen}
        onOpenChange={setCreatePlanModalOpen}
      />

      {/* Edit Plan Modal */}
      {editingPlan && (
        <EditPlanModal
          open={!!editingPlan}
          onOpenChange={(open) => { if (!open) setEditingPlan(null); }}
          plan={editingPlan}
        />
      )}

      <FollowersListDrawer
        open={followListDrawerOpen}
        onOpenChange={setFollowListDrawerOpen}
        profileAddress={apiProfile?.walletAddress || ''}
        title={followListType === 'followers' ? 'Followers' : 'Following'}
      />
      
      {/* Story Viewer Modal - opens when clicking avatar with stories */}
      <StoryViewerModal
        isOpen={isStoryViewerOpen}
        onClose={() => setIsStoryViewerOpen(false)}
        stories={allStories}
        initialIndex={profileStoryStartIndex}
        onStoryWatched={markWatched}
      />
    </div>
  );

  // Wrap in AppLayout if accessed via /:username route
  if (needsLayoutWrapper) {
    return <AppLayout>{profileContent}</AppLayout>;
  }

  return profileContent;
}
