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
  // Backend expects JSON body with streamTokenId (number) and vote (boolean)
  const response = await apiCall<{ result: VoteResponse; success?: boolean } | VoteResponse>("/api/request_vote", {
    method: "POST",
    body: {
      streamTokenId: params.tokenId,
      vote: params.voteType === 'for',
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
 * Tries /api/reposts?tokenId=X — returns user account objects.
 */
export async function getPostReposters(
  tokenId: string | number,
  page: number = 1,
  limit: number = 50
): Promise<{ items: FollowListItem[]; pagination?: any }> {
  try {
    const response = await apiCall<{ result: any; status?: boolean }>("/api/reposts", {
      params: { tokenId, page, limit },
    });
    
    const raw: any = (response && typeof response === 'object' && 'result' in response)
      ? (response as any).result
      : response;

    console.log('[Reposters] raw API response for tokenId', tokenId, JSON.stringify(raw).slice(0, 2000));

    let entries: any[];
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.items)) {
      entries = raw.items;
    } else if (Array.isArray(raw)) {
      entries = raw;
    } else {
      console.log('[Reposters] unexpected shape, returning empty');
      return { items: [] };
    }

    // Each entry could be: a user object, an NFT object, or a wrapper with .user/.account
    const normalized: FollowListItem[] = entries.map((entry: any) => {
      // If there's a nested user/account object, prefer that
      const u = entry.user || entry.account || entry;
      return {
        // NFT objects use 'minter' for the wallet address
        address: u.address || u.walletAddress || u.minter || entry.minter || '',
        username: u.username || u.minterUsername || entry.minterUsername || undefined,
        displayName: u.displayName || u.display_name || u.minterDisplayName || entry.minterDisplayName || undefined,
        avatarImageUrl: u.avatarImageUrl || u.avatar_url || u.avatarUrl || entry.avatarImageUrl || undefined,
        isVerified: u.isVerified || false,
        isFollowing: u.isFollowing || false,
        followsYou: u.followsYou || false,
      };
    });

    // Dedupe by address (same user can have multiple repost entries)
    const seen = new Set<string>();
    const deduped = normalized.filter(i => {
      if (!i.address) return false;
      const key = i.address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log('[Reposters] normalized', deduped.length, 'unique reposters');
    return { items: deduped, pagination: raw?.pagination };
  } catch (err) {
    console.error('[Reposters] fetch error', err);
    return { items: [] };
  }
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
