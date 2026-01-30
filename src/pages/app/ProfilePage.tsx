import { useState, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { 
  Home, MessageCircle, Image, Video, Star, Play, Radio,
  Calendar, UserPlus, UserMinus, Copy, AtSign, Wallet, Send, Plus, Bell, Lock, CreditCard, PieChart, Tag, Handshake, Loader2, Film, LogOut, Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/app/UserAvatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { PostCard } from '@/components/app/cards/PostCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { AppLayout } from '@/components/app/AppLayout';
import { FullscreenImageViewer } from '@/components/app/cards/FullscreenImageViewer';
import { cn } from '@/lib/utils';
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
import { followUser, unfollowUser } from '@/lib/api/dehub';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';
import dehubCoin from '@/assets/dehub-coin.png';

type TabValue = 'home' | 'replies' | 'images' | 'videos' | 'subscribers' | 'songs' | 'live' | 'fractions';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { username: routeUsername } = useParams<{ username: string }>();
  const userId = searchParams.get('id');
  const { user: currentUser, walletAddress: currentWalletAddress, isAuthenticated, isLoading: isAuthLoading, disconnect } = useAuth();
  
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
  const {
    data: userContentData,
    isLoading: isLoadingContent,
  } = useDeHubUserContent({
    userId: apiProfile?.walletAddress,
    enabled: !!apiProfile?.walletAddress,
  });
  
  // Determine which profile to show - no more mock fallback
  const profile = apiProfile;
  // Check if viewing own profile: no route username AND (no query ID OR query ID matches current user)
  const isOwnProfile = !routeUsername && (!userId || (currentUser?.address === userId) || (currentWalletAddress === userId));
  // Also check if profile wallet matches current user's wallet (for /{username} routes)
  const isViewingOwnProfile = isOwnProfile || (apiProfile?.walletAddress && apiProfile.walletAddress.toLowerCase() === currentWalletAddress?.toLowerCase());
  
  // Process API content - no mock fallback
  const { PROFILE_POSTS, PROFILE_IMAGES, ALL_PROFILE_VIDEOS } = useMemo(() => {
    if (!userContentData?.pages) {
      return { PROFILE_POSTS: [], PROFILE_IMAGES: [], ALL_PROFILE_VIDEOS: [] };
    }
    const allNFTs = userContentData.pages.flatMap(page => page.data || []);
    const separated = separateUserContent(allNFTs);
    return { 
      PROFILE_POSTS: separated.posts,
      PROFILE_IMAGES: separated.images, 
      ALL_PROFILE_VIDEOS: separated.videos 
    };
  }, [userContentData]);
  
  const PROFILE_TABS: { icon: typeof Home; label: string; value: TabValue; count: number }[] = [
    { icon: Home, label: 'All', value: 'home', count: PROFILE_POSTS.length + PROFILE_IMAGES.length + ALL_PROFILE_VIDEOS.length },
    { icon: Star, label: 'Subs', value: 'subscribers', count: 0 },
    { icon: MessageCircle, label: 'Replies', value: 'replies', count: 0 },
    { icon: Image, label: 'Images', value: 'images', count: PROFILE_IMAGES.length },
    { icon: Video, label: 'Videos', value: 'videos', count: ALL_PROFILE_VIDEOS.length },
    { icon: Play, label: 'Songs', value: 'songs', count: 0 },
    { icon: Radio, label: 'Live', value: 'live', count: 0 },
    { icon: PieChart, label: 'Fractions', value: 'fractions', count: 0 },
  ];
  
  const [activeTab, setActiveTab] = useState<TabValue>('home');
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [offerDrawerOpen, setOfferDrawerOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  
  // Use API's isFollowing status
  const isFollowing = apiProfile?.isFollowing ?? false;

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
      toast.error('Failed to unfollow. Please try again.');
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
    // Optimistic update
    setFollowStatus(true);
    
    try {
      await followUser(profile.walletAddress);
      toast.success(`Following ${profile.name}`);
    } catch (error) {
      // Revert on error
      setFollowStatus(false);
      toast.error('Failed to follow. Please try again.');
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
    // Show loading state for content tabs
    if (isLoadingContent && ['home', 'images', 'videos'].includes(activeTab)) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
          <p className="text-zinc-500 text-sm">Loading content...</p>
        </div>
      );
    }
    
    const hasNoContent = PROFILE_POSTS.length === 0 && PROFILE_IMAGES.length === 0 && ALL_PROFILE_VIDEOS.length === 0;
    
    switch (activeTab) {
      case 'home':
        if (hasNoContent) {
          return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Home className="w-12 h-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-lg font-medium">No posts yet</p>
              <p className="text-zinc-500 text-sm mt-1">Content will appear here when posted</p>
            </div>
          );
        }
        return (
          <div className="space-y-2 sm:space-y-3">
            {PROFILE_POSTS.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
            {PROFILE_IMAGES.map((image) => (
              <ImageCard key={image.id} post={image} />
            ))}
            {ALL_PROFILE_VIDEOS.map((video) => (
              <VideoCard key={video.id} video={video} />
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
          <div className="space-y-2 sm:space-y-3">
            {PROFILE_IMAGES.map((image) => (
              <ImageCard key={image.id} post={image} />
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
          <div className="space-y-2 sm:space-y-3">
            {ALL_PROFILE_VIDEOS.map((video) => (
              <VideoCard key={video.id} video={video} />
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
        return (
          <div className="space-y-2 sm:space-y-3">
            {!isSubscribed ? (
              <div className="relative min-h-[300px] rounded-2xl overflow-hidden">
                {/* Blurred content preview */}
                <div className="blur-lg pointer-events-none select-none">
                  {(PROFILE_IMAGES.length > 0 ? PROFILE_IMAGES.slice(0, 2) : ALL_PROFILE_VIDEOS.slice(0, 2)).map((item) => (
                    <div key={`sub-blur-${item.id}`} className="mb-2">
                      {'image' in item ? <ImageCard post={item as ImagePost} /> : <VideoCard video={item as VideoItem} />}
                    </div>
                  ))}
                  {/* Fallback if no content to blur */}
                  {PROFILE_IMAGES.length === 0 && ALL_PROFILE_VIDEOS.length === 0 && (
                    <div className="h-[300px] bg-zinc-800/50" />
                  )}
                </div>
                {/* Subscribe overlay - positioned within container */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="text-center p-6">
                    <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto mb-4">
                      <Lock className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-white font-bold text-xl mb-2">Subscribers Only</h3>
                    <p className="text-zinc-400 text-sm mb-4 max-w-xs">
                      Subscribe to {profile?.name || 'this creator'} to unlock exclusive content
                    </p>
                    <Button 
                      onClick={() => {
                        setIsSubscribed(true);
                        toast.success(`Subscribed to ${profile?.name || 'creator'}!`);
                      }}
                      className="rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      Subscribe
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {PROFILE_IMAGES.slice(0, 5).map((image) => (
                  <ImageCard key={`sub-${image.id}`} post={image} />
                ))}
                {ALL_PROFILE_VIDEOS.slice(0, 5).map((video) => (
                  <VideoCard key={`sub-${video.id}`} video={video} />
                ))}
              </>
            )}
          </div>
        );
      case 'songs':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Play className="w-12 h-12 text-zinc-600 mb-3" />
            <p className="text-zinc-400 text-lg font-medium">No songs yet</p>
            <p className="text-zinc-500 text-sm mt-1">Audio tracks will appear here</p>
          </div>
        );
      case 'live':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Radio className="w-12 h-12 text-zinc-600 mb-3" />
            <p className="text-zinc-400 text-lg font-medium">No live streams yet</p>
            <p className="text-zinc-500 text-sm mt-1">Live content will appear here</p>
          </div>
        );
      case 'fractions':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <PieChart className="w-12 h-12 text-zinc-600 mb-3" />
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

  // Show error/not found state when profile is undefined
  if (!profile) {
    const notFoundContent = (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center">
          <AtSign className="w-10 h-10 text-zinc-500" />
        </div>
        <h2 className="text-xl font-bold text-white">Profile Not Found</h2>
        <p className="text-zinc-400 max-w-md">
          {isProfileError 
            ? "Unable to load profile. Please try again later."
            : "This user doesn't exist or you need to log in to view your profile."}
        </p>
      </div>
    );
    
    if (needsLayoutWrapper) {
      return <AppLayout>{notFoundContent}</AppLayout>;
    }
    return notFoundContent;
  }

  const handleLogout = async () => {
    try {
      await disconnect();
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  const profileContent = (
    <div className="min-h-screen">
      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
        {/* Profile Card Bento */}
        <div className="bg-zinc-900 rounded-2xl overflow-hidden relative">
          {/* Logout button - top right, only on own profile */}
          {isViewingOwnProfile && isAuthenticated && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="absolute top-3 right-3 z-10 rounded-xl bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white gap-2 px-3"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          )}
          
          {/* Cover Photo - clickable for fullscreen */}
          {profile.coverUrl ? (
            <button 
              className="aspect-[3/1] bg-zinc-800 w-full cursor-pointer hover:opacity-95 transition-opacity"
              onClick={() => setFullscreenImage(profile.coverUrl!)}
            >
              <img src={profile.coverUrl} alt="Cover" className="w-full h-full object-cover" />
            </button>
          ) : (
            <div className="aspect-[3/1] bg-gradient-to-br from-purple-900/50 via-zinc-800 to-blue-900/50" />
          )}
          
          {/* Profile Content */}
          <div className="px-4 sm:px-6 pb-4">
            {/* Avatar - positioned to overlap banner, clickable for fullscreen */}
            <div className="relative -mt-12 sm:-mt-14 mb-4 flex items-end justify-between">
              <div className="relative">
                <button 
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-zinc-900 p-1 cursor-pointer hover:opacity-95 transition-opacity disabled:cursor-default"
                  onClick={() => profile.avatarUrl && setFullscreenImage(profile.avatarUrl)}
                  disabled={!profile.avatarUrl}
                >
                  {profile.avatarUrl ? (
                    <img 
                      src={profile.avatarUrl} 
                      alt={profile.name} 
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <UserAvatar 
                      name={profile.name} 
                      handle={profile.handle} 
                      size="lg" 
                      className="w-full h-full rounded-full"
                    />
                  )}
                </button>
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
                    {!isFollowing && (
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
                        Follow
                      </Button>
                    )}
                    {isFollowing && !isSubscribed && (
                      <Button 
                        size="sm" 
                        className="rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white gap-2"
                        onClick={() => {
                          setIsSubscribed(true);
                          toast.success(`Subscribed to ${profile.name}!`);
                        }}
                      >
                        <Star className="w-4 h-4" />
                        Subscribe
                      </Button>
                    )}
                    {isFollowing && isSubscribed && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="rounded-xl border-red-500/50 text-red-400 hover:bg-red-500/10 gap-2"
                        onClick={() => {
                          setIsSubscribed(false);
                          toast.success(`Unsubscribed from ${profile.name}`);
                        }}
                      >
                        <Star className="w-4 h-4" />
                        Unsubscribe
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
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                {profile.verified && <VerifiedBadge className="w-5 h-5" />}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-zinc-500">{profile.handle}</p>
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
              
              <div className="flex items-center gap-4 mt-3">
                <button className="hover:underline">
                  <span className="font-bold text-white">{profile.following.toLocaleString()}</span>
                  <span className="text-zinc-500 ml-1">Following</span>
                </button>
                <button className="hover:underline">
                  <span className="font-bold text-white">{profile.followers.toLocaleString()}</span>
                  <span className="text-zinc-500 ml-1">Followers</span>
                </button>
              </div>
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
    </div>
  );

  // Wrap in AppLayout if accessed via /:username route
  if (needsLayoutWrapper) {
    return <AppLayout>{profileContent}</AppLayout>;
  }

  return profileContent;
}
