import { apiCall } from './core';
import type { DeHubPin, PinUser, PaginationMeta } from './types';

// ─── Toggle Pin ───────────────────────────────────────────────────────

export async function togglePin(
  tokenId: number,
): Promise<{ status: boolean; pinned: boolean; message: string }> {
  return apiCall('/api/pin', {
    method: 'POST',
    body: { tokenId },
    requiresAuth: true,
  });
}

// ─── User Pins ────────────────────────────────────────────────────────

export async function getUserPins(
  address: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ status: boolean; result: DeHubPin[]; pagination: PaginationMeta }> {
  return apiCall('/api/pins', {
    params: { address, page, limit },
  });
}

// ─── Pin Count ────────────────────────────────────────────────────────

export async function getPinCount(
  tokenId: number,
): Promise<{ status: boolean; count: number }> {
  return apiCall('/api/pin/count', {
    params: { tokenId },
  });
}

// ─── Who Pinned ───────────────────────────────────────────────────────

export async function getPinners(
  tokenId: number,
  page: number = 1,
  limit: number = 20,
): Promise<{ status: boolean; result: PinUser[]; pagination: PaginationMeta }> {
  return apiCall('/api/pin/users', {
    params: { tokenId, page, limit },
  });
}
