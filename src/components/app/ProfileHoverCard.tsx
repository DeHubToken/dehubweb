/**
 * Profile Hover Card
 * ==================
 * Shows a mini profile preview on avatar hover in the feed.
 * Fetches profile data lazily on hover with follow/unfollow support.
 */

import { useState, useCallback, useRef } from 'react';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus, Loader2 } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { getBadgeUrl } from '@/lib/staking-badges';
import { buildAvatarUrl } from '@/lib/media-url';
import { getAccountInfo } from '@/lib/api/dehub/users';
import { isFollowing as checkIsFollowing } from '@/lib/api/dehub/social';
import { seedProfileCache } from '@/lib/profile-cache-seed';
import { useAuth } from '@/contexts/AuthContext';
import { useFollow } from '@/hooks/use-follow';
import { mapUserToProfile } from '@/hooks/use-dehub-profile';
import { toast } from 'sonner';
import type { DeHubUser } from '@/lib/api/dehub/types';

interface ProfileHoverCardProps {
  /** The wallet address / creator ID */
  creatorId?: string;
  /** Username handle (without @) */
  creatorUsername?: string;
  /** Display name */
  displayName?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Whether user is verified */
  verified?: boolean;
  /** Badge balance from feed data */
  badgeBalance?: number;
  /** The trigger element (avatar button) */
  children: React.ReactNode;
}

interface ProfileData {
  address: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | undefined;
  verified: boolean;
  followers: number;
  following: number;
  badgeBalance: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
}

export function ProfileHoverCard({
  creatorId,
  creatorUsername,
  displayName,
  avatarUrl,
  verified,
  badgeBalance,
  children,
}: ProfileHoverCardProps) {
  const { walletAddress, openLoginModal } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  // Shared cross-surface follow state (optimistic override wins over fetched value)
  const { isFollowing: followOverride, toggleFollow } = useFollow(profile?.address);
  const effectiveFollowing = followOverride ?? profile?.isFollowing ?? false;

  const userId = creatorId || creatorUsername;
  const isOwnProfile = walletAddress && creatorId?.toLowerCase() === walletAddress.toLowerCase();

  const handleOpenChange = useCallback(async (open: boolean) => {
    if (!open || !userId || fetchedRef.current === userId) return;

    setIsLoading(true);
    try {
      const user: DeHubUser = await getAccountInfo(userId, walletAddress || undefined);
      const address = user.address || user.wallet_address || creatorId || '';
      const uname = user.username || creatorUsername || null;

      // Resolve follower counts
      const followerCount = typeof user.followers === 'number'
        ? user.followers
        : (user.follower_count ?? (Array.isArray(user.followers) ? user.followers.length : 0));
      const followingCount = user.following_count ?? (Array.isArray(user.followings) ? user.followings.length : 0);

      // Check if we're following this user
      let following = user.isFollowing ?? false;
      if (!following && walletAddress && address && walletAddress.toLowerCase() !== address.toLowerCase()) {
        try {
          following = await checkIsFollowing(address);
        } catch { /* ignore */ }
      }

      setProfile({
        address,
        username: uname,
        displayName: user.displayName || user.display_name || displayName || null,
        bio: user.bio || user.aboutMe || null,
        avatarUrl: buildAvatarUrl(address, user.avatarImageUrl || user.avatarUrl || user.avatar_url),
        verified: user.isVerified || user.is_verified || verified || false,
        followers: followerCount,
        following: followingCount,
        badgeBalance: user.badgeBalance ?? badgeBalance ?? 0,
        isFollowing: following,
        isOwnProfile: walletAddress?.toLowerCase() === address.toLowerCase(),
      });
      fetchedRef.current = userId;

      // Warm the profile PAGE's query cache with this fetch: hovering a user
      // then clicking through to /:username used to redo the whole
      // username→address lookup — now the page finds the profile already
      // cached and goes straight to fetching content (2 hops → 1).
      if (uname) {
        try {
          const mapped = mapUserToProfile(user);
          queryClient.setQueryData(
            ['dehub-profile', uname, walletAddress || undefined],
            { ...mapped, isFollowing: following },
          );
        } catch { /* mapping is best-effort — the page falls back to its own fetch */ }
      }
    } catch {
      // Silently fail — hover card just won't show data
    } finally {
      setIsLoading(false);
    }
  }, [userId, walletAddress, creatorId, creatorUsername, displayName, verified, badgeBalance]);

  const handleFollow = useCallback(() => {
    if (!walletAddress) { openLoginModal(); return; }
    if (!profile?.address) return;
    // Optimistic: bump follower count locally, revert on error (button state
    // itself comes from the shared override which flips instantly).
    setProfile(prev => prev ? { ...prev, followers: prev.followers + 1 } : null);
    toggleFollow(false, {
      name: profile.displayName || profile.username || 'user',
      onError: () => {
        setProfile(prev => prev ? { ...prev, followers: Math.max(0, prev.followers - 1) } : null);
        toast.error('Failed to follow');
      },
    });
  }, [walletAddress, openLoginModal, profile, toggleFollow]);

  const handleNavigate = useCallback(() => {
    const cleanUsername = (profile?.username || creatorUsername)?.replace('@', '');
    if (cleanUsername) {
      navigate(`/${cleanUsername}`);
    } else if (creatorId) {
      navigate(`/app/profile?id=${creatorId}`);
    }
  }, [profile, creatorUsername, creatorId, navigate]);

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  // Don't wrap if no user to show
  if (!userId) return <>{children}</>;

  const badgeUrl = profile ? getBadgeUrl(profile.badgeBalance, profile.username || '') : null;

  return (
    <HoverCard openDelay={400} closeDelay={200} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={8}
        data-profile-hover-card
        className="w-72 rounded-2xl p-0 bg-white/[0.06] backdrop-blur-[28px] backdrop-saturate-150 border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-white/60" />
          </div>
        ) : profile ? (
          <div className="p-4">
            {/* Top row: Avatar + Follow button */}
            <div className="flex items-start justify-between mb-3">
              <button onClick={handleNavigate} className="cursor-pointer">
                <Avatar className="w-14 h-14 rounded-xl">
                  {profile.avatarUrl && (
                    <AvatarImage src={profile.avatarUrl} className="rounded-xl" />
                  )}
                  <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-xl text-lg">
                    {(profile.displayName || profile.username || '?')[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
              {!profile.isOwnProfile && !effectiveFollowing && (
                <button
                  type="button"
                  onClick={handleFollow}
                  data-follow-btn
                  className="inline-flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-colors disabled:opacity-60"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Follow
                </button>
              )}
              {!profile.isOwnProfile && effectiveFollowing && (
                <span className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-white/80 bg-white/5 border border-white/10">
                  Following ✓
                </span>
              )}
            </div>

            {/* Name + handle */}
            <button onClick={handleNavigate} className="cursor-pointer text-left">
              <div className="flex items-center gap-1.5">
                <span className="relative inline-flex items-baseline shrink min-w-0">
                  <span className="font-semibold text-white text-sm truncate max-w-[180px] leading-tight">
                    {profile.displayName || profile.username || 'Unknown'}
                  </span>
                  <BadgeIcon
                    badgeBalance={profile.badgeBalance}
                    username={profile.username || ''}
                    className="w-[9px] h-[9px] absolute -top-0.5 -right-2.5"
                  />
                </span>
                {profile.verified && <CheckCircle className="w-3.5 h-3.5 text-white shrink-0 ml-1" />}
              </div>
              {profile.username && (
                <p className="text-white/60 text-xs mt-0.5">
                  @{profile.username.replace('@', '')}
                </p>
              )}
            </button>

            {/* Bio */}
            {profile.bio && (
              <p className="text-white/80 text-xs leading-relaxed mt-2 line-clamp-2">
                {profile.bio}
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 mt-3">
              <span className="text-xs">
                <span className="text-white font-semibold">{formatCount(profile.following)}</span>
                <span className="text-white/60 ml-1">Following</span>
              </span>
              <span className="text-xs">
                <span className="text-white font-semibold">{formatCount(profile.followers)}</span>
                <span className="text-white/60 ml-1">Followers</span>
              </span>
            </div>
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
