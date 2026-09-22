import {
  UserPlus, Pencil, Copy, Wallet, Star, Clock, Plus, Loader2, Check, Ban, MessageSquare
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeAscension } from '@/components/app/BadgeAscension';
import { useBadgeCeremony } from '@/hooks/use-badge-ceremony';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/app/UserAvatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { TranslatableText, hasTranslatableText } from '@/components/app/TranslatableText';
import { BioTranslateButton } from '@/components/app/profile/BioTranslateButton';
import { ProfileSocialLinks } from '@/components/app/profile/ProfileSocialLinks';
import { TotalReachPill } from '@/components/app/profile/TotalReachPill';
import { MutualFollowers } from '@/components/app/profile/MutualFollowers';
import { StreamerLevelCard } from '@/components/app/live/StreamerLevelCard';
import { PinnedCommunities } from '@/components/app/communities/PinnedCommunities';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { isBigBadgeUrl } from '@/lib/staking-badges';
import { buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import { OnboardingCompleteChip } from '@/components/app/OnboardingCompleteChip';
import { BadgePatronChip } from '@/components/app/BadgePatronChip';
import { toast } from 'sonner';
import { DISPLAY_WALLET_OVERRIDES, getDefaultBanner, type TabValue } from './ProfileConstants';
import type { ProfileData } from '@/hooks/use-dehub-profile';
import { useNavigate } from 'react-router-dom';
import { openDmDock } from '@/hooks/use-dm-dock';

interface ProfileHeaderProps {
  profile: ProfileData;
  apiProfile: ProfileData | undefined;
  isViewingOwnProfile: boolean | undefined;
  isAuthenticated: boolean;
  badgeUrl: string | null;
  /** Tier by name, for the ascension ceremony. */
  badgeTier?: string | null;
  /** DHB behind that tier, printed under the threshold during the ceremony. */
  badgeBalance?: number | string | null;
  // Follow state
  isFollowing: boolean;
  isPending: boolean;
  isTargetPrivate: boolean;
  isFollowLoading: boolean;
  handleFollow: () => void;
  handleUnfollow: () => void;
  // Subscriptions
  isSubscribed: boolean;
  hasPlans: boolean;
  // Actions
  setFullscreenImage: (url: string | null) => void;
  setActiveTab: (tab: TabValue) => void;
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
  // Block state
  isBlocked?: boolean;
  isFetchingProfile?: boolean;
}

export function ProfileHeader({
  profile,
  apiProfile,
  isViewingOwnProfile,
  isAuthenticated,
  badgeUrl,
  badgeTier,
  badgeBalance,
  isFollowing,
  isPending,
  isTargetPrivate,
  isFollowLoading,
  handleFollow,
  handleUnfollow,
  isSubscribed,
  hasPlans,
  setFullscreenImage,
  setActiveTab,
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
  isBlocked = false,
  isFetchingProfile = false,
}: ProfileHeaderProps) {
  const navigate = useNavigate();

  const { t } = useTranslation();
  const messageSettings = (apiProfile as (ProfileData & {
    dmSettings?: { disables?: string[] } | Array<{ disables?: string[] }>;
    dmSetting?: { disables?: string[] } | Array<{ disables?: string[] }>;
  }) | undefined)?.dmSettings ?? (apiProfile as (ProfileData & {
    dmSetting?: { disables?: string[] } | Array<{ disables?: string[] }>;
  }) | undefined)?.dmSetting;
  const dmDisables = Array.isArray(messageSettings)
    ? messageSettings[0]?.disables
    : messageSettings?.disables;
  // NEW_DM closes new conversations as well as ALL. Existing threads remain
  // available in Messages, but this profile control always starts a new one.
  const canStartDirectMessage = !dmDisables?.some((value) => {
    const status = value.toUpperCase();
    return status === 'ALL' || status === 'NEW_DM';
  });
  const openDirectMessage = () => {
    if (!isAuthenticated) {
      setLoginModalOpen(true);
      return;
    }
    const address = apiProfile?.walletAddress ?? profile.walletAddress;
    if (!address) return;
    openDmDock({
      address,
      username: profile.handle?.replace('@', ''),
      displayName: profile.name,
      avatarUrl: profile.avatarUrl,
    });
  };
  // Badge ascension — own profile only, and only ever on the way up. The slot
  // ref is what the ceremony flies out of and returns to.
  const badgeSlotRef = useRef<HTMLSpanElement>(null);
  const { ceremony, dismiss } = useBadgeCeremony({
    enabled: !!isViewingOwnProfile,
    address: apiProfile?.walletAddress ?? profile.walletAddress,
    tier: badgeTier,
  });

  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarCdnFailed, setAvatarCdnFailed] = useState(false);
  const cdnFallbackUrl = buildAvatarCdnFallbackUrl(profile.walletAddress || '', profile.avatarUrl);

  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] overflow-hidden relative">
      {ceremony && (
        <BadgeAscension
          from={ceremony.from}
          to={ceremony.to}
          anchor={badgeSlotRef.current}
          balance={typeof badgeBalance === 'string' ? Number(badgeBalance) : badgeBalance}
          onDone={dismiss}
        />
      )}
      {/* Cover Photo */}
      {isFetchingProfile && !profile.coverUrl ? (
        <Skeleton className="aspect-[3/1] w-full bg-white/[0.06] rounded-none" />
      ) : (
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
      )}
      
      {/* Profile Content */}
      <div className="px-4 sm:px-6 pb-4">
        {/* Avatar */}
        <div className="relative -mt-12 sm:-mt-14 mb-1.5 flex items-end justify-between">
          <div className="relative">
              <button 
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-zinc-900 p-1 cursor-pointer disabled:cursor-default"
                onClick={() => profile.avatarUrl && setFullscreenImage(profile.avatarUrl)}
                disabled={!profile.avatarUrl}
              >
                {profile.avatarUrl && !avatarCdnFailed ? (
                  <img
                    src={avatarFailed ? cdnFallbackUrl : profile.avatarUrl}
                    alt={profile.name}
                    className="w-full h-full rounded-lg object-cover aspect-square"
                    onError={() => avatarFailed ? setAvatarCdnFailed(true) : setAvatarFailed(true)}
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
          </div>
          <div className="flex items-center gap-2">
              {isViewingOwnProfile ? (
                <Button
                  variant="glass"
                  size="sm"
                  className="rounded-xl gap-2"
                  onClick={() => navigate('/app/settings')}
                >
                  <Pencil className="w-4 h-4" />
                  Edit Profile
                </Button>
              ) : isBlocked ? (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="rounded-xl border-red-500/50 text-red-400 gap-2 cursor-default"
                  disabled
                >
                  <Ban className="w-4 h-4" />
                  Blocked
                </Button>
              ) : isFetchingProfile && profile.isFollowing == null && profile.isPending == null ? (
                <Skeleton className="h-9 w-24 rounded-xl bg-white/10" />
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
                      variant="glass"
                      className="rounded-xl gap-2"
                      onClick={handleFollow}
                      disabled={isFollowLoading}
                    >
                      {isFollowLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      {isTargetPrivate ? 'Request' : apiProfile?.followsYou ? 'Follow Back' : 'Follow'}
                    </Button>
                  )}
                  {isFollowing && (
                    <Button 
                      size="sm" 
                      variant="glass"
                      className="rounded-xl gap-2"
                      onClick={() => setShowUnfollowConfirm(true)}
                      disabled={isFollowLoading}
                    >
                      {isFollowLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {t('profile.following')}
                    </Button>
                  )}
                  {/* Subscribing is not downstream of following: a creator who
                      has published a plan sells to anyone, so this renders on
                      the strength of `hasPlans` alone. It jumps to the Subs tab
                      AND scrolls the tabs pill up to it — the header is a
                      screenful tall, so switching the tab silently reads as a
                      dead button. */}
                  {!isSubscribed && hasPlans && (
                    <Button
                      size="sm"
                      className="rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white gap-2"
                      onClick={() => {
                        setActiveTab('subscribers');
                        requestAnimationFrame(() => {
                          document
                            .querySelector('[data-feed-nav-outer]')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        });
                      }}
                    >
                      <Star className="w-4 h-4" />
                      Subscribe Now
                    </Button>
                  )}
                  {isSubscribed && (
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
              {!isViewingOwnProfile && !isBlocked && canStartDirectMessage && (
                <Button
                  variant="glass"
                  size="icon"
                  className="rounded-xl h-9 w-9"
                  onClick={openDirectMessage}
                  aria-label={t('messages.message', 'Message')}
                >
                  <MessageSquare className="w-4 h-4" />
                </Button>
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
                    variant="glass" 
                    size="icon" 
                    className="rounded-xl h-9 w-9"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </DrawerTrigger>
                <DrawerContent column glass hideHandle={false} className="px-4 pt-1 pb-8">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="group inline-flex items-baseline gap-1">
                  <h2 className="text-2xl font-bold leading-8 text-white">{profile.name}</h2>
                  {/* The ceremony flies the badge out of this slot and back
                      into it, so it needs an element to measure. */}
                  <span ref={badgeSlotRef} className="inline-flex">
                    <BadgeIcon src={badgeUrl} className="w-[1em] h-[1em]" />
                  </span>
                  {/* A lent badge draws like any other badge everywhere else
                      on the site. Hovering the name it sits on is the one
                      place that says whose badge it is. */}
                  <BadgePatronChip lookupId={profile.walletAddress} />
                </span>
                {/* Temporary — gone NEW_MEMBER_WINDOW_DAYS after signup, and
                    immediately if they switch it off in Settings › Privacy. */}
                <NewMemberChip address={profile.walletAddress} />
                {/* Your own profile only, and only once the walkthrough is
                    finished — it is derived from your progress row, not from
                    anything stored on the profile. */}
                <OnboardingCompleteChip address={profile.walletAddress} />
              </div>
              {profile.customs && (
                <ProfileSocialLinks customs={profile.customs} />
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
              {profile.ensName && (
                /* Beside the handle, never instead of it: the username is what
                   this account is called, while the .eth name is a claim on
                   something that can be sold or left to expire. Copying gives
                   the .eth URL because that is the one worth showing off. */
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://dehub.io/${profile.ensName}`);
                    toast.success('ENS profile URL copied to clipboard');
                  }}
                  title={`Verified ENS name — dehub.io/${profile.ensName}`}
                  className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
                >
                  {profile.ensName}
                </button>
              )}
              {!isViewingOwnProfile && apiProfile?.followsYou && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">
                  Follows you
                </span>
              )}
            </div>
          </div>
          
          {isViewingOwnProfile && profile.walletAddress && (() => {
            const displayAddr = DISPLAY_WALLET_OVERRIDES[profile.walletAddress!.toLowerCase()] || profile.walletAddress!;
            return (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(profile.walletAddress!);
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
            <TranslatableText text={translatedBio || profile.bio} className="mt-3 text-white/90 text-base leading-6 block" as="p" />
          )}

          {/* Pinned Communities */}
          {profile.walletAddress && (
            <PinnedCommunities
              walletAddress={profile.walletAddress}
              isOwnProfile={!!isViewingOwnProfile}
            />
          )}
          
          <div className="flex items-center gap-2 mt-3 text-zinc-500 text-sm">
            <span>{t('profile.joined')} {profile.joinedDate}</span>
            {hasTranslatableText(profile.bio) && !isViewingOwnProfile && (
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
                  {profile.following != null ? (
                    <><span className="font-bold text-white">{profile.following.toLocaleString()}</span><span className="text-zinc-500 ml-1">{t('profile.following')}</span></>
                  ) : (
                    <Skeleton className="h-4 w-16 rounded bg-white/10" />
                  )}
                </button>
              ) : (
                <div className="flex items-center">
                  {profile.following != null ? (
                    <><span className="font-bold text-white">{profile.following.toLocaleString()}</span><span className="text-zinc-500 ml-1">{t('profile.following')}</span></>
                  ) : (
                    <Skeleton className="h-4 w-16 rounded bg-white/10" />
                  )}
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
                  {profile.followers != null ? (
                    <><span className="font-bold text-white">{profile.followers.toLocaleString()}</span><span className="text-zinc-500 ml-1">{t('profile.followers')}</span></>
                  ) : (
                    <Skeleton className="h-4 w-16 rounded bg-white/10" />
                  )}
                </button>
              ) : (
                <div className="flex items-center">
                  {profile.followers != null ? (
                    <><span className="font-bold text-white">{profile.followers.toLocaleString()}</span><span className="text-zinc-500 ml-1">{t('profile.followers')}</span></>
                  ) : (
                    <Skeleton className="h-4 w-16 rounded bg-white/10" />
                  )}
                </div>
              )}
              {/* DeHub followers plus the creator's own figures for their
                  linked socials. Absent until a social carries a count. */}
              <TotalReachPill customs={profile.customs} followers={profile.followers} />
            </div>
          )}

          {/* Mutual followers */}
          {!isViewingOwnProfile && (
            <MutualFollowers profileAddress={apiProfile?.walletAddress} />
          )}

          {/* The streamer ladder. Renders nothing for a profile that has
              never ended a stream, so a non-streamer's page is unchanged. */}
          <StreamerLevelCard address={profile.walletAddress} className="mt-4" />
        </div>
      </div>

      {/* Unfollow confirmation */}
      <AlertDialog open={showUnfollowConfirm} onOpenChange={setShowUnfollowConfirm}>
        <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Unfollow {profile.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              You will no longer see their posts in your feed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/[0.06] backdrop-blur-sm border-white/10 text-white hover:bg-white/[0.12]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500/20 backdrop-blur-sm border border-red-500/30 text-red-400 hover:bg-red-500/30"
              onClick={() => {
                handleUnfollow();
                setShowUnfollowConfirm(false);
              }}
            >
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
