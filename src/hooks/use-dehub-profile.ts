/**
 * DeHub Profile Hook
 * ===================
 * Fetches user profile and content from DeHub API.
 * 
 * @module hooks/use-dehub-profile
 */

import { useQuery, useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import i18n from 'i18next';
import { getAccountInfo, getAccountByUsername, getAuthToken, getNFTInfo, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, buildCoverUrl, deviceWidth } from '@/lib/media-url';
import { mapToVideoItem, mapToImagePost, mapToTextPost, type UnifiedFeedItem } from './use-unified-feed';
import type { DateFilterValue, PostTypeFilterValue } from '@/lib/feed-utils';
import type { VideoItem, ImagePost, TextPost } from '@/types/feed.types';

const DEHUB_API_BASE = "https://api.dehub.io";

export interface ProfileData {
  id: string;
  name: string;
  handle: string;
  /**
   * A verified ENS name this account holds, e.g. `mal.eth`.
   *
   * Deliberately alongside `handle` rather than replacing it. The username is
   * what the account is called and cannot vanish; an ENS name is a claim on
   * something that lives on Ethereum and can be sold or left to expire, and a
   * profile that reads as renamed the day a name lapses would be worse than
   * one that shows both.
   */
  ensName?: string;
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
  /**
   * This viewer asked to be served mature posts. Only meaningful on your own
   * profile — it is a viewing preference, not something about the account.
   */
  showMatureContent?: boolean;
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
    ? new Date(createdAt).toLocaleDateString(i18n.language || undefined, { month: 'long', year: 'numeric' })
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
  
  // Build canonical CDN URLs (strips statics/ or other prefixes).
  // ProfileHeader renders this at w-24 sm:w-28 — the largest avatar the app
  // has, and the one place the previous flat 192 was too SMALL rather than too
  // large (a 3x screen wants 336 for it).
  const avatarUrl = buildAvatarUrl(address, rawAvatarUrl, deviceWidth(112));
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
    ensName: user.ensName || undefined,
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
    isPending: user.isPending ?? user.isFollowRequestPending,
    isPrivate: user.isPrivate || customs?.isPrivate === 'true' || customs?.isPrivate === true,
    showMatureContent: user.showMatureContent === true,
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
const PROFILE_CACHE_PREFIX = 'dehub-profile-cache:';
/**
 * A week. This entry exists to paint a name and avatar before the API answers,
 * not to be the source of truth for either. Stamping it is also what lets the
 * boot sweep evict it — unstamped, one key per profile ever opened accumulated
 * forever in a quota shared with auth, wallet and drafts. See lib/local-cache-sweep.
 */
const PROFILE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function readProfileCache(key: string): ProfileData | undefined {
  if (!key) return undefined;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { v?: number; t?: number; data?: ProfileData };
    // Pre-TTL entries were the bare ProfileData, with no way to tell how old
    // they are. Drop rather than trust; the query below refetches immediately.
    if (parsed?.v !== 1 || typeof parsed.t !== 'number' || !parsed.data) {
      localStorage.removeItem(PROFILE_CACHE_PREFIX + key);
      return undefined;
    }
    if (Date.now() - parsed.t > PROFILE_CACHE_TTL) {
      localStorage.removeItem(PROFILE_CACHE_PREFIX + key);
      return undefined;
    }
    return parsed.data;
  } catch { return undefined; }
}

function writeProfileCache(key: string, data: ProfileData): void {
  if (!key) return;
  try {
    localStorage.setItem(PROFILE_CACHE_PREFIX + key, JSON.stringify({ v: 1, t: Date.now(), data }));
  } catch { /* quota exceeded — ignore */ }
}

export function useDeHubProfile({ userId, username, address, enabled = true }: UseDeHubProfileOptions = {}) {
  const queryClient = useQueryClient();
  const cacheKey = userId || username || '';

  // Instant first paint: serve cached profile from localStorage while fresh data loads
  const cachedProfile = useMemo(() => readProfileCache(cacheKey), [cacheKey]);

  const query = useQuery({
    queryKey: ['dehub-profile', userId || username, address],
    queryFn: async ({ queryKey }) => {
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

      // Guard: API may return 200 with an empty shell (no _id, address, or username).
      // Treat this as "not found" so the profile page shows an error state.
      if (!user._id && !user.address && !user.wallet_address && !user.username) {
        throw new Error('Profile not found');
      }

      return mapUserToProfile(user);
    },
    enabled: enabled && !!(userId || username),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: (failureCount, error) => {
      // Retry up to 4 times for "not found" (transient empty-shell responses)
      // and up to 3 times for network errors
      if (error?.message === 'Profile not found') return failureCount < 4;
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(800 * 2 ** attemptIndex, 5000),
    // Show localStorage cache instantly, then keep previous data on address change
    placeholderData: cachedProfile ?? keepPreviousData,
  });

  // Persist fresh data to localStorage for next visit
  useEffect(() => {
    if (query.data && !query.isPlaceholderData) {
      writeProfileCache(cacheKey, query.data);
    }
  }, [query.data, query.isPlaceholderData, cacheKey]);

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
    isFetchingProfile: query.isFetching,
    setFollowStatus,
  };
}

/**
 * Hook to fetch user profile by username only
 */
export function useDeHubProfileByUsername(username?: string, enabled = true) {
  return useDeHubProfile({ username, enabled: enabled && !!username });
}

/** Orderings a visitor can put a creator's own content in. */
export type ProfileSortMode = 'newest' | 'oldest' | 'views' | 'likes';

/** What /api/feed wants for each mode. `asc` flips the whole sort rule server-side. */
export const PROFILE_SORT_PARAMS: Record<ProfileSortMode, { sortBy: string; sortOrder: 'asc' | 'desc' }> = {
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
  oldest: { sortBy: 'createdAt', sortOrder: 'asc' },
  views: { sortBy: 'views', sortOrder: 'desc' },
  likes: { sortBy: 'likes', sortOrder: 'desc' },
};

/**
 * The home feed's filter panel, narrowed to one creator's channel.
 *
 * Every field is a `/api/feed` parameter, so the filtering happens where the
 * catalogue is rather than over the pages already scrolled into memory — the
 * same reason sort and search are server-side. `category` is single-select
 * here (the home feed allows several and post-filters the extras on the
 * client): this one query also feeds the profile's tab counts, and a
 * client-side pass would leave those counts describing a list nobody sees.
 */
export interface ProfileContentFilters {
  /** Category id, or null for every category. */
  category: string | null;
  date: DateFilterValue;
  postType: PostTypeFilterValue;
  /** Pay-per-view only. */
  ppv: boolean;
  /** Bounty (watch-to-earn) only. */
  w2e: boolean;
  /** Subscriber-gated only. */
  locked: boolean;
}

export const EMPTY_PROFILE_FILTERS: ProfileContentFilters = {
  category: null,
  date: 'all',
  postType: 'all',
  ppv: false,
  w2e: false,
  locked: false,
};

/** `all` has no `range` param — the API reads its absence as all time. */
const PROFILE_DATE_RANGE: Record<DateFilterValue, 'day' | 'week' | 'month' | 'year' | undefined> = {
  all: undefined,
  today: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

/** How many chips the toggle button should badge. */
export function countActiveProfileFilters(filters: ProfileContentFilters): number {
  return (
    (filters.category ? 1 : 0) +
    (filters.date !== 'all' ? 1 : 0) +
    (filters.postType !== 'all' ? 1 : 0) +
    (filters.ppv ? 1 : 0) +
    (filters.w2e ? 1 : 0) +
    (filters.locked ? 1 : 0)
  );
}

interface UseDeHubUserContentOptions {
  userId?: string;
  /** @deprecated Viewer context is now extracted from JWT Bearer token */
  viewerAddress?: string;
  enabled?: boolean;
  limit?: number;
  /** Ordering for this creator's posts. Defaults to newest first. */
  sortMode?: ProfileSortMode;
  /** Free text, matched server-side against a post's title and description. */
  search?: string;
  /** Category / date / post type / access narrowing, all server-side. */
  filters?: ProfileContentFilters;
}

/**
 * Hook to fetch user's NFT content (videos/images)
 * Uses the /api/feed endpoint with minter filter for reliable content fetching
 * Pass viewerAddress to get isLiked/isSaved state for the logged-in user
 */
export function useDeHubUserContent({
  userId,
  viewerAddress,
  enabled = true,
  limit = 15,
  sortMode = 'newest',
  search = '',
  filters = EMPTY_PROFILE_FILTERS,
}: UseDeHubUserContentOptions = {}) {
  const trimmedSearch = search.trim();
  return useInfiniteQuery({
    queryKey: ['dehub-user-content', userId, viewerAddress, sortMode, trimmedSearch, filters],
    queryFn: async ({ pageParam = 1 }) => {
      if (!userId) throw new Error('User ID (wallet address) is required');

      // Use /api/feed with minter parameter - the same API that powers the home feed
      const url = new URL('/api/feed', DEHUB_API_BASE);
      url.searchParams.set('page', String(pageParam));
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('minter', userId);
      const { sortBy, sortOrder } = PROFILE_SORT_PARAMS[sortMode] ?? PROFILE_SORT_PARAMS.newest;
      url.searchParams.set('sortBy', sortBy);
      url.searchParams.set('sortOrder', sortOrder);
      if (trimmedSearch) url.searchParams.set('search', trimmedSearch);
      // Show all confirmed and pending content on profiles
      url.searchParams.set('status', 'all');

      // Filter panel — same parameter names the home feed sends, so a lane that
      // works there works here. postType is only ever sent for a type the
      // deployed API already knows: an unrecognised value is answered with an
      // unfiltered feed rather than an error.
      if (filters.category) url.searchParams.set('category', filters.category);
      const range = PROFILE_DATE_RANGE[filters.date];
      if (range) url.searchParams.set('range', range);
      if (filters.postType !== 'all') url.searchParams.set('postType', filters.postType);
      if (filters.ppv) url.searchParams.set('isPPV', 'true');
      if (filters.w2e) url.searchParams.set('hasBounty', 'true');
      if (filters.locked) url.searchParams.set('isLocked', 'true');
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
      const items = json.result || [];
      
      // Enrich quote posts that are missing their quotedPost data
      const needsEnrich: { idx: number; item: any }[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.isQuotePost && item.quotedTokenId && !item.quotedPost) {
          needsEnrich.push({ idx: i, item });
        }
      }
      if (needsEnrich.length > 0) {
        const BATCH_SIZE = 5;
        for (let b = 0; b < needsEnrich.length; b += BATCH_SIZE) {
          const batch = needsEnrich.slice(b, b + BATCH_SIZE);
          const settled = await Promise.allSettled(
            batch.map(({ item }) => getNFTInfo(String(item.quotedTokenId)))
          );
          settled.forEach((outcome, i) => {
            if (outcome.status === 'fulfilled' && outcome.value) {
              items[batch[i].idx] = { ...batch[i].item, quotedPost: outcome.value };
            }
          });
        }
      }
      
      return {
        data: items,
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
