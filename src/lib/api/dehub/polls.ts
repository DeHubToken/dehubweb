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

// ─── Get Polls (batch) ────────────────────────────────────────────────

/** Upper bound the API enforces on one batch lookup. */
export const POLL_BATCH_LIMIT = 50;

/**
 * Polls for a whole page of cards, keyed by tokenId.
 *
 * Ids with no poll are absent from the result rather than reported — which is
 * the answer the caller needs, and a permanent one, since a poll can only be
 * attached when a post is created.
 */
export async function getPolls(
  tokenIds: number[],
): Promise<{ status: boolean; result: Record<string, DeHubPoll> }> {
  return apiCall(`/api/polls?tokenIds=${tokenIds.join(",")}`);
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
