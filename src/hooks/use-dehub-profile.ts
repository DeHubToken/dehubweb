/**
 * DeHub Profile Hook
 * ===================
 * Fetches user profile and content from DeHub API.
 * 
 * @module hooks/use-dehub-profile
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { getAccountInfo, getAccountByUsername, getUserNFTs, DEHUB_CDN_BASE, type DeHubUser, type DeHubNFT } from '@/lib/api/dehub';
import { mapNFTToVideoItem, mapNFTToImagePost } from './use-dehub-feed';
import type { VideoItem, ImagePost, TextPost } from '@/types/feed.types';

export interface ProfileData {
  id: string;
  name: string;
  handle: string;
  verified: boolean;
  bio: string;
  avatarUrl?: string;
  coverUrl?: string;
  joinedDate: string;
  following: number;
  followers: number;
  postsCount: number;
  walletAddress?: string;
}

/**
 * Extract file extension from API path
 * Preserves original extension including .octet-stream, .gif, .jpeg, etc.
 */
function getExtension(path: string): string {
  const match = path.match(/\.([a-zA-Z0-9-]+)$/);
  if (!match) return 'jpg';
  return match[1].toLowerCase();
}

/**
 * Build canonical avatar URL: cdn/avatars/{address}.{ext}
 * API may return paths like "avatars/xxx.jpg" or "statics/avatars/xxx.octet-stream"
 * We normalize to: https://dehubcdn.../avatars/{address}.{ext}
 */
function buildProfileAvatarUrl(address: string, apiAvatarPath: string | undefined): string | undefined {
  if (!apiAvatarPath) return undefined;
  if (apiAvatarPath.startsWith('http')) return apiAvatarPath;
  const ext = getExtension(apiAvatarPath);
  return `${DEHUB_CDN_BASE}avatars/${address}.${ext}`;
}

/**
 * Build canonical cover URL: cdn/covers/{address}.{ext}
 * API may return paths like "covers/xxx.jpg" or "statics/covers/xxx.gif"
 * We normalize to: https://dehubcdn.../covers/{address}.{ext}
 */
function buildProfileCoverUrl(address: string, apiCoverPath: string | undefined): string | undefined {
  if (!apiCoverPath) return undefined;
  if (apiCoverPath.startsWith('http')) return apiCoverPath;
  const ext = getExtension(apiCoverPath);
  return `${DEHUB_CDN_BASE}covers/${address}.${ext}`;
}

/**
 * Map DeHub user to ProfileData
 * Handles both camelCase (API) and snake_case field names
 */
export function mapUserToProfile(user: DeHubUser): ProfileData {
  // Handle timestamp from either field name
  const createdAt = user.createdAt || user.created_at;
  const joinDate = createdAt 
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Unknown';

  // Calculate follower/following counts - handle both number and array types
  const followerCount = user.follower_count ?? 
    (typeof user.followers === 'number' ? user.followers : user.followers?.length) ?? 0;
  const followingCount = user.following_count ?? user.followings?.length ?? 0;

  // Get raw avatar/cover paths (API uses avatarImageUrl/coverImageUrl)
  const rawAvatarUrl = user.avatarImageUrl || user.avatarUrl || user.avatar_url;
  const rawCoverUrl = user.coverImageUrl || user.coverUrl || user.cover_url;
  
  // Get user address for canonical URL construction
  const address = user.address || user.wallet_address || '';
  
  // Build canonical CDN URLs (strips statics/ or other prefixes)
  const avatarUrl = buildProfileAvatarUrl(address, rawAvatarUrl);
  const coverUrl = buildProfileCoverUrl(address, rawCoverUrl);

  return {
    id: user._id || user.id || '',
    name: user.displayName || user.display_name || user.username || 'Unknown User',
    handle: user.username ? `@${user.username.replace('@', '')}` : '@unknown',
    verified: user.isVerified || user.is_verified || false,
    bio: user.bio || '',
    avatarUrl,
    coverUrl,
    joinedDate: joinDate,
    following: followingCount,
    followers: followerCount,
    postsCount: user.post_count || user.uploads || 0,
    walletAddress: user.address || user.wallet_address,
  };
}

interface UseDeHubProfileOptions {
  /** User ID for lookup */
  userId?: string;
  /** Username for lookup (alternative to userId) */
  username?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch user profile data
 * Supports both userId and username lookups
 */
export function useDeHubProfile({ userId, username, enabled = true }: UseDeHubProfileOptions = {}) {
  return useQuery({
    queryKey: ['dehub-profile', userId || username],
    queryFn: async () => {
      let user: DeHubUser;
      
      if (username) {
        // Use username-based lookup
        user = await getAccountByUsername(username);
      } else if (userId) {
        // Use ID-based lookup
        user = await getAccountInfo(userId);
      } else {
        throw new Error('Either userId or username is required');
      }
      
      return mapUserToProfile(user);
    },
    enabled: enabled && !!(userId || username),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch user profile by username only
 */
export function useDeHubProfileByUsername(username?: string, enabled = true) {
  return useDeHubProfile({ username, enabled: enabled && !!username });
}

interface UseDeHubUserContentOptions {
  userId?: string;
  enabled?: boolean;
  limit?: number;
}

/**
 * Hook to fetch user's NFT content (videos/images)
 */
export function useDeHubUserContent({ userId, enabled = true, limit = 20 }: UseDeHubUserContentOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['dehub-user-content', userId],
    queryFn: async ({ pageParam = 1 }) => {
      if (!userId) throw new Error('User ID is required');
      const result = await getUserNFTs(userId, pageParam, limit);
      return result;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.has_more) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: enabled && !!userId,
    staleTime: 1000 * 60 * 5,
    retry: (failureCount, error) => {
      // Don't retry on 404 - user might not have any content
      if (error?.message?.includes('404') || error?.message?.includes('Not Found')) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

/**
 * Separate user content into videos and images
 */
export function separateUserContent(nfts: DeHubNFT[]): {
  videos: VideoItem[];
  images: ImagePost[];
  posts: TextPost[];
} {
  const videos: VideoItem[] = [];
  const images: ImagePost[] = [];
  const posts: TextPost[] = [];

  nfts.forEach((nft, index) => {
    if (nft.media_type === 'video' || nft.media_type === 'audio') {
      videos.push(mapNFTToVideoItem(nft, index));
    } else if (nft.media_type === 'image') {
      images.push(mapNFTToImagePost(nft, index));
    }
  });

  return { videos, images, posts };
}
