import { DEHUB_API_BASE, apiCall, getAuthToken } from './core';
import type { DeHubUser, DeHubNFT, PaginatedResponse } from './types';

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
  return apiCall<PaginatedResponse<DeHubUser>>("/api/users_search", {
    params: { q: params.q, page: params.page, limit: params.limit },
  });
}

export async function getUserComments(
  address: string,
  page: number = 1,
  limit: number = 20,
): Promise<PaginatedResponse<unknown>> {
  return apiCall<PaginatedResponse<unknown>>(`/api/users/${encodeURIComponent(address)}/comments`, {
    params: { page, limit },
    requiresAuth: true,
  });
}

export interface SuggestedAccount {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  avatarImageUrl?: string;
  followers?: number;
  isFollowing?: boolean;
}

export async function getSuggestedAccounts(limit: number = 10): Promise<SuggestedAccount[]> {
  const response = await apiCall<{ result: SuggestedAccount[] } | SuggestedAccount[]>("/api/suggested-accounts", {
    params: { limit },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as SuggestedAccount[];
}
