import { apiCall } from './core';

export interface BlockedUser {
  blockId: string;
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  reason?: string;
  blockedAt?: string;
}

export interface BlockedByUser {
  blockId: string;
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  blockedAt?: string;
}

export interface BlockListResponse {
  status: boolean;
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: BlockedUser[];
}

export interface BlockedByResponse {
  status: boolean;
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: BlockedByUser[];
}

export interface BlockStatusResponse {
  isBlocked: boolean;
  isBlockedBy: boolean;
  youBlocked: boolean;
  blockedYou: boolean;
}

export interface BlockResult {
  status: boolean;
  message: string;
  blockId?: string;
  blocked?: {
    address: string;
    username?: string;
    displayName?: string;
  };
  address?: string; // for unblock
}

/**
 * Block a user. Idempotent — safe to call multiple times.
 */
export async function blockUser(address: string, reason?: string): Promise<BlockResult> {
  const body: Record<string, string> = { address: address.toLowerCase() };
  if (reason) body.reason = reason;
  
  const response = await apiCall<any>("/api/block", {
    method: "POST",
    body,
    requiresAuth: true,
  });
  return response?.result ?? response;
}

/**
 * Unblock a user. Returns 404 if no active block.
 */
export async function unblockUser(address: string): Promise<BlockResult> {
  const response = await apiCall<any>(
    `/api/block/${encodeURIComponent(address.toLowerCase())}`,
    { method: "DELETE", requiresAuth: true }
  );
  return response?.result ?? response;
}

/**
 * Get all blocked users as a flat array (for feed filtering, backward compat).
 */
export async function getBlockList(): Promise<BlockedUser[]> {
  const response = await apiCall<any>(
    `/api/block?page=1&limit=50`,
    { requiresAuth: true }
  );
  const data = response?.result ?? response;
  return data?.items ?? (Array.isArray(data) ? data : []);
}

/**
 * Get paginated list of users you have blocked (for settings UI).
 */
export async function getBlockListPaginated(page = 1, limit = 20): Promise<BlockListResponse> {
  const response = await apiCall<any>(
    `/api/block?page=${page}&limit=${limit}`,
    { requiresAuth: true }
  );
  const data = response?.result ?? response;
  return {
    status: data?.status ?? true,
    total: data?.total ?? 0,
    page: data?.page ?? page,
    limit: data?.limit ?? limit,
    pages: data?.pages ?? 0,
    items: data?.items ?? [],
  };
}

/**
 * Get paginated list of users who have blocked you.
 */
export async function getBlockedBy(page = 1, limit = 20): Promise<BlockedByResponse> {
  const response = await apiCall<any>(
    `/api/block/blocked-by?page=${page}&limit=${limit}`,
    { requiresAuth: true }
  );
  const data = response?.result ?? response;
  return {
    status: data?.status ?? true,
    total: data?.total ?? 0,
    page: data?.page ?? page,
    limit: data?.limit ?? limit,
    pages: data?.pages ?? 0,
    items: data?.items ?? [],
  };
}

/**
 * Check bidirectional block status between you and another user.
 */
export async function getBlockStatus(address: string): Promise<BlockStatusResponse> {
  const response = await apiCall<any>(
    `/api/block/status/${encodeURIComponent(address.toLowerCase())}`,
    { requiresAuth: true }
  );
  const data = response?.result ?? response;
  return {
    youBlocked: data?.youBlocked ?? false,
    blockedYou: data?.blockedYou ?? false,
    isBlocked: data?.isBlocked ?? false,
    isBlockedBy: data?.blockedYou ?? false,
  };
}
