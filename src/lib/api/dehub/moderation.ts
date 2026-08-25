import { apiCall } from './core';

/**
 * Appeals against moderation decisions.
 *
 * The decision arrives as a notification that says what happened and why, and
 * used to end by asking the creator to email support. An appeal now attaches
 * itself to that notification and becomes a tracked ticket, so it has a
 * reference number and an answer that comes back.
 */

export interface AppealResult {
  ref: string;
  status: string;
  /** Set when this decision had already been appealed — the original's reference. */
  duplicateOf: string | null;
}

export interface Appeal {
  ref: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  /** What the reviewer wrote back, once there is one. */
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  tokenId: number | null;
}

export async function appealModerationDecision(params: {
  notificationId: string;
  reason: string;
}): Promise<AppealResult> {
  const response = await apiCall<{ result: boolean; data: AppealResult }>('/api/moderation/appeal', {
    method: 'POST',
    body: { ...params },
    requiresAuth: true,
  });
  return response.data;
}

export async function getMyAppeals(): Promise<Appeal[]> {
  const response = await apiCall<{ result: boolean; data: Appeal[] }>('/api/moderation/appeals', {
    requiresAuth: true,
  });
  return response?.data ?? [];
}
