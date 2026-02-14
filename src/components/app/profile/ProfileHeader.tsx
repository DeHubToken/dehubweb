import { 
  UserPlus, Pencil, Copy, Wallet, Star, Play, Lock, Clock, Plus, Image, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/app/UserAvatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { ShimmerBorder } from '@/components/app/stories/ShimmerBorder';
import { TranslatableText } from '@/components/app/TranslatableText';
import { BioTranslateButton } from '@/components/app/profile/BioTranslateButton';
import { MutualFollowers } from '@/components/app/profile/MutualFollowers';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DISPLAY_WALLET_OVERRIDES, getDefaultBanner, type TabValue } from './ProfileConstants';
import type { ProfileData } from '@/hooks/use-dehub-profile';
import { useNavigate } from 'react-router-dom';

interface ProfileHeaderProps {
  profile: ProfileData;
  apiProfile: ProfileData | undefined;
  isViewingOwnProfile: boolean | undefined;
  isAuthenticated: boolean;
  badgeUrl: string | null;
  // Follow state
  isFollowing: boolean;
  isPending: boolean;
  isTargetPrivate: boolean;
  isFollowLoading: boolean;
  handleFollow: () => void;
  // Subscriptions
  isSubscribed: boolean;
  hasPlans: boolean;
  // Stories
  hasStories: boolean;
  hasUnwatchedStories: boolean;
  profileStories: Array<{ id: string }>;
  markWatched: (id: string) => void;
  // Avatar overlay
  showAvatarOverlay: boolean;
  setShowAvatarOverlay: (v: boolean | ((prev: boolean) => boolean)) => void;
  // Actions
  setFullscreenImage: (url: string | null) => void;
  setActiveTab: (tab: TabValue) => void;
  setIsStoryViewerOpen: (open: boolean) => void;
  // Share sheet
  shareSheetOpen: boolean;
  setShareSheetOpen: (open: boolean) => void;
  setLoginModalOpen: (open: boolean) => void;
  // Options drawer content
  ShareOptions: React.ComponentType;
  // Privacy
  showFollowersFollowing: boolean;
  hideFollowerCounts: boolean;
  // Followers list
  setFollowListType: (type: 'followers' | 'following') => void;
  setFollowListDrawerOpen: (open: boolean) => void;
  // Bio translation
  translatedBio: string | null;
  setTranslatedBio: (bio: string | null) => void;
}

export function ProfileHeader({
  profile,
  apiProfile,
  isViewingOwnProfile,
  isAuthenticated,
  badgeUrl,
  isFollowing,
  isPending,
  isTargetPrivate,
  isFollowLoading,
  handleFollow,
  isSubscribed,
  hasPlans,
  hasStories,
  hasUnwatchedStories,
  profileStories,
  markWatched,
  showAvatarOverlay,
  setShowAvatarOverlay,
  setFullscreenImage,
  setActiveTab,
  setIsStoryViewerOpen,
  shareSheetOpen,
  setShareSheetOpen,
  setLoginModalOpen,
  ShareOptions,
  showFollowersFollowing,
  hideFollowerCounts,
  setFollowListType,
  setFollowListDrawerOpen,
  translatedBio,
  setTranslatedBio,
}: ProfileHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden relative">
      {/* Cover Photo */}
      <button 
        className="aspect-[3/1] bg-zinc-800 w-full cursor-pointer"
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
        {/* Avatar */}
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
                    {/* Liquid glass overlay */}
                    <div className={cn(
                      "absolute inset-0 flex overflow-hidden rounded-[10px] transition-all duration-200",
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
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-zinc-900 p-1 cursor-pointer disabled:cursor-default"
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
            <Drawer open={shareSheetOpen} onOpenChange={(open) => {
              if (!isAuthenticated && open) {
                setLoginModalOpen(true);
                return;
              }
              setShareSheetOpen(open);
            }}>
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
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex items-baseline">
                <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                {badgeUrl && (
                  <img 
                    src={badgeUrl} 
                    alt="Badge tier" 
                    className="w-[12px] h-[12px] shrink-0 absolute -top-1 -right-3.5" 
                  />
                )}
              </span>
              {isTargetPrivate && !isViewingOwnProfile && (
                <Lock className="w-4 h-4 text-zinc-500" />
              )}
            </div>
            <div className="flex items-center gap-2">
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
          </div>
          
          {profile.walletAddress && (() => {
            const displayAddr = DISPLAY_WALLET_OVERRIDES[profile.walletAddress!.toLowerCase()] || profile.walletAddress!;
            return (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(displayAddr);
                  toast.success('Address copied to clipboard');
                }}
                className="flex items-center gap-1.5 mt-1 text-zinc-500 text-sm hover:text-zinc-300 transition-colors group"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span className="font-mono">
                  {displayAddr.slice(0, 6)}...{displayAddr.slice(-4)}
                </span>
                <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })()}
          
          {profile.bio && (
            <TranslatableText text={translatedBio || profile.bio} className="mt-3 text-white/90 text-sm sm:text-base block" as="p" />
          )}
          
          <div className="flex items-center gap-2 mt-3 text-zinc-500 text-sm">
            <span>Joined {profile.joinedDate}</span>
            {profile.bio && !isViewingOwnProfile && (
              <BioTranslateButton
                bio={profile.bio}
                isTranslated={!!translatedBio}
                onTranslated={(t) => setTranslatedBio(t)}
                onShowOriginal={() => setTranslatedBio(null)}
              />
            )}
          </div>
          
          {/* Followers/Following */}
          {(!hideFollowerCounts || isViewingOwnProfile) && (
            <div className="flex items-center gap-4 mt-3">
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

          {/* Mutual followers */}
          {!isViewingOwnProfile && (
            <MutualFollowers profileAddress={apiProfile?.walletAddress} />
          )}
        </div>
      </div>
    </div>
  );
}
