/**
 * Followed hashtags API
 * =====================
 * The viewer's followed tags (dehub-stream-backend common/util/followed-tags).
 * A followed tag's posts join the Following feed; the server does that part.
 * Tags travel lowercase without the `#`.
 *
 * @module lib/api/dehub/followed-tags
 */
import { apiCall } from './core';

function unwrap<T>(response: any): T {
  if (response && response.status === false) throw new Error(response.error || 'Request failed');
  return (response?.result ?? response) as T;
}

export async function getFollowedTags(): Promise<string[]> {
  const list = unwrap<string[]>(await apiCall<any>('/api/followed-tags', { requiresAuth: true }));
  return Array.isArray(list) ? list : [];
}

export async function followTag(tag: string): Promise<void> {
  unwrap(await apiCall<any>('/api/followed-tags', { method: 'POST', body: { tag }, requiresAuth: true }));
}

export async function unfollowTag(tag: string): Promise<void> {
  unwrap(await apiCall<any>(`/api/followed-tags/${encodeURIComponent(tag)}`, { method: 'DELETE', requiresAuth: true }));
}
