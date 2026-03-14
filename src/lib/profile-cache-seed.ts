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

  // Build a partial ProfileData object — only include fields the source actually has
  const avatarRaw = data.avatarUrl || data.avatarImageUrl;
  const partial: Partial<ProfileData> = {
    id: address,
    name: data.displayName || username || 'Unknown User',
    handle: username ? `@${username}` : '@unknown',
    verified: false,
    avatarUrl: avatarRaw?.startsWith('http') ? avatarRaw : buildAvatarUrl(address, avatarRaw),
    walletAddress: address,
    isFollowing: data.isFollowing,
    followsYou: data.followsYou,
    badgeBalance: data.badgeBalance,
  };

  // Only include stats if the source actually provides them (avoid seeding 0s)
  if (data.bio) partial.bio = data.bio;
  if (data.createdAt) {
    partial.joinedDate = new Date(data.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (data.followings != null || data.following != null) {
    partial.following = data.followings ?? data.following;
  }
  if (data.followers != null) partial.followers = data.followers;
  if (data.uploads != null) partial.postsCount = data.uploads;

  // Seed for both with and without viewer address (covers both query key variants)
  const keys = [
    ['dehub-profile', username, viewerAddress],
    ['dehub-profile', username, undefined],
  ];

  for (const key of keys) {
    // Merge with existing cache data — never overwrite real data with partial seed
    const existing = queryClient.getQueryData<ProfileData>(key);
    const merged: ProfileData = {
      ...({
        id: '',
        name: 'Unknown User',
        handle: '@unknown',
        verified: false,
        bio: '',
        avatarUrl: '',
        joinedDate: '',
        following: 0,
        followers: 0,
        postsCount: 0,
        walletAddress: '',
      } satisfies ProfileData),
      ...existing,
      ...partial,
      // Preserve existing non-zero stats if seed doesn't provide them
      ...(existing?.followers && partial.followers == null ? { followers: existing.followers } : {}),
      ...(existing?.following && partial.following == null ? { following: existing.following } : {}),
      ...(existing?.bio && !partial.bio ? { bio: existing.bio } : {}),
      ...(existing?.postsCount && partial.postsCount == null ? { postsCount: existing.postsCount } : {}),
    };
    queryClient.setQueryData(key, merged);
  }
}
