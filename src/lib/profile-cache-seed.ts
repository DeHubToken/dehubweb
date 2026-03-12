/**
 * Profile Cache Seeding
 * =====================
 * Pre-populates the dehub-profile query cache with data
 * already available from feed cards, leaderboard entries, etc.
 * This eliminates the loading skeleton when navigating to profiles
 * whose data we already have.
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
  followers?: number;
  followings?: number;
  following?: number;
  badgeBalance?: number;
  isFollowing?: boolean;
  followsYou?: boolean;
  createdAt?: string;
  bio?: string;
  uploads?: number;
}

/**
 * Seed the profile query cache with partial data from a feed card or list item.
 * The profile page will show this data instantly while refetching full data in background.
 */
export function seedProfileCache(
  queryClient: QueryClient,
  data: SeedableProfileData,
  viewerAddress?: string
) {
  if (!data.username && !data.address) return;

  const username = data.username?.replace('@', '');
  const address = data.address || '';

  // Build a partial ProfileData object
  const avatarRaw = data.avatarUrl || data.avatarImageUrl;
  const partial: ProfileData = {
    id: address,
    name: data.displayName || username || 'Unknown User',
    handle: username ? `@${username}` : '@unknown',
    verified: false,
    bio: data.bio || '',
    avatarUrl: avatarRaw?.startsWith('http') ? avatarRaw : buildAvatarUrl(address, avatarRaw),
    joinedDate: data.createdAt
      ? new Date(data.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : '',
    following: data.followings ?? data.following ?? 0,
    followers: data.followers ?? 0,
    postsCount: data.uploads ?? 0,
    walletAddress: address,
    isFollowing: data.isFollowing,
    followsYou: data.followsYou,
    badgeBalance: data.badgeBalance,
  };

  // Seed for both with and without viewer address (covers both query key variants)
  const keys = [
    ['dehub-profile', username, viewerAddress],
    ['dehub-profile', username, undefined],
  ];

  for (const key of keys) {
    // Only seed if we don't already have fresh data
    const existing = queryClient.getQueryData(key);
    if (!existing) {
      queryClient.setQueryData(key, partial);
    }
  }
}
