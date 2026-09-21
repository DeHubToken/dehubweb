import { apiCall } from './core';
import type {
  BookmarkFolder,
  BookmarkFolderItem,
  PaginationMeta,
  PublicPlaylist,
  PublicPlaylistPage,
} from './types';

// ─── Folders ──────────────────────────────────────────────────────────

export async function createBookmarkFolder(params: {
  name: string;
  description?: string;
  isPublic?: boolean;
}): Promise<{ status: boolean; result: BookmarkFolder }> {
  return apiCall('/api/bookmark-folders', {
    method: 'POST',
    body: params,
    requiresAuth: true,
  });
}

export async function getBookmarkFolders(): Promise<{ status: boolean; result: BookmarkFolder[] }> {
  return apiCall('/api/bookmark-folders', { requiresAuth: true });
}

export async function updateBookmarkFolder(
  folderId: string,
  params: { name?: string; description?: string; order?: number; isPublic?: boolean },
): Promise<{ status: boolean; result: BookmarkFolder }> {
  return apiCall(`/api/bookmark-folders/${folderId}`, {
    method: 'PUT',
    body: params,
    requiresAuth: true,
  });
}

export async function deleteBookmarkFolder(folderId: string): Promise<{ status: boolean }> {
  return apiCall(`/api/bookmark-folders/${folderId}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

// ─── Folder Items ─────────────────────────────────────────────────────

export async function addItemToFolder(
  folderId: string,
  tokenId: number,
): Promise<{ status: boolean; result: BookmarkFolderItem }> {
  return apiCall(`/api/bookmark-folders/${folderId}/items`, {
    method: 'POST',
    body: { tokenId },
    requiresAuth: true,
  });
}

export async function addItemsToFolderBulk(
  folderId: string,
  tokenIds: number[],
): Promise<{ status: boolean }> {
  return apiCall(`/api/bookmark-folders/${folderId}/items/bulk`, {
    method: 'POST',
    body: { tokenIds },
    requiresAuth: true,
  });
}

export async function removeItemFromFolder(
  folderId: string,
  tokenId: number,
): Promise<{ status: boolean }> {
  return apiCall(`/api/bookmark-folders/${folderId}/items/${tokenId}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function getFolderItems(
  folderId: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ status: boolean; result: BookmarkFolderItem[]; pagination: PaginationMeta }> {
  return apiCall(`/api/bookmark-folders/${folderId}/items`, {
    params: { page, limit },
    requiresAuth: true,
  });
}

// ─── Public Playlists ─────────────────────────────────────────────────
// Read side of a folder the owner made public. No auth: these are the
// folders shown on the profile, and the server only ever answers with
// `isPublic` ones — a private folder is a 404 here even to its owner.

export async function getPublicPlaylists(
  address: string,
): Promise<{ status: boolean; address: string; result: PublicPlaylist[] }> {
  return apiCall(`/api/users/${encodeURIComponent(address)}/playlists`);
}

export async function getPublicPlaylistItems(
  address: string,
  playlistId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<PublicPlaylistPage> {
  const params: Record<string, string | number> = { limit: opts.limit ?? 20 };
  if (opts.cursor) params.cursor = opts.cursor;
  return apiCall(`/api/users/${encodeURIComponent(address)}/playlists/${encodeURIComponent(playlistId)}`, {
    params,
  });
}

/** The in-app path a public playlist is reachable at. */
export function publicPlaylistPath(handle: string, playlistId: string): string {
  return `/${encodeURIComponent(handle)}?tab=playlists&playlist=${encodeURIComponent(playlistId)}`;
}
