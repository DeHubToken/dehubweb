import { apiCall } from './core';
import type { DeHubUser } from './types';

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
    method: "GET",
    params: { following: walletAddress },
    requiresAuth: true,
  });
}

export async function unfollowUser(walletAddress: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/request_follow", {
    method: "GET",
    params: { following: walletAddress, unFollowing: "true" },
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
    { params }
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
