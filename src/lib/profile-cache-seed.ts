/**
 * Profile Cache Seeding (Visual-only)
 * ====================================
 * Pre-populates ONLY visual fields (avatar, cover, name, handle)
 * so the profile page renders the header image instantly.
 * Stats (followers, following, posts) are NEVER seeded to avoid
 * the "0 followers" flash bug.
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
}

/**
 * Seed the profile query cache with VISUAL-ONLY data from a feed card.
 * Only avatar, cover, name, and handle are seeded.
 * Stats are intentionally excluded — let the real fetch populate them.
 */
export function seedProfileCache(
  queryClient: QueryClient,
  data: SeedableProfileData,
  viewerAddress?: string
) {
  if (!data.username && !data.address) return;

  const username = data.username?.replace('@', '');
  const address = data.address || '';

  const avatarRaw = data.avatarUrl || data.avatarImageUrl;

  const keys = [
    ['dehub-profile', username, viewerAddress],
    ['dehub-profile', username, undefined],
  ];

  for (const key of keys) {
    const existing = queryClient.getQueryData<ProfileData>(key);
    // If we already have any data, don't overwrite — let real fetch handle it
    if (existing) continue;

    // Seed a minimal visual-only shell — stats left undefined so UI shows skeleton for them
    const shell: ProfileData = {
      id: address,
      name: data.displayName || username || 'Unknown User',
      handle: username ? `@${username}` : '@unknown',
      verified: false,
      bio: '',
      avatarUrl: avatarRaw?.startsWith('http') ? avatarRaw : buildAvatarUrl(address, avatarRaw),
      coverUrl: data.coverUrl,
      joinedDate: '',
      followers: undefined as unknown as number,
      following: undefined as unknown as number,
      postsCount: undefined as unknown as number,
      walletAddress: address,
      badgeBalance: data.badgeBalance,
    };
    queryClient.setQueryData(key, shell);
  }
}
