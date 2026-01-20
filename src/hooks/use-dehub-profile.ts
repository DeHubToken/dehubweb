/**
 * DeHub Profile Hook
 * ===================
 * Fetches user profile and content from DeHub API.
 * 
 * @module hooks/use-dehub-profile
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { getAccountInfo, getAccountByUsername, getUserNFTs, type DeHubUser, type DeHubNFT } from '@/lib/api/dehub';
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
 * Map DeHub user to ProfileData
 */
export function mapUserToProfile(user: DeHubUser): ProfileData {
  const joinDate = user.created_at 
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Unknown';

  return {
    id: user.id,
    name: user.display_name || user.username || 'Unknown User',
    handle: user.username ? `@${user.username.replace('@', '')}` : '@unknown',
    verified: user.is_verified || false,
    bio: user.bio || '',
    avatarUrl: user.avatar_url,
    coverUrl: user.cover_url,
    joinedDate: joinDate,
    following: user.following_count || 0,
    followers: user.follower_count || 0,
    postsCount: user.post_count || 0,
    walletAddress: user.wallet_address,
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
    retry: 2,
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
