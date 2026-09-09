/**
 * Profile Cache Seeding
 * =====================
 * Pre-populates whatever trustworthy profile fields the source already has.
 * Missing stats stay undefined so they render as skeletons rather than a false
 * zero; notification actor snapshots can additionally paint counts and the
 * viewer relationship immediately while the full profile revalidates.
 */

import { QueryClient } from '@tanstack/react-query';
import type { ProfileData } from '@/hooks/use-dehub-profile';
import { buildAvatarUrl } from '@/lib/media-url';

interface SeedableProfileData {
  address?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  avatarImageUrl?: string;
  coverUrl?: string;
  badgeBalance?: number;
  followers?: number;
  following?: number;
  postsCount?: number;
  isFollowing?: boolean;
  followsYou?: boolean;
  isPending?: boolean;
  isPrivate?: boolean;
}

/**
 * Seed the profile query cache without inventing missing values. The real
 * profile request is always invalidated so this remains a first-paint hint.
 */
export function seedProfileCache(
  queryClient: QueryClient,
  data: SeedableProfileData,
  viewerAddress?: string
) {
  if (!data.username && !data.address) return;

  const username = data.username?.replace('@', '');
  const address = data.address || '';
  const lookupKey = username || address;

  const avatarRaw = data.avatarUrl || data.avatarImageUrl;

  const keys = [
    ['dehub-profile', lookupKey, viewerAddress],
    ['dehub-profile', lookupKey, undefined],
  ];

  for (const key of keys) {
    const existing = queryClient.getQueryData<ProfileData>(key);

    if (existing) {
      queryClient.setQueryData<ProfileData>(key, {
        ...existing,
        ...(data.displayName ? { name: data.displayName } : {}),
        ...(avatarRaw ? { avatarUrl: avatarRaw.startsWith('http') ? avatarRaw : buildAvatarUrl(address, avatarRaw) } : {}),
        ...(data.coverUrl ? { coverUrl: data.coverUrl } : {}),
        ...(data.badgeBalance != null ? { badgeBalance: data.badgeBalance } : {}),
        ...(data.followers != null ? { followers: data.followers } : {}),
        ...(data.following != null ? { following: data.following } : {}),
        ...(data.postsCount != null ? { postsCount: data.postsCount } : {}),
        ...(data.isFollowing != null ? { isFollowing: data.isFollowing } : {}),
        ...(data.followsYou != null ? { followsYou: data.followsYou } : {}),
        ...(data.isPending != null ? { isPending: data.isPending } : {}),
        ...(data.isPrivate != null ? { isPrivate: data.isPrivate } : {}),
      });
      queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
      continue;
    }

    // Leave unavailable stats undefined so the UI never flashes a made-up zero.
    const shell: ProfileData = {
      id: address,
      name: data.displayName || username || 'Unknown User',
      handle: username ? `@${username}` : '@unknown',
      verified: false,
      bio: '',
      avatarUrl: avatarRaw?.startsWith('http') ? avatarRaw : buildAvatarUrl(address, avatarRaw),
      coverUrl: data.coverUrl,
      joinedDate: '',
      followers: data.followers as number,
      following: data.following as number,
      postsCount: data.postsCount as number,
      walletAddress: address,
      badgeBalance: data.badgeBalance,
      isFollowing: data.isFollowing,
      followsYou: data.followsYou,
      isPending: data.isPending,
      isPrivate: data.isPrivate,
    };

    queryClient.setQueryData(key, shell);
    queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
  }
}
