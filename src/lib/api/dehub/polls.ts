import { apiCall } from './core';
import type { DeHubPoll } from './types';

// ─── Create Poll ──────────────────────────────────────────────────────

export async function createPoll(params: {
  tokenId: number;
  question: string;
  options: string[];
  expiresAt?: string;
  isMultipleChoice?: boolean;
}): Promise<{ status: boolean; result: DeHubPoll }> {
  return apiCall('/api/poll', {
    method: 'POST',
    body: params,
    requiresAuth: true,
  });
}

// ─── Get Poll ─────────────────────────────────────────────────────────

export async function getPoll(
  tokenId: number,
): Promise<{ status: boolean; result: DeHubPoll }> {
  return apiCall(`/api/poll/${tokenId}`);
}

// ─── Vote ─────────────────────────────────────────────────────────────

export async function voteOnPoll(
  tokenId: number,
  optionIndexes: number[],
): Promise<{ status: boolean; result: DeHubPoll }> {
  return apiCall(`/api/poll/${tokenId}/vote`, {
    method: 'POST',
    body: { optionIndexes },
    requiresAuth: true,
  });
}

// ─── Remove Vote ──────────────────────────────────────────────────────

export async function removePollVote(
  tokenId: number,
): Promise<{ status: boolean }> {
  return apiCall(`/api/poll/${tokenId}/vote`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

// ─── Close Poll ───────────────────────────────────────────────────────

export async function closePoll(
  tokenId: number,
): Promise<{ status: boolean }> {
  return apiCall(`/api/poll/${tokenId}/close`, {
    method: 'POST',
    requiresAuth: true,
  });
}
