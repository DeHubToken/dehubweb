import { apiCall } from './core';
import type { DeHubUser, DeHubNFT } from './types';

export interface VoteResponse {
  success: boolean;
  tokenId: number;
  voteType: 'for' | 'against' | null;
  totalVotes?: {
    for: number;
    against: number;
  };
}

export interface FollowResponse {
  success: boolean;
  isFollowing: boolean;
  followerCount?: number;
}

export interface FollowRequestItem {
  id: string;
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  createdAt?: string;
}

export interface FollowListItem {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  isFollowing?: boolean;
  followsYou?: boolean;
}

export interface CommentLikeResponse {
  success: boolean;
  commentId: string;
  isLiked: boolean;
  likeCount?: number;
}

export async function followUser(walletAddress: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/request_follow", {
    method: "POST",
    body: { following: walletAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export async function unfollowUser(walletAddress: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/request_follow", {
    method: "POST",
    body: { following: walletAddress.toLowerCase(), unFollowing: true },
    requiresAuth: true,
  });
}

export async function getFollowRequests(): Promise<FollowRequestItem[]> {
  const response = await apiCall<{ result: FollowRequestItem[] } | FollowRequestItem[]>(
    "/api/follow-requests",
    { requiresAuth: true }
  );
  
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as FollowRequestItem[];
}

export async function approveFollowRequest(requestId: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/follow-requests/${requestId}/accept`, {
    method: "POST",
    requiresAuth: true,
  });
}

export async function rejectFollowRequest(requestId: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/follow-requests/${requestId}/reject`, {
    method: "POST",
    requiresAuth: true,
  });
}

export async function acceptAllFollowRequests(): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/follow-requests/accept-all", {
    method: "POST",
    requiresAuth: true,
  });
}

export async function rejectAllFollowRequests(): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/follow-requests/reject-all", {
    method: "POST",
    requiresAuth: true,
  });
}

export async function getFollowList(
  address: string, 
  type: 'followers' | 'following',
  options?: {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'username' | 'displayName';
    sortOrder?: 'asc' | 'desc';
    search?: string;
  }
): Promise<{ items: FollowListItem[]; pagination?: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }> {
  const params: Record<string, string | number | undefined> = { type };
  if (options?.page !== undefined) params.page = options.page;
  if (options?.limit !== undefined) params.limit = options.limit;
  if (options?.sortBy) params.sortBy = options.sortBy;
  if (options?.sortOrder) params.sortOrder = options.sortOrder;
  if (options?.search) params.search = options.search;
  
  const response = await apiCall<{ result: any; status?: boolean }>(
    `/api/follow_list/${encodeURIComponent(address)}`, 
    { params, requiresAuth: true }
  );
  
  const raw: any = (response && typeof response === 'object' && 'result' in response)
    ? (response as any).result
    : response;

  let items: any[];
  let pagination: any;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.items)) {
    items = raw.items.map((entry: any) => entry.user || entry);
    pagination = raw.pagination;
  } else if (Array.isArray(raw)) {
    items = raw;
  } else {
    return { items: [] };
  }

  if (items.length === 0) {
    return { items: [], pagination };
  }

  if (typeof items[0] === 'string') {
    return { items: (items as string[]).map(addr => ({ address: addr.toLowerCase() })), pagination };
  }

  return { items: items as FollowListItem[], pagination };
}

export async function isFollowing(targetAddress: string): Promise<boolean> {
  const response = await apiCall<{ result: { isFollowing: boolean } } | { result: boolean } | boolean>("/api/is_following", {
    params: { target: targetAddress },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    const result = (response as any).result;
    if (typeof result === 'object' && 'isFollowing' in result) {
      return result.isFollowing;
    }
    return result;
  }
  return response as boolean;
}

export async function voteOnPost(params: {
  tokenId: number;
  voteType: 'for' | 'against';
}): Promise<VoteResponse> {
  const vote = params.voteType === 'for';
  // Backend returns 400 "Vote params is required" when body.vote is false (falsy check).
  // Send vote in query so the param is always present; body keeps boolean for API logic.
  const response = await apiCall<{ result: VoteResponse; success?: boolean } | VoteResponse>("/api/request_vote", {
    method: "POST",
    params: { vote: String(vote) },
    body: {
      streamTokenId: params.tokenId,
      vote,
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response && typeof response.result === 'object') {
    return response.result;
  }
  return response as VoteResponse;
}

export async function toggleFollow(params: {
  targetAddress: string;
}): Promise<FollowResponse> {
  const response = await apiCall<{ result: FollowResponse } | FollowResponse>("/api/request_follow", {
    method: "POST",
    body: {
      address: params.targetAddress.toLowerCase(),
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as FollowResponse;
}

export async function toggleCommentLike(params: {
  commentId: string;
}): Promise<CommentLikeResponse> {
  const response = await apiCall<{ result: CommentLikeResponse } | CommentLikeResponse>("/api/like_comment", {
    method: "POST",
    body: {
      commentId: params.commentId,
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as CommentLikeResponse;
}

// ============ Repost / Quote Post ============

export async function getUserReposts(address: string, page: number = 1, limit: number = 20): Promise<{ result: DeHubNFT[]; pagination?: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }> {
  return apiCall<{ result: DeHubNFT[]; pagination?: any }>("/api/reposts", {
    params: { address, page, limit },
  });
}

/**
 * Get list of users who reposted a specific post (by tokenId).
 * Backend shape is inconsistent across environments, so we try known variants.
 */
const normalizeReposter = (entry: any): FollowListItem => {
  const u = entry?.user || entry?.account || entry?.minterUser || entry?.creator || entry?.owner || entry;
  return {
    address:
      u?.address ||
      u?.walletAddress ||
      u?.wallet_address ||
      u?.minter ||
      entry?.address ||
      entry?.walletAddress ||
      entry?.wallet_address ||
      entry?.minter ||
      '',
    username: u?.username || u?.minterUsername || entry?.username || entry?.minterUsername || undefined,
    displayName:
      u?.displayName ||
      u?.display_name ||
      u?.minterDisplayName ||
      entry?.displayName ||
      entry?.display_name ||
      entry?.minterDisplayName ||
      undefined,
    avatarImageUrl:
      u?.avatarImageUrl ||
      u?.avatar_url ||
      u?.avatarUrl ||
      u?.minterAvatarUrl ||
      entry?.avatarImageUrl ||
      entry?.avatar_url ||
      entry?.avatarUrl ||
      entry?.minterAvatarUrl ||
      undefined,
    isVerified: !!(u?.isVerified ?? entry?.isVerified),
    isFollowing: !!(u?.isFollowing ?? entry?.isFollowing),
    followsYou: !!(u?.followsYou ?? entry?.followsYou),
  };
};

const dedupeReposters = (items: FollowListItem[]): FollowListItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.address) return false;
    const key = item.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractRepostersFromPayload = (payload: any): { items: FollowListItem[]; pagination?: any } => {
  const raw = payload && typeof payload === 'object' && 'result' in payload ? payload.result : payload;

  const candidates: any[] = [];
  if (Array.isArray(raw)) {
    candidates.push(...raw);
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.items)) candidates.push(...raw.items);

    // Common alternate shapes from nft_info / activity style responses
    const arrayKeys = ['reposters', 'repostedBy', 'repostUsers', 'latestReposters', 'users', 'accounts', 'reposts'];
    for (const key of arrayKeys) {
      if (Array.isArray((raw as any)[key])) {
        candidates.push(...(raw as any)[key]);
      }
    }

    if (raw.post && typeof raw.post === 'object') {
      for (const key of arrayKeys) {
        if (Array.isArray((raw.post as any)[key])) {
          candidates.push(...(raw.post as any)[key]);
        }
      }
    }
  }

  // Sometimes array entries are plain addresses
  const normalized = candidates.map((entry: any) => {
    if (typeof entry === 'string') {
      return { address: entry } as FollowListItem;
    }
    return normalizeReposter(entry);
  });

  return {
    items: dedupeReposters(normalized),
    pagination: raw?.pagination,
  };
};

export async function getPostReposters(
  tokenId: string | number,
  page: number = 1,
  limit: number = 50
): Promise<{ items: FollowListItem[]; pagination?: any }> {
  const tokenIdString = String(tokenId);

  // Try known endpoint variants first
  const attempts: Array<{ endpoint: string; params?: Record<string, string | number> }> = [
    { endpoint: '/api/reposts', params: { tokenId: tokenIdString, page, limit } },
    { endpoint: `/api/nft/${tokenIdString}/reposts`, params: { page, limit } },
    { endpoint: `/api/reposts/${tokenIdString}`, params: { page, limit } },
    { endpoint: '/api/reposters', params: { tokenId: tokenIdString, page, limit } },
  ];

  for (const attempt of attempts) {
    try {
      const response = await apiCall<any>(attempt.endpoint, { params: attempt.params });
      const parsed = extractRepostersFromPayload(response);
      if (parsed.items.length > 0) {
        return parsed;
      }
    } catch {
      // silently try next endpoint shape
    }
  }

  // Fallback: some deployments expose reposter details in nft_info
  try {
    const nftInfo = await apiCall<any>(`/api/nft_info/${tokenIdString}`);
    const parsed = extractRepostersFromPayload(nftInfo);
    if (parsed.items.length > 0) {
      return parsed;
    }
  } catch {
    // continue to notification fallback
  }

  // Final fallback: infer from notifications for this token (owner view)
  try {
    const notificationsResponse = await apiCall<any>('/api/notification', {
      params: { page: 1, limit: Math.max(100, limit), category: 'engagement' },
      requiresAuth: true,
    });

    const notifications = notificationsResponse && typeof notificationsResponse === 'object' && 'result' in notificationsResponse
      ? notificationsResponse.result
      : notificationsResponse;

    if (Array.isArray(notifications)) {
      const inferred = notifications
        .filter((n: any) => String(n?.tokenId ?? '') === tokenIdString)
        .filter((n: any) => {
          const type = String(n?.type ?? '').toLowerCase();
          const content = String(n?.content ?? '').toLowerCase();
          return type.includes('repost') || content.includes('repost');
        })
        .map((n: any) => normalizeReposter({
          address: n?.actorAddress || n?.actor?.address,
          username: n?.actorUsername || n?.actor?.username,
          displayName: n?.actor?.displayName || n?.actorUsername,
          avatarImageUrl: n?.actorAvatar || n?.actor?.avatarImageUrl || n?.actor?.avatarUrl,
        }));

      const deduped = dedupeReposters(inferred);
      if (deduped.length > 0) {
        return { items: deduped };
      }
    }
  } catch {
    // no-op
  }

  return { items: [] };
}

export async function repostPost(tokenId: number): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/repost", {
    method: "POST",
    body: { tokenId },
    requiresAuth: true,
  });
}

export interface QuotePostMintResponse {
  r: string;
  s: string;
  v: number;
  createdTokenId: string;
  timestamp: number;
  quotedTokenId: number;
  isQuotePost: boolean;
}

export async function quotePost(params: {
  quotedTokenId: number;
  content: string;
  category?: string;
}): Promise<QuotePostMintResponse> {
  const { DEHUB_API_BASE, getAuthToken } = await import('./core');
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  // Extract hashtags from content as augmented categories
  const hashtagRegex = /#([A-Za-z][A-Za-z0-9_]{0,49})/g;
  const extractedTags = Array.from(params.content.matchAll(hashtagRegex)).map(m => m[1]);
  const cleanContent = params.content.replace(hashtagRegex, '').replace(/\s{2,}/g, ' ').trim();
  const hashtagCategories = extractedTags.map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  const baseCategory = params.category || 'general';
  const mergedCategories = [...new Set([baseCategory, ...hashtagCategories])];

  const formData = new FormData();
  formData.append('quotedTokenId', String(params.quotedTokenId));
  formData.append('description', cleanContent);
  formData.append('postType', 'feed-simple');
  formData.append('category', JSON.stringify(mergedCategories));
  formData.append('chainId', '8453');
  formData.append('streamInfo', JSON.stringify({}));

  const response = await fetch(`${DEHUB_API_BASE}/api/quote_post`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Quote post failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data.result ?? data;
  
  // Validate mint signature
  if (!result.r || !result.s || !result.v || !result.createdTokenId) {
    throw new Error('Invalid mint signature from backend');
  }
  
  return result as QuotePostMintResponse;
}
