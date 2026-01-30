/**
 * DeHub Profile Hook
 * ===================
 * Fetches user profile and content from DeHub API.
 * 
 * @module hooks/use-dehub-profile
 */

import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { getAccountInfo, getAccountByUsername, searchNFTs, type DeHubUser, type DeHubNFT } from '@/lib/api/dehub';
import { buildAvatarUrl, buildCoverUrl } from '@/lib/media-url';
import { mapNFTToVideoItem, mapNFTToImagePost, getContentType } from './use-dehub-feed';
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
  /** Whether the current viewer follows this user */
  isFollowing?: boolean;
  /** Whether this user follows the current viewer */
  followsYou?: boolean;
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
  const avatarUrl = buildAvatarUrl(address, rawAvatarUrl);
  const coverUrl = buildCoverUrl(address, rawCoverUrl);

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
    isFollowing: user.isFollowing,
    followsYou: user.followsYou,
  };
}

interface UseDeHubProfileOptions {
  /** User ID for lookup */
  userId?: string;
  /** Username for lookup (alternative to userId) */
  username?: string;
  /** Current viewer's wallet address to get follow status */
  address?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch user profile data
 * Supports both userId and username lookups
 * Pass address to get isFollowing/followsYou status
 */
export function useDeHubProfile({ userId, username, address, enabled = true }: UseDeHubProfileOptions = {}) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['dehub-profile', userId || username, address],
    queryFn: async () => {
      let user: DeHubUser;
      
      if (username) {
        // Use username-based lookup
        user = await getAccountByUsername(username, address);
      } else if (userId) {
        // Use ID-based lookup
        user = await getAccountInfo(userId, address);
      } else {
        throw new Error('Either userId or username is required');
      }
      
      return mapUserToProfile(user);
    },
    enabled: enabled && !!(userId || username),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });

  // Helper to update follow status optimistically
  const setFollowStatus = (isFollowing: boolean) => {
    queryClient.setQueryData(['dehub-profile', userId || username, address], (old: ProfileData | undefined) => {
      if (!old) return old;
      return {
        ...old,
        isFollowing,
        followers: isFollowing ? old.followers + 1 : Math.max(0, old.followers - 1),
      };
    });
  };

  return {
    ...query,
    setFollowStatus,
  };
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
 * Uses searchNFTs with creator_id filter for reliable content fetching
 */
export function useDeHubUserContent({ userId, enabled = true, limit = 50 }: UseDeHubUserContentOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['dehub-user-content', userId],
    queryFn: async ({ pageParam = 0 }) => {
      if (!userId) throw new Error('User ID (wallet address) is required');
      
      // Use searchNFTs with creator_id filter - same API that powers the home feed
      const result = await searchNFTs({
        creator_id: userId,
        page: pageParam,
        unit: limit,
        sortMode: 'new',
      });
      
      return {
        data: result.data || [],
        page: pageParam,
        has_more: result.has_more,
        total: result.total,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.has_more) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: enabled && !!userId,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
}

/**
 * Separate user content into videos and images
 * Uses getContentType helper to check both postType (primary) and media_type (fallback)
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
    const contentType = getContentType(nft);
    
    if (contentType === 'video' || contentType === 'audio') {
      videos.push(mapNFTToVideoItem(nft, index));
    } else if (contentType === 'image') {
      images.push(mapNFTToImagePost(nft, index));
    }
  });

  return { videos, images, posts };
}
