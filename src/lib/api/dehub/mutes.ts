/**
 * Mute API
 * ========
 * Muting is the quiet half of the pair that `blocks.ts` covers loudly. A mute
 * is one-way and private: the muted account's posts leave your feeds, your
 * posts still reach them, DMs are untouched, and they are never told.
 *
 * There is deliberately no "muted by" call and no `mutedYou` flag — exposing
 * either would make a private action detectable by its target.
 *
 * @module lib/api/dehub/mutes
 */
import { apiCall } from './core';

export interface MutedUser {
  muteId: string;
  address: string;
  username?: string | null;
  displayName?: string | null;
  avatarImageUrl?: string | null;
  mutedAt: string;
}

export interface MuteListResponse {
  status: boolean;
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: MutedUser[];
}

export interface MuteResult {
  status: boolean;
  message?: string;
  error?: string;
  muteId?: string;
  muted?: {
    address: string;
    username?: string | null;
    displayName?: string | null;
  };
  address?: string;
}

/** Mute a user. Idempotent — safe to call more than once. */
export async function muteUser(address: string): Promise<MuteResult> {
  const response = await apiCall<any>('/api/mute', {
    method: 'POST',
    body: { address: address.toLowerCase() },
    requiresAuth: true,
  });
  return response?.result ?? response;
}

/** Unmute a user. Returns 404 if there was no active mute. */
export async function unmuteUser(address: string): Promise<MuteResult> {
  const response = await apiCall<any>(
    `/api/mute/${encodeURIComponent(address.toLowerCase())}`,
    { method: 'DELETE', requiresAuth: true },
  );
  return response?.result ?? response;
}

/** Every account you have muted, flat — the shape the feed filter wants. */
export async function getMuteList(): Promise<MutedUser[]> {
  const response = await apiCall<any>('/api/mute?page=1&limit=50', {
    requiresAuth: true,
  });
  const data = response?.result ?? response;
  return data?.items ?? (Array.isArray(data) ? data : []);
}

/** Paginated, for the settings screen. */
export async function getMuteListPaginated(page = 1, limit = 20): Promise<MuteListResponse> {
  const response = await apiCall<any>(`/api/mute?page=${page}&limit=${limit}`, {
    requiresAuth: true,
  });
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
