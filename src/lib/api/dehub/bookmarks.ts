import { apiCall } from './core';
import type { BookmarkFolder, BookmarkFolderItem, DeHubNFT, PaginationMeta } from './types';

// ─── Folders ──────────────────────────────────────────────────────────

export async function createBookmarkFolder(params: {
  name: string;
  description?: string;
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
  params: { name?: string; description?: string; order?: number },
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
