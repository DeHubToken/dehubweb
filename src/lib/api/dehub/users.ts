import { DEHUB_API_BASE, apiCall, getAuthToken } from './core';
import type { DeHubUser, DeHubNFT, PaginatedResponse } from './types';
import type { ApiCommentResponse } from './comments';

export async function getAccountInfo(userId: string, address?: string): Promise<DeHubUser> {
  const params: Record<string, string> = {};
  if (address) {
    params.address = address;
  }
  const response = await apiCall<{ result: DeHubUser } | DeHubUser>(`/api/account_info/${encodeURIComponent(userId)}`, { params });
  if (response && typeof response === "object" && "result" in response) {
    return response.result;
  }
  return response as DeHubUser;
}

export async function getAccountByUsername(username: string, address?: string): Promise<DeHubUser> {
  const cleanUsername = username.replace("@", "");
  const params: Record<string, string> = {};
  if (address) {
    params.address = address;
  }
  const response = await apiCall<{ result: DeHubUser } | DeHubUser>(`/api/account_info/${encodeURIComponent(cleanUsername)}`, { params });
  if (response && typeof response === "object" && "result" in response) {
    return response.result;
  }
  return response as DeHubUser;
}

export interface UpdateProfileData {
  username?: string;
  displayName?: string;
  aboutMe?: string;
  hideFollowers?: boolean;
  isPrivate?: boolean;
  notificationPreferences?: string;
  twitterLink?: string;
  discordLink?: string;
  instagramLink?: string;
  tiktokLink?: string;
  telegramLink?: string;
  youtubeLink?: string;
  facebookLink?: string;
  customs?: Record<string, string>;
  dmSettings?: { disables?: string[]; minTipDhb?: number };
  avatarImg?: File;
  coverImg?: File;
}

export async function updateProfile(data: UpdateProfileData): Promise<{ result: boolean }> {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error("Authentication required");
  }

  const formData = new FormData();

  if (data.username !== undefined) formData.append("username", data.username);
  if (data.displayName !== undefined) formData.append("displayName", data.displayName);
  if (data.aboutMe !== undefined) formData.append("aboutMe", data.aboutMe);
  if (data.hideFollowers !== undefined) formData.append("hideFollowers", String(data.hideFollowers));
  if (data.isPrivate !== undefined) formData.append("isPrivate", String(data.isPrivate));
  if (data.notificationPreferences !== undefined) formData.append("notificationPreferences", data.notificationPreferences);
  if (data.twitterLink !== undefined) formData.append("twitterLink", data.twitterLink);
  if (data.discordLink !== undefined) formData.append("discordLink", data.discordLink);
  if (data.instagramLink !== undefined) formData.append("instagramLink", data.instagramLink);
  if (data.tiktokLink !== undefined) formData.append("tiktokLink", data.tiktokLink);
  if (data.telegramLink !== undefined) formData.append("telegramLink", data.telegramLink);
  if (data.youtubeLink !== undefined) formData.append("youtubeLink", data.youtubeLink);
  if (data.facebookLink !== undefined) formData.append("facebookLink", data.facebookLink);
  
  if (data.customs !== undefined) {
    formData.append("customs", JSON.stringify(data.customs));
  }
  if (data.dmSettings !== undefined) {
    formData.append("dmSettings", JSON.stringify(data.dmSettings));
  }

  if (data.avatarImg) formData.append("avatarImg", data.avatarImg);
  if (data.coverImg) formData.append("coverImg", data.coverImg);

  const response = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

export async function getUserNFTs(
  userId: string,
  page: number = 1,
  limit: number = 20,
): Promise<PaginatedResponse<DeHubNFT>> {
  return apiCall<PaginatedResponse<DeHubNFT>>(`/api/user/${userId}/nfts`, {
    params: { page, limit },
  });
}

export async function getUsersCount(): Promise<number> {
  const response = await apiCall<{ result: number } | number>("/api/users_count");
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as number;
}

export interface SearchUsersParams {
  q: string;
  page?: number;
  limit?: number;
}

export async function searchUsers(params: SearchUsersParams): Promise<PaginatedResponse<DeHubUser>> {
  const response = await apiCall<{ result: DeHubUser[] } | PaginatedResponse<DeHubUser>>("/api/users_search", {
    params: { q: params.q, page: params.page, limit: params.limit },
  });
  
  // API returns { result: [...] } but we need { data: [...] }
  if (response && typeof response === 'object' && 'result' in response && Array.isArray((response as any).result)) {
    const items = (response as any).result as DeHubUser[];
    return {
      data: items,
      total: items.length,
      page: params.page || 1,
      limit: params.limit || 10,
      has_more: items.length === (params.limit || 10),
    };
  }
  
  return response as PaginatedResponse<DeHubUser>;
}

export interface UserCommentsResponse {
  data: ApiCommentResponse[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export async function getUserComments(
  address: string,
  page: number = 1,
  limit: number = 20,
): Promise<UserCommentsResponse> {
  const response = await apiCall<any>(`/api/users/${encodeURIComponent(address)}/comments`, {
    params: { page, limit },
    requiresAuth: true,
  });
  // Normalize: API may return { result: { items, ... } } or { data, ... }
  if (response?.result?.items) {
    const items = response.result.items;
    const total = response.result.totalCount ?? response.result.total ?? response.result.count ?? items.length;
    return {
      data: items,
      total,
      page,
      limit,
      has_more: response.result.hasMore ?? (items.length >= limit),
    };
  }
  if (Array.isArray(response?.data)) {
    const res = response as UserCommentsResponse;
    // Ensure total is at least the length of returned data
    if (res.total === 0 && res.data.length > 0) {
      res.total = res.data.length;
    }
    return res;
  }
  return { data: [], total: 0, page, limit, has_more: false };
}

export interface SuggestedAccount {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  avatarImageUrl?: string;
  followers?: number;
  isFollowing?: boolean;
  badgeBalance?: number;
}

export async function getSuggestedAccounts(limit: number = 10, page: number = 1): Promise<{ items: SuggestedAccount[]; hasMore: boolean }> {
  const response = await apiCall<any>("/api/suggested-accounts", {
    params: { limit, page },
    requiresAuth: true,
  });
  
  // Handle various API response shapes defensively
  let items: unknown = response;
  let hasMore = false;
  
  // Unwrap { result: ... }
  if (response && typeof response === 'object' && 'result' in response) {
    items = response.result;
  }
  
  // Unwrap { items: [...], pagination: { ... } } (paginated response)
  if (items && typeof items === 'object' && !Array.isArray(items)) {
    const obj = items as any;
    if ('items' in obj) {
      // Check pagination metadata for hasMore
      if (obj.pagination) {
        const { page: currentPage, totalPages, total } = obj.pagination;
        hasMore = currentPage < totalPages || (obj.items?.length === limit);
      } else {
        hasMore = obj.items?.length === limit;
      }
      items = obj.items;
    }
  }
  
  if (Array.isArray(items)) {
    // If no pagination metadata, infer hasMore from batch size
    if (!hasMore && items.length === limit) {
      hasMore = true;
    }
    console.log(`[Suggestions] Got ${items.length} suggested accounts (page ${page}, hasMore: ${hasMore})`);
    return { items: (items as any[]).map((i: any) => ({ ...i, badgeBalance: i.badgeBalance ?? 0 })) as SuggestedAccount[], hasMore };
  }
  
  console.warn('[Suggestions] Unexpected response shape:', JSON.stringify(response).slice(0, 200));
  return { items: [], hasMore: false };
}

/**
 * Fetch cached suggested profiles for unauthenticated users.
 * These are pre-cached top active users from the leaderboard.
 */
export async function getCachedSuggestedProfiles(limit: number = 10, offset: number = 0): Promise<{ items: SuggestedAccount[]; hasMore: boolean }> {
  const { supabase } = await import('@/integrations/supabase/client');
  
  const { data, error } = await supabase
    .from('suggested_profiles_cache')
    .select('address, username, display_name, avatar_url, followers, badge_balance')
    .order('badge_balance', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.warn('[CachedSuggestions] Error:', error);
    return { items: [], hasMore: false };
  }

  const items: SuggestedAccount[] = (data || []).map((row: any) => ({
    address: row.address,
    username: row.username || undefined,
    displayName: row.display_name || row.username || undefined,
    avatarUrl: row.avatar_url || undefined,
    followers: row.followers || 0,
    isFollowing: false,
    badgeBalance: row.badge_balance || 0,
  }));

  return { items, hasMore: items.length === limit };
}
