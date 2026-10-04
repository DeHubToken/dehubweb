import {
  UserPlus, Pencil, Copy, Wallet, Star, Clock, Plus, Loader2, Check, Ban, MessageSquare
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBadgeCeremony } from '@/hooks/use-badge-ceremony';
import { openBadgePromotion } from '@/lib/badge-showcase';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/app/UserAvatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { TranslatableText, hasTranslatableText } from '@/components/app/TranslatableText';
import { BioTranslateButton } from '@/components/app/profile/BioTranslateButton';
import { ProfileLinksPill } from '@/components/app/profile/ProfileSocialLinks';
import { TotalReachPill } from '@/components/app/profile/TotalReachPill';
import { MutualFollowers } from '@/components/app/profile/MutualFollowers';
import { StreamerLevelCard } from '@/components/app/live/StreamerLevelCard';
import { StreamerBadge } from '@/components/app/live/StreamerBadge';
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
import { buildAvatarCdnFallbackUrl, cdnImageSrcSet } from '@/lib/media-url';
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
  /** Tier by name, for the promotion ceremony. */
  badgeTier?: string | null;
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
  // Badge promotion — own profile only, and only ever on the way up. It opens
  // the badge showcase with the ceremony as its opening, flying out of the
  // badge beside the name exactly as a click on it would.
  const badgeSlotRef = useRef<HTMLSpanElement>(null);
  const { ceremony, dismiss } = useBadgeCeremony({
    enabled: !!isViewingOwnProfile,
    address: apiProfile?.walletAddress ?? profile.walletAddress,
    tier: badgeTier,
  });
  useEffect(() => {
    if (!ceremony) return;
    const slot = badgeSlotRef.current;
    openBadgePromotion(ceremony.from, ceremony.to, (slot?.firstElementChild as HTMLElement | null) ?? slot);
    // Marked seen as it starts: the showcase owns it from here.
    dismiss();
  }, [ceremony, dismiss]);

  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarCdnFailed, setAvatarCdnFailed] = useState(false);
  // The badge rides on the last word so a wrapping name never leaves it
  // alone on a line of its own.
  const nameSplit = (profile.name ?? '').lastIndexOf(' ');
  const nameHead = nameSplit > 0 ? profile.name.slice(0, nameSplit + 1) : '';
  const nameTail = nameSplit > 0 ? profile.name.slice(nameSplit + 1) : profile.name;
  const cdnFallbackUrl = buildAvatarCdnFallbackUrl(profile.walletAddress || '', profile.avatarUrl);

  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] overflow-hidden relative">
      {/* Cover Photo */}
      {isFetchingProfile && !profile.coverUrl ? (
        <Skeleton className="aspect-[3/1] w-full bg-white/[0.06] rounded-none" />
      ) : (
        <button 
          className="aspect-[3/1] bg-zinc-800 w-full cursor-pointer"
          onClick={() => setFullscreenImage(profile.coverUrl || getDefaultBanner(profile.walletAddress))}
        >
          {/* The cover is the profile's LCP element. It was always fetched at
              1500 px wide; a phone renders it at ~375 CSS px. */}
          <img
            src={profile.coverUrl || getDefaultBanner(profile.walletAddress)}
            srcSet={cdnImageSrcSet(profile.coverUrl, [480, 736, 1100, 1500])}
            sizes="(min-width: 1024px) 700px, 100vw"
            alt="Cover"
            className="w-full h-full object-cover"
            fetchPriority="high"
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
                  {/* Followers can subscribe to the creator's pinned plans. */}
                  {isFollowing && !isSubscribed && hasPlans && (
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
                    aria-label={t('profile.options')}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </DrawerTrigger>
                <DrawerContent column glass hideHandle={false} className="px-4 pt-1 pb-8">
                  <DrawerHeader className="sr-only">
                    <DrawerTitle>{t('profile.options')}</DrawerTitle>
                  </DrawerHeader>
                  <ShareOptions />
                </DrawerContent>
              </Drawer>
            </div>
        </div>

        {/* Profile Info */}
        <div>
          <div className="flex flex-col">
            {/* The name owns the full width and may take two lines. Social
                links used to share this row, so a long name was cut or
                crushed beside them; they now sit as small icons at the
                bottom of the header. The badge stays glued to the last word. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
              <span className="group min-w-0 inline-flex items-baseline gap-1">
                <h2 className="text-2xl font-bold leading-8 text-white break-words line-clamp-2 [text-wrap:balance]">
                  {nameHead}
                  <span className="whitespace-nowrap">
                    {nameTail}
                    {/* The ceremony flies the badge out of this slot and back
                        into it, so it needs an element to measure. */}
                    <span ref={badgeSlotRef} className="inline-flex align-baseline ml-1">
                      <BadgeIcon src={badgeUrl} className="w-[1em] h-[1em]" />
                    </span>
                    <StreamerBadge address={profile.walletAddress} canSelect={!!isViewingOwnProfile} className="ml-1" />
                  </span>
                </h2>
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                onClick={() => {
                  const username = profile.handle.replace('@', '');
                  navigator.clipboard.writeText(`https://dehub.io/${username}`);
                  toast.success('Profile URL copied to clipboard');
                }}
                className="min-w-0 max-w-full truncate text-zinc-500 text-lg hover:text-zinc-300 transition-colors"
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
                  className="rounded-md bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700/50 hover:text-white"
                >
                  {profile.ensName}
                </button>
              )}
              {!isViewingOwnProfile && apiProfile?.followsYou && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800/60 text-zinc-400">
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
            <TranslatableText publicContent text={translatedBio || profile.bio} className="mt-3 text-white/90 text-base leading-6 block" as="p" />
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
          {(!hideFollowerCounts || isViewingOwnProfile) ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
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
          ) : null}

          {/* The bottom row: mutual followers on the left, the creator's
              social icons tucked into the right-hand corner. The icons still
              take this row when there are no mutuals to show. Each side
              carries its own top margin, so an empty row takes no space. */}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {!isViewingOwnProfile && (
                <MutualFollowers profileAddress={apiProfile?.walletAddress} />
              )}
            </div>
            <ProfileLinksPill customs={profile.customs} className="shrink-0 mt-2" />
          </div>

          {/* The streamer ladder. Renders nothing for a profile that has
              never ended a stream, so a non-streamer's page is unchanged. */}
          {isViewingOwnProfile && (
            <StreamerLevelCard address={profile.walletAddress} className="mt-4" />
          )}
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
