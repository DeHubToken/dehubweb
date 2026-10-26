import { apiCall } from './core';

/** A post of yours still waiting for its time (GET /api/scheduled_posts). */
export interface ScheduledPost {
  tokenId: number;
  name?: string;
  description?: string;
  postType?: string;
  imageUrl?: string;
  imageUrls?: string[];
  scheduledAt: string;
}

export async function getMyScheduledPosts(): Promise<ScheduledPost[]> {
  const res = await apiCall<{ result: ScheduledPost[] }>('/api/scheduled_posts', { requiresAuth: true });
  return res?.result || [];
}

/** Move a scheduled post, or pass 'now' to publish it within a minute. */
export async function moveScheduledPost(tokenId: number, at: Date | 'now'): Promise<void> {
  await apiCall(`/api/scheduled_posts/${tokenId}`, {
    method: 'PATCH',
    body: { scheduledAt: at === 'now' ? 'now' : at.toISOString() },
    requiresAuth: true,
  });
}

export async function moveScheduledLive(streamId: string, at: Date): Promise<void> {
  await apiCall(`/api/scheduled_posts/live/${encodeURIComponent(streamId)}`, {
    method: 'PATCH',
    body: { scheduledAt: at.toISOString() },
    requiresAuth: true,
  });
}
