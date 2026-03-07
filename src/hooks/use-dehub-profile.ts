/**
 * DeHub Profile Hook
 * ===================
 * Fetches user profile and content from DeHub API.
 * 
 * @module hooks/use-dehub-profile
 */

import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { getAccountInfo, getAccountByUsername, getAuthToken, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, buildCoverUrl } from '@/lib/media-url';
import { mapToVideoItem, mapToImagePost, mapToTextPost, type UnifiedFeedItem } from './use-unified-feed';
import type { VideoItem, ImagePost, TextPost } from '@/types/feed.types';

const DEHUB_API_BASE = "https://api.dehub.io";

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
  /** Whether a follow request is pending (for private accounts) */
  isPending?: boolean;
  /** Whether this account is private (requires follow approval) */
  isPrivate?: boolean;
  /** Whether the current viewer has blocked this user */
  youBlocked?: boolean;
  /** Whether this user has blocked the current viewer */
  blockedYou?: boolean;
  /** Raw array of follower wallet addresses (for list display) */
  followersList?: string[];
  /** Raw array of following wallet addresses (for list display) */
  followingsList?: string[];
  /** Raw customs data from API */
  customs?: Record<string, unknown>;
  /** On-chain badge balance from API */
  badgeBalance?: number;
  /** DM settings from API */
  dmSettings?: {
    disables?: string[];
    minTipDhb?: number;
  };
}

/**
 * Map DeHub user to ProfileData
 * Handles both camelCase (API) and snake_case field names
 */
export function mapUserToProfile(user: DeHubUser): ProfileData {
  // Handle timestamp from either field name — use browser locale for translated dates
  const createdAt = user.createdAt || user.created_at;
  const joinDate = createdAt 
    ? new Date(createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : 'Unknown';

  // Calculate follower/following counts - handle both number and array types
  const followerCount = user.follower_count ?? 
    (typeof user.followers === 'number' ? user.followers : user.followers?.length) ?? 0;
  const followingCount = user.following_count ?? 
    (typeof user.followings === 'number' ? user.followings : user.followings?.length) ?? 0;

  // Get raw avatar/cover paths (API uses avatarImageUrl/coverImageUrl)
  const rawAvatarUrl = user.avatarImageUrl || user.avatarUrl || user.avatar_url;
  const rawCoverUrl = user.coverImageUrl || user.coverUrl || user.cover_url;
  
  // Get user address for canonical URL construction
  const address = user.address || user.wallet_address || '';
  
  // Build canonical CDN URLs (strips statics/ or other prefixes)
  const avatarUrl = buildAvatarUrl(address, rawAvatarUrl);
  const coverUrl = buildCoverUrl(address, rawCoverUrl);

  // Preserve raw arrays for list display (if available)
  const followersList = Array.isArray(user.followers) ? user.followers : undefined;
  const followingsList = Array.isArray(user.followings) ? user.followings : undefined;
  
  // Get customs data for isPrivate fallback
  const customs = user.customs as Record<string, unknown> | undefined;

  // Merge top-level social link fields into customs so ProfileSocialLinks can find them
  const socialKeys = ['twitterLink', 'instagramLink', 'tiktokLink', 'youtubeLink', 'discordLink', 'telegramLink', 'facebookLink'] as const;
  const rawUser = user as Record<string, unknown>;
  const mergedCustoms: Record<string, unknown> = { ...(customs || {}) };
  for (const key of socialKeys) {
    const val = rawUser[key];
    if (typeof val === 'string' && val.trim().length > 0 && !mergedCustoms[key]) {
      mergedCustoms[key] = val;
    }
  }

  return {
    id: user._id || user.id || '',
    name: user.displayName || user.display_name || user.username || 'Unknown User',
    handle: user.username ? `@${user.username.replace('@', '')}` : '@unknown',
    verified: user.isVerified || user.is_verified || false,
    bio: user.bio || user.aboutMe || '',
    avatarUrl,
    coverUrl,
    joinedDate: joinDate,
    following: followingCount,
    followers: followerCount,
    postsCount: user.post_count || user.uploads || 0,
    walletAddress: user.address || user.wallet_address,
    isFollowing: user.isFollowing,
    followsYou: user.followsYou,
    isPending: user.isPending,
    isPrivate: user.isPrivate || customs?.isPrivate === 'true' || customs?.isPrivate === true,
    youBlocked: user.youBlocked ?? false,
    blockedYou: user.blockedYou ?? false,
    followersList,
    followingsList,
    customs: Object.keys(mergedCustoms).length > 0 ? mergedCustoms : undefined,
    badgeBalance: user.badgeBalance || (user.balanceData?.reduce((sum, b) => sum + (b.walletBalance || 0) + (b.staked || 0), 0)) || 0,
    dmSettings: user.dmSettings,
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
  /** @deprecated Viewer context is now extracted from JWT Bearer token */
  viewerAddress?: string;
  enabled?: boolean;
  limit?: number;
}

/**
 * Hook to fetch user's NFT content (videos/images)
 * Uses the /api/feed endpoint with minter filter for reliable content fetching
 * Pass viewerAddress to get isLiked/isSaved state for the logged-in user
 */
export function useDeHubUserContent({ userId, viewerAddress, enabled = true, limit = 50 }: UseDeHubUserContentOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['dehub-user-content', userId, viewerAddress],
    queryFn: async ({ pageParam = 1 }) => {
      if (!userId) throw new Error('User ID (wallet address) is required');
      
      // Use /api/feed with minter parameter - the same API that powers the home feed
      const url = new URL('/api/feed', DEHUB_API_BASE);
      url.searchParams.set('page', String(pageParam));
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('minter', userId);
      url.searchParams.set('sortBy', 'createdAt');
      url.searchParams.set('sortOrder', 'desc');
      // Show all confirmed and pending content on profiles
      url.searchParams.set('status', 'all');
      // address param is deprecated - viewer context comes from JWT token
      
      const token = getAuthToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        throw new Error(`Feed API error: ${response.status}`);
      }
      
      const json = await response.json();
      
      return {
        data: json.result || [],
        page: pageParam,
        has_more: json.pagination?.hasMore ?? false,
        total: json.pagination?.totalCount ?? 0,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.has_more) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: enabled && !!userId,
    staleTime: 1000 * 60 * 10, // 10 minutes - data is fresh for longer
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false, // Don't refetch when tab switching
    refetchOnMount: false, // Don't refetch when component remounts
    retry: 2,
  });
}

/**
 * Separate user content into videos, images, and text posts
 * Uses postType from the unified feed API, with fallback detection for older posts
 */
export function separateUserContent(items: UnifiedFeedItem[]): {
  videos: VideoItem[];
  images: ImagePost[];
  posts: TextPost[];
} {
  const videos: VideoItem[] = [];
  const images: ImagePost[] = [];
  const posts: TextPost[] = [];

  items.forEach((item, index) => {
    // Determine content type - some older posts don't have postType set
    let contentType: 'video' | 'image' | 'text' = 'image'; // default
    
    if (item.postType === 'video') {
      contentType = 'video';
    } else if (item.postType === 'audio' || item.postType === 'feed-audio') {
      // Audio posts render as video cards with playback
      contentType = 'video';
    } else if (item.postType === 'feed-images') {
      contentType = 'image';
    } else if (item.postType === 'feed-simple') {
      contentType = 'text';
    } else if (item.videoUrl) {
      // Fallback: if no postType but has videoUrl, it's a video
      contentType = 'video';
    } else if (item.imageUrl || item.imageUrls?.length) {
      // Fallback: if no postType but has images, it's an image post
      contentType = 'image';
    }
    
    if (contentType === 'video') {
      videos.push(mapToVideoItem(item, index));
    } else if (contentType === 'image') {
      images.push(mapToImagePost(item, index));
    } else if (contentType === 'text') {
      posts.push(mapToTextPost(item, index));
    }
  });

  return { videos, images, posts };
}
