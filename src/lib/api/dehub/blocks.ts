import { apiCall } from './core';

export interface BlockedUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  blockedAt?: string;
}

export interface BlockStatusResponse {
  isBlocked: boolean;
  isBlockedBy: boolean;
}

export async function blockUser(address: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/block", {
    method: "POST",
    body: { address: address.toLowerCase() },
    requiresAuth: true,
  });
}

export async function unblockUser(address: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/block/${encodeURIComponent(address.toLowerCase())}`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

export async function getBlockList(): Promise<BlockedUser[]> {
  const response = await apiCall<{ result: BlockedUser[] } | BlockedUser[]>("/api/block", {
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as BlockedUser[];
}

export async function getBlockedBy(): Promise<BlockedUser[]> {
  const response = await apiCall<{ result: BlockedUser[] } | BlockedUser[]>("/api/block/blocked-by", {
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as BlockedUser[];
}

export async function getBlockStatus(address: string): Promise<BlockStatusResponse> {
  const response = await apiCall<any>(
    `/api/block/status/${encodeURIComponent(address.toLowerCase())}`,
    { requiresAuth: true }
  );
  // API returns { youBlocked, blockedYou, isBlocked } or wrapped in { result: ... }
  const data = response?.result ?? response;
  return {
    isBlocked: data?.youBlocked ?? data?.isBlocked ?? false,
    isBlockedBy: data?.blockedYou ?? data?.isBlockedBy ?? false,
  };
}
